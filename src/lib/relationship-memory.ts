import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  aiPersonSummaries,
  contactMethods,
  emailMessages,
  emailThreads,
  notes,
  people,
  personTags,
  personThreadLinks,
  syncRuns,
  tags,
} from "@/db/schema";
import type { ContactRow } from "@/types";
import type { SenderRecord } from "@/lib/gmail";
import { enqueuePersonSummaryTasks, enqueueThreadSummaryTasks } from "@/lib/ai-task-processor";
import { toCsv } from "@/lib/csv-export";

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function dateOrNull(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function titleFromEmail(email: string): string {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function importanceFor(contact: ContactRow | undefined, sender: SenderRecord): number {
  let score = Math.min(90, 35 + sender.totalEmails * 4);
  if (contact?.relationship_type === "professor") score += 15;
  if (contact?.relationship_type === "teaching_assistant") score += 10;
  if (contact?.tags?.some((tag) => ["mentor", "advisor", "research", "ta", "co-ta"].includes(tag))) score += 10;
  if (contact?.confidence === "high") score += 5;
  return Math.max(1, Math.min(100, score));
}

function nextFollowUp(lastContact: Date | null, importance: number): Date | null {
  if (!lastContact) return null;
  const days = importance >= 75 ? 45 : importance >= 55 ? 90 : 180;
  const due = new Date(lastContact);
  due.setDate(due.getDate() + days);
  return due;
}

async function upsertTag(userId: string, name: string) {
  const tagName = name.trim().toLowerCase();
  if (!tagName) return null;

  const [inserted] = await db
    .insert(tags)
    .values({ userId, name: tagName })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.userId, userId), eq(tags.name, tagName)))
    .limit(1);
  return existing ?? null;
}

export async function storeRelationshipMemory({
  userId,
  senders,
  contacts,
  storeRawBodies = true,
}: {
  userId: string;
  senders: SenderRecord[];
  contacts: ContactRow[];
  storeRawBodies?: boolean;
}): Promise<{ peopleCount: number; threadCount: number; messageCount: number; queuedTasks: number }> {
  const [syncRun] = await db
    .insert(syncRuns)
    .values({ userId, provider: "gmail", status: "processing" })
    .returning();

  let peopleCount = 0;
  let threadCount = 0;
  let messageCount = 0;
  const savedThreadIds = new Set<string>();
  const savedPersonIds = new Set<string>();

  try {
    const contactsByEmail = new Map(
      contacts.map((contact) => [normalizedEmail(contact.email), contact]),
    );

    for (const sender of senders) {
      const email = normalizedEmail(sender.email);
      const contact = contactsByEmail.get(email);
      const lastContactedAt = dateOrNull(contact?.last_contact) ?? dateOrNull(sender.lastContact);
      const importanceScore = importanceFor(contact, sender);
      const name = contact?.name || sender.name || titleFromEmail(email);

      const [person] = await db
        .insert(people)
        .values({
          userId,
          primaryEmail: email,
          name,
          relationshipType: contact?.relationship_type ?? "unknown",
          importanceScore,
          lastContactedAt,
          nextFollowUpAt: nextFollowUp(lastContactedAt, importanceScore),
          source: "gmail",
        })
        .onConflictDoUpdate({
          target: [people.userId, people.primaryEmail],
          set: {
            name,
            relationshipType: contact?.relationship_type ?? "unknown",
            importanceScore,
            lastContactedAt,
            nextFollowUpAt: nextFollowUp(lastContactedAt, importanceScore),
            updatedAt: new Date(),
          },
        })
        .returning();

      peopleCount++;
      savedPersonIds.add(person.id);

      await db
        .insert(contactMethods)
        .values({
          personId: person.id,
          type: "email",
          value: email,
          label: "Primary email",
          source: "gmail",
          isPrimary: true,
        })
        .onConflictDoNothing();

      for (const tag of contact?.tags ?? []) {
        const savedTag = await upsertTag(userId, tag);
        if (!savedTag) continue;
        await db
          .insert(personTags)
          .values({ personId: person.id, tagId: savedTag.id })
          .onConflictDoNothing();
      }

      for (const thread of sender.threads) {
        const [savedThread] = await db
          .insert(emailThreads)
          .values({
            userId,
            gmailThreadId: thread.threadId,
            subject: thread.subjectSnippet,
            snippet: thread.bodySnippets.find(Boolean) ?? null,
            participants: Array.from(
              new Set([
                email,
                ...thread.messages.flatMap((message) => [
                  normalizedEmail(message.senderEmail),
                  ...message.recipients.map(normalizedEmail),
                ]),
              ].filter(Boolean)),
            ),
            messageCount: thread.messageCount,
            userReplied: thread.userReplied,
            lastMessageAt: dateOrNull(thread.lastDate),
            rawStored: storeRawBodies,
          })
          .onConflictDoUpdate({
            target: [emailThreads.userId, emailThreads.gmailThreadId],
            set: {
              subject: thread.subjectSnippet,
              snippet: thread.bodySnippets.find(Boolean) ?? null,
              messageCount: thread.messageCount,
              userReplied: thread.userReplied,
              lastMessageAt: dateOrNull(thread.lastDate),
              rawStored: storeRawBodies,
              updatedAt: new Date(),
            },
          })
          .returning();

        threadCount++;
        savedThreadIds.add(savedThread.id);

        await db
          .insert(personThreadLinks)
          .values({ personId: person.id, threadId: savedThread.id })
          .onConflictDoNothing();

        for (const message of thread.messages) {
          await db
            .insert(emailMessages)
            .values({
              userId,
              threadId: savedThread.id,
              gmailMessageId: message.messageId,
              senderEmail: normalizedEmail(message.senderEmail),
              senderName: message.senderName,
              recipients: message.recipients.map(normalizedEmail),
              subject: message.subject,
              snippet: message.snippet,
              body: storeRawBodies ? message.body : null,
              sentAt: dateOrNull(message.sentAt),
            })
            .onConflictDoUpdate({
              target: [emailMessages.userId, emailMessages.gmailMessageId],
              set: {
                senderEmail: normalizedEmail(message.senderEmail),
                senderName: message.senderName,
                recipients: message.recipients.map(normalizedEmail),
                subject: message.subject,
                snippet: message.snippet,
                body: storeRawBodies ? message.body : null,
                sentAt: dateOrNull(message.sentAt),
              },
            });
          messageCount++;
        }
      }
    }

    await enqueueThreadSummaryTasks(userId, Array.from(savedThreadIds));
    await enqueuePersonSummaryTasks(userId, Array.from(savedPersonIds));

    await db
      .update(syncRuns)
      .set({
        status: "complete",
        completedAt: new Date(),
        stats: {
          peopleCount,
          threadCount,
          messageCount,
          queuedThreadSummaries: savedThreadIds.size,
          queuedPersonSummaries: savedPersonIds.size,
        },
      })
      .where(eq(syncRuns.id, syncRun.id));

    return {
      peopleCount,
      threadCount,
      messageCount,
      queuedTasks: savedThreadIds.size + savedPersonIds.size,
    };
  } catch (error) {
    await db
      .update(syncRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Relationship sync failed",
      })
      .where(eq(syncRuns.id, syncRun.id));
    throw error;
  }
}

export async function getLatestPersonSummary(personId: string) {
  const [summary] = await db
    .select()
    .from(aiPersonSummaries)
    .where(eq(aiPersonSummaries.personId, personId))
    .orderBy(desc(aiPersonSummaries.createdAt))
    .limit(1);
  return summary ?? null;
}

export async function getPersonNotes(personId: string) {
  return db
    .select()
    .from(notes)
    .where(eq(notes.personId, personId))
    .orderBy(desc(notes.createdAt));
}

export async function buildRelationshipMemoryCsv(userId: string): Promise<string> {
  const persons = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));
  const rows = [];

  for (const person of persons) {
    const [summary] = await db
      .select()
      .from(aiPersonSummaries)
      .where(eq(aiPersonSummaries.personId, person.id))
      .orderBy(desc(aiPersonSummaries.createdAt))
      .limit(1);

    rows.push({
      name: person.name,
      email: person.primaryEmail,
      phone: person.phone,
      linkedin_url: person.linkedInUrl,
      instagram_url: person.instagramUrl,
      relationship_type: person.relationshipType,
      review_status: person.reviewStatus,
      last_contacted_at: person.lastContactedAt,
      summary: summary?.summary,
      how_you_know_them: summary?.howYouKnowThem,
      why_they_matter: summary?.whyTheyMatter,
      notable_advice: summary?.notableAdvice,
      personal_details: summary?.personalDetails,
      open_loops: summary?.openLoops,
      mentor_signal_score: summary?.mentorSignalScore,
      needs_review: summary?.needsReview,
    });
  }

  return toCsv(
    [
      "name",
      "email",
      "phone",
      "linkedin_url",
      "instagram_url",
      "relationship_type",
      "review_status",
      "last_contacted_at",
      "summary",
      "how_you_know_them",
      "why_they_matter",
      "notable_advice",
      "personal_details",
      "open_loops",
      "mentor_signal_score",
      "needs_review",
    ],
    rows,
  );
}
