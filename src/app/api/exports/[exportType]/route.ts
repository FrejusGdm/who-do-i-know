import { NextResponse } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  aiPersonSummaries,
  aiThreadSummaries,
  contactMethods,
  emailMessages,
  emailThreads,
  notes,
  outreachTasks,
  people,
  personTags,
  personThreadLinks,
  tags,
} from "@/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { toCsv } from "@/lib/csv-export";

export const dynamic = "force-dynamic";

const EXPORTS = new Set([
  "contacts",
  "person_conversations",
  "emails",
  "threads",
  "thread_summaries",
  "person_summaries",
  "mentor_candidates",
  "outreach_queue",
  "manual_notes",
]);

const NO_EMAIL_DOMAIN = "no-email.local";

// Synthetic keys we generate for phone-only contacts should not leak into exports.
function displayEmail(email: string | null): string {
  if (!email) return "";
  return email.endsWith(`@${NO_EMAIL_DOMAIN}`) ? "" : email;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exportType: string }> },
) {
  try {
    const { session, error: authErr } = await requireSession();
    if (authErr) return authErr;

    const { exportType } = await params;
    if (!EXPORTS.has(exportType)) {
      return NextResponse.json({ error: "Unknown export type" }, { status: 404 });
    }

    const csv = await buildExport(exportType, session.user.id);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${exportType}.csv"`,
      },
    });
  } catch (error) {
    console.error("CSV export error:", error);
    return NextResponse.json({ error: "Failed to export CSV" }, { status: 500 });
  }
}

async function buildExport(exportType: string, userId: string): Promise<string> {
  if (exportType === "contacts") {
    const rows = await db
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));

    const [methods, personTagRows] = await Promise.all([
      db
        .select({ personId: contactMethods.personId, type: contactMethods.type, value: contactMethods.value })
        .from(contactMethods),
      db
        .select({ personId: personTags.personId, name: tags.name })
        .from(personTags)
        .innerJoin(tags, eq(personTags.tagId, tags.id)),
    ]);

    const emailsByPerson = new Map<string, Set<string>>();
    const phonesByPerson = new Map<string, Set<string>>();
    for (const method of methods) {
      const bucket = method.type === "phone" ? phonesByPerson : method.type === "email" ? emailsByPerson : null;
      if (!bucket) continue;
      const set = bucket.get(method.personId) ?? new Set<string>();
      set.add(method.value);
      bucket.set(method.personId, set);
    }
    const tagsByPerson = new Map<string, string[]>();
    for (const row of personTagRows) {
      const list = tagsByPerson.get(row.personId) ?? [];
      list.push(row.name);
      tagsByPerson.set(row.personId, list);
    }

    return toCsv(
      [
        "name",
        "email",
        "all_emails",
        "phone",
        "all_phones",
        "instagram_url",
        "linkedin_url",
        "twitter_url",
        "website_url",
        "organization",
        "role",
        "relationship_type",
        "review_status",
        "importance_score",
        "last_contacted_at",
        "next_follow_up_at",
        "source",
        "tags",
        "manual_notes",
      ],
      rows.map((person) => {
        const allEmails = Array.from(emailsByPerson.get(person.id) ?? [])
          .map((email) => displayEmail(email))
          .filter(Boolean);
        const allPhones = Array.from(phonesByPerson.get(person.id) ?? []);
        if (person.phone) allPhones.push(person.phone);
        return {
          name: person.name,
          email: displayEmail(person.primaryEmail),
          all_emails: Array.from(new Set(allEmails)).join("; "),
          phone: person.phone,
          all_phones: Array.from(new Set(allPhones)).join("; "),
          instagram_url: person.instagramUrl,
          linkedin_url: person.linkedInUrl,
          twitter_url: person.twitterUrl,
          website_url: person.websiteUrl,
          organization: person.organization,
          role: person.role,
          relationship_type: person.relationshipType,
          review_status: person.reviewStatus,
          importance_score: person.importanceScore,
          last_contacted_at: person.lastContactedAt,
          next_follow_up_at: person.nextFollowUpAt,
          source: person.source,
          tags: (tagsByPerson.get(person.id) ?? []).join("; "),
          manual_notes: person.manualNotes,
        };
      }),
    );
  }

  if (exportType === "person_conversations") {
    const persons = await db
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));

    const [links, threads, msgs] = await Promise.all([
      db
        .select({ personId: personThreadLinks.personId, threadId: personThreadLinks.threadId })
        .from(personThreadLinks),
      db.select().from(emailThreads).where(eq(emailThreads.userId, userId)),
      db.select().from(emailMessages).where(eq(emailMessages.userId, userId)),
    ]);

    const threadById = new Map(threads.map((thread) => [thread.id, thread]));
    const messagesByThread = new Map<string, typeof msgs>();
    for (const message of msgs) {
      const bucket = messagesByThread.get(message.threadId) ?? [];
      bucket.push(message);
      messagesByThread.set(message.threadId, bucket);
    }
    const threadIdsByPerson = new Map<string, string[]>();
    for (const link of links) {
      const list = threadIdsByPerson.get(link.personId) ?? [];
      list.push(link.threadId);
      threadIdsByPerson.set(link.personId, list);
    }

    const rows = persons.map((person) => {
      const threadIds = threadIdsByPerson.get(person.id) ?? [];
      const personThreads = threadIds.map((id) => threadById.get(id)).filter(Boolean);
      const subjects = new Set<string>();
      const snippets: string[] = [];
      let emailCount = 0;
      let first: Date | null = null;
      let last: Date | null = null;
      for (const thread of personThreads) {
        if (thread?.subject) subjects.add(thread.subject);
        const threadMessages = messagesByThread.get(thread!.id) ?? [];
        emailCount += threadMessages.length;
        for (const message of threadMessages) {
          if (message.snippet && snippets.length < 40) snippets.push(message.snippet);
          const sent = message.sentAt;
          if (sent) {
            if (!first || sent < first) first = sent;
            if (!last || sent > last) last = sent;
          }
        }
      }
      return {
        name: person.name,
        email: displayEmail(person.primaryEmail),
        organization: person.organization,
        relationship_type: person.relationshipType,
        importance_score: person.importanceScore,
        thread_count: personThreads.length,
        email_count: emailCount,
        first_contact: first,
        last_contact: last,
        thread_subjects: Array.from(subjects).slice(0, 30).join(" | "),
        snippets: snippets.join(" — "),
        manual_notes: person.manualNotes,
      };
    });

    return toCsv(
      [
        "name",
        "email",
        "organization",
        "relationship_type",
        "importance_score",
        "thread_count",
        "email_count",
        "first_contact",
        "last_contact",
        "thread_subjects",
        "snippets",
        "manual_notes",
      ],
      rows,
    );
  }

  if (exportType === "emails") {
    const rows = await db.select().from(emailMessages).where(eq(emailMessages.userId, userId));
    return toCsv(
      ["gmail_message_id", "sender_email", "sender_name", "recipients", "subject", "sent_at", "snippet"],
      rows.map((message) => ({
        gmail_message_id: message.gmailMessageId,
        sender_email: message.senderEmail,
        sender_name: message.senderName,
        recipients: message.recipients,
        subject: message.subject,
        sent_at: message.sentAt,
        snippet: message.snippet,
      })),
    );
  }

  if (exportType === "threads") {
    const rows = await db.select().from(emailThreads).where(eq(emailThreads.userId, userId));
    return toCsv(
      ["gmail_thread_id", "subject", "participants", "message_count", "user_replied", "last_message_at", "snippet"],
      rows.map((thread) => ({
        gmail_thread_id: thread.gmailThreadId,
        subject: thread.subject,
        participants: thread.participants,
        message_count: thread.messageCount,
        user_replied: thread.userReplied,
        last_message_at: thread.lastMessageAt,
        snippet: thread.snippet,
      })),
    );
  }

  if (exportType === "thread_summaries") {
    const threads = await db.select().from(emailThreads).where(eq(emailThreads.userId, userId));
    const rows = [];
    for (const thread of threads) {
      const [summary] = await db
        .select()
        .from(aiThreadSummaries)
        .where(eq(aiThreadSummaries.threadId, thread.id))
        .orderBy(desc(aiThreadSummaries.createdAt))
        .limit(1);
      rows.push({
        gmail_thread_id: thread.gmailThreadId,
        subject: thread.subject,
        summary: summary?.summary,
        topics: summary?.topics,
        decisions: summary?.decisions,
        personal_details: summary?.personalDetails,
        follow_up_signals: summary?.followUpSignals,
        relationship_evidence: summary?.relationshipEvidence,
        confidence: summary?.confidence,
      });
    }
    return toCsv(
      [
        "gmail_thread_id",
        "subject",
        "summary",
        "topics",
        "decisions",
        "personal_details",
        "follow_up_signals",
        "relationship_evidence",
        "confidence",
      ],
      rows,
    );
  }

  if (exportType === "person_summaries") {
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
        relationship_type: person.relationshipType,
        review_status: person.reviewStatus,
        summary: summary?.summary,
        how_you_know_them: summary?.howYouKnowThem,
        why_they_matter: summary?.whyTheyMatter,
        notable_advice: summary?.notableAdvice,
        personal_details: summary?.personalDetails,
        open_loops: summary?.openLoops,
        mentor_signal_score: summary?.mentorSignalScore,
        mentor_signal_evidence: summary?.mentorSignalEvidence,
        needs_review: summary?.needsReview,
        classification: summary?.classification,
      });
    }
    return toCsv(
      [
        "name",
        "email",
        "relationship_type",
        "review_status",
        "summary",
        "how_you_know_them",
        "why_they_matter",
        "notable_advice",
        "personal_details",
        "open_loops",
        "mentor_signal_score",
        "mentor_signal_evidence",
        "needs_review",
        "classification",
      ],
      rows,
    );
  }

  if (exportType === "mentor_candidates" || exportType === "outreach_queue") {
    const tasks = await db
      .select()
      .from(outreachTasks)
      .where(eq(outreachTasks.userId, userId))
      .orderBy(desc(outreachTasks.priority));
    const persons = await db
      .select()
      .from(people)
      .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));
    const byId = new Map(persons.map((person) => [person.id, person]));
    const rows = [];
    for (const task of tasks) {
      const person = byId.get(task.personId);
      if (!person) continue;
      if (task.status !== "confirmed" && !(person.relationshipType === "mentor" && person.reviewStatus === "confirmed")) continue;
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
        mentor_signal_score: task.priority,
        summary: summary?.summary,
        why_they_matter: summary?.whyTheyMatter,
        evidence: summary?.mentorSignalEvidence?.length ? summary.mentorSignalEvidence : task.reason,
        manual_notes: person.manualNotes,
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
        "mentor_signal_score",
        "summary",
        "why_they_matter",
        "evidence",
        "manual_notes",
      ],
      rows,
    );
  }

  const rows = await db.select().from(notes).where(eq(notes.userId, userId));
  const persons = await db
    .select()
    .from(people)
    .where(and(eq(people.userId, userId), ne(people.reviewStatus, "archived")));
  const byId = new Map(persons.map((person) => [person.id, person]));
  return toCsv(
    ["name", "email", "note", "tags", "follow_up_reason", "created_at"],
    rows.map((note) => {
      const person = byId.get(note.personId);
      if (!person) return null;
      return {
        name: person.name,
        email: person.primaryEmail,
        note: note.body,
        tags: note.tags,
        follow_up_reason: note.followUpReason,
        created_at: note.createdAt,
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null),
  );
}
