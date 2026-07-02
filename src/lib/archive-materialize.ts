import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  contactMethods,
  emailMessages,
  emailThreads,
  googleArchiveJobs,
  googleMailMessages,
  googlePeopleContacts,
  people,
  personThreadLinks,
  user,
} from "@/db/schema";
import { isLikelyAutomatedAddress } from "@/lib/gmail";

export interface MaterializeStats {
  ownAddresses: string[];
  peopleFromContacts: number;
  peopleFromEmail: number;
  totalPeople: number;
  threads: number;
  messages: number;
}

const NO_EMAIL_DOMAIN = "no-email.local";

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function titleFromEmail(email: string): string {
  return email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function laterDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

interface Correspondent {
  email: string;
  name: string | null;
  count: number;
  lastContact: Date | null;
}

/**
 * Rebuilds the people / relationship tables from an already-downloaded Google archive
 * (googleMailMessages + googlePeopleContacts). This is the completeness path: it operates
 * entirely on local DB rows, so it is not subject to Gmail API caps or serverless timeouts.
 *
 * Scope decisions (from product direction):
 * - Real people only: automated / no-reply / newsletter senders are skipped.
 * - All saved Google Contacts are kept; auto-collected "other" contacts are automated-filtered.
 * - Phone-only / email-less contacts are still captured via a synthetic `@no-email.local` key.
 */
export async function materializeArchiveMemory(userId: string): Promise<MaterializeStats> {
  const ownSet = await resolveOwnAddresses(userId);
  // primaryEmail -> people.id, populated as we upsert so later steps avoid re-querying.
  const idByEmail = new Map<string, string>();

  const messages = await db
    .select()
    .from(googleMailMessages)
    .where(eq(googleMailMessages.userId, userId));

  // --- 1. Aggregate human correspondents from mail --------------------------------------
  const correspondents = new Map<string, Correspondent>();
  for (const message of messages) {
    const sender = normalizeEmail(message.senderEmail);
    const outgoing = Boolean(sender) && ownSet.has(sender);

    // Incoming: the sender is the correspondent. Outgoing: the people you chose to email.
    // We intentionally do NOT pull co-recipients of incoming mail (avoids newsletter crowds).
    const parties: { email: string; name: string | null }[] = [];
    if (outgoing) {
      for (const recipient of message.recipients ?? []) {
        parties.push({ email: normalizeEmail(recipient), name: null });
      }
    } else if (sender) {
      parties.push({ email: sender, name: message.senderName ?? null });
    }

    for (const party of parties) {
      const email = party.email;
      if (!email || ownSet.has(email) || isLikelyAutomatedAddress(email)) continue;
      const existing = correspondents.get(email) ?? { email, name: null, count: 0, lastContact: null };
      existing.count += 1;
      if (party.name && !existing.name) existing.name = party.name;
      existing.lastContact = laterDate(existing.lastContact, message.internalDate ?? null);
      correspondents.set(email, existing);
    }
  }

  // --- 2. Upsert email-derived people (don't clobber a better contact name) -------------
  let peopleFromEmail = 0;
  for (const person of correspondents.values()) {
    const name = person.name || titleFromEmail(person.email) || person.email;
    const importanceScore = Math.max(1, Math.min(90, 35 + person.count * 4));
    const [row] = await db
      .insert(people)
      .values({
        userId,
        primaryEmail: person.email,
        name,
        importanceScore,
        lastContactedAt: person.lastContact,
        source: "gmail",
      })
      .onConflictDoUpdate({
        target: [people.userId, people.primaryEmail],
        set: {
          importanceScore,
          lastContactedAt: person.lastContact,
          updatedAt: new Date(),
        },
      })
      .returning({ id: people.id });
    idByEmail.set(person.email, row.id);
    peopleFromEmail += 1;
    await insertContactMethod(row.id, "email", person.email, "gmail", true);
  }

  // --- 3. Upsert Google Contacts (authoritative for name/org/phone) ---------------------
  const contacts = await db
    .select()
    .from(googlePeopleContacts)
    .where(eq(googlePeopleContacts.userId, userId));

  let peopleFromContacts = 0;
  for (const contact of contacts) {
    const emails = (contact.emailAddresses ?? []).map(normalizeEmail).filter(Boolean);
    const phones = (contact.phoneNumbers ?? []).map((value) => value.trim()).filter(Boolean);
    const contactName = (contact.names ?? []).find(Boolean) ?? null;
    const organization = (contact.organizations ?? []).find(Boolean) ?? null;
    const isOther = contact.sourceType === "other_contact";

    // Auto-collected contacts can be automated addresses; saved connections are kept as-is.
    const humanEmails = isOther ? emails.filter((email) => !isLikelyAutomatedAddress(email)) : emails;

    let primaryEmail: string;
    if (humanEmails.length) {
      primaryEmail = humanEmails[0];
    } else if (emails.length && !isOther) {
      primaryEmail = emails[0];
    } else if (phones.length || contactName) {
      // Phone-only / name-only contact — keep them via a stable synthetic key.
      primaryEmail = `contact+${createHash("sha1").update(contact.resourceName).digest("hex")}@${NO_EMAIL_DOMAIN}`;
    } else {
      continue;
    }

    const name = contactName || (primaryEmail.endsWith(`@${NO_EMAIL_DOMAIN}`) ? null : titleFromEmail(primaryEmail));
    if (!name) continue;

    const setObj: Record<string, unknown> = {
      name,
      source: "google_contacts",
      updatedAt: new Date(),
    };
    if (organization) setObj.organization = organization;
    if (phones[0]) setObj.phone = phones[0];

    const [row] = await db
      .insert(people)
      .values({
        userId,
        primaryEmail,
        name,
        organization,
        phone: phones[0] ?? null,
        source: "google_contacts",
      })
      .onConflictDoUpdate({
        target: [people.userId, people.primaryEmail],
        set: setObj,
      })
      .returning({ id: people.id });
    idByEmail.set(primaryEmail, row.id);
    peopleFromContacts += 1;

    const emailList = humanEmails.length ? humanEmails : emails;
    for (const email of emailList) {
      await insertContactMethod(row.id, "email", email, "google_contacts", email === primaryEmail);
    }
    for (const phone of phones) {
      await insertContactMethod(row.id, "phone", phone, "google_contacts", false);
    }
  }

  // --- 4. Rebuild threads / messages / person links from mail ---------------------------
  const byThread = new Map<string, typeof messages>();
  for (const message of messages) {
    const key = message.gmailThreadId ?? message.gmailMessageId;
    const bucket = byThread.get(key);
    if (bucket) bucket.push(message);
    else byThread.set(key, [message]);
  }

  let threadCount = 0;
  let messageCount = 0;
  for (const [gmailThreadId, threadMessages] of byThread) {
    threadMessages.sort(
      (a, b) => (a.internalDate?.getTime() ?? 0) - (b.internalDate?.getTime() ?? 0),
    );

    const participants = new Set<string>();
    let lastMessageAt: Date | null = null;
    let userReplied = false;
    for (const message of threadMessages) {
      const sender = normalizeEmail(message.senderEmail);
      if (sender) participants.add(sender);
      if (sender && ownSet.has(sender)) userReplied = true;
      for (const recipient of message.recipients ?? []) {
        const email = normalizeEmail(recipient);
        if (email) participants.add(email);
      }
      lastMessageAt = laterDate(lastMessageAt, message.internalDate ?? null);
    }

    const subject = threadMessages.find((m) => m.subject)?.subject ?? null;
    const snippet = threadMessages.find((m) => m.snippet)?.snippet ?? null;

    const [thread] = await db
      .insert(emailThreads)
      .values({
        userId,
        gmailThreadId,
        subject,
        snippet,
        participants: Array.from(participants),
        messageCount: threadMessages.length,
        userReplied,
        lastMessageAt,
        rawStored: false,
      })
      .onConflictDoUpdate({
        target: [emailThreads.userId, emailThreads.gmailThreadId],
        set: {
          subject,
          snippet,
          participants: Array.from(participants),
          messageCount: threadMessages.length,
          userReplied,
          lastMessageAt,
          updatedAt: new Date(),
        },
      })
      .returning({ id: emailThreads.id });
    threadCount += 1;

    for (const message of threadMessages) {
      const recipients = (message.recipients ?? []).map(normalizeEmail).filter(Boolean);
      await db
        .insert(emailMessages)
        .values({
          userId,
          threadId: thread.id,
          gmailMessageId: message.gmailMessageId,
          senderEmail: normalizeEmail(message.senderEmail) || "unknown@unknown",
          senderName: message.senderName,
          recipients,
          subject: message.subject,
          snippet: message.snippet,
          body: message.bodyText || null,
          sentAt: message.internalDate ?? null,
        })
        .onConflictDoUpdate({
          target: [emailMessages.userId, emailMessages.gmailMessageId],
          set: {
            threadId: thread.id,
            senderEmail: normalizeEmail(message.senderEmail) || "unknown@unknown",
            senderName: message.senderName,
            recipients,
            subject: message.subject,
            snippet: message.snippet,
            body: message.bodyText || null,
            sentAt: message.internalDate ?? null,
          },
        });
      messageCount += 1;
    }

    // Link the human correspondents of this thread to it.
    const linkEmails = new Set<string>();
    for (const message of threadMessages) {
      const sender = normalizeEmail(message.senderEmail);
      if (sender && ownSet.has(sender)) {
        for (const recipient of message.recipients ?? []) {
          const email = normalizeEmail(recipient);
          if (email && !ownSet.has(email) && !isLikelyAutomatedAddress(email)) linkEmails.add(email);
        }
      } else if (sender && !ownSet.has(sender) && !isLikelyAutomatedAddress(sender)) {
        linkEmails.add(sender);
      }
    }
    for (const email of linkEmails) {
      const personId = idByEmail.get(email);
      if (!personId) continue;
      await db
        .insert(personThreadLinks)
        .values({ personId, threadId: thread.id })
        .onConflictDoNothing();
    }
  }

  return {
    ownAddresses: Array.from(ownSet),
    peopleFromContacts,
    peopleFromEmail,
    totalPeople: idByEmail.size,
    threads: threadCount,
    messages: messageCount,
  };
}

async function insertContactMethod(
  personId: string,
  type: "email" | "phone",
  value: string,
  source: string,
  isPrimary: boolean,
) {
  await db
    .insert(contactMethods)
    .values({ personId, type, value, source, isPrimary })
    .onConflictDoNothing();
}

async function resolveOwnAddresses(userId: string): Promise<Set<string>> {
  const ownSet = new Set<string>();
  const [account] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  if (account?.email) ownSet.add(normalizeEmail(account.email));
  const jobs = await db
    .select({ email: googleArchiveJobs.googleEmail })
    .from(googleArchiveJobs)
    .where(eq(googleArchiveJobs.userId, userId));
  for (const job of jobs) {
    if (job.email) ownSet.add(normalizeEmail(job.email));
  }
  return ownSet;
}
