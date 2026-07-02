import { createHash } from "crypto";
import { createWriteStream } from "fs";
import { appendFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { gmail_v1, google, people_v1 } from "googleapis";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  googleArchiveJobs,
  googleMailAttachments,
  googleMailMessages,
  googlePeopleContacts,
} from "@/db/schema";
import { getGoogleOAuthClientForUser } from "@/lib/google-token";
import { materializeArchiveMemory } from "@/lib/archive-materialize";

type GmailMessage = gmail_v1.Schema$Message;
type GmailPart = gmail_v1.Schema$MessagePart;
type PeoplePerson = people_v1.Schema$Person;

const GMAIL_PAGE_SIZE = 500;
const PEOPLE_PAGE_SIZE = 1000;
const GMAIL_BATCH_SIZE = 5;
const ARCHIVE_ROOT = process.env.GOOGLE_ARCHIVE_DIR ?? path.join(process.cwd(), "google-archives");
const PEOPLE_FIELDS = [
  "names",
  "emailAddresses",
  "phoneNumbers",
  "organizations",
  "urls",
  "biographies",
  "birthdays",
  "metadata",
  "photos",
  "userDefined",
].join(",");
const OTHER_CONTACTS_MASK = ["names", "emailAddresses", "phoneNumbers", "metadata", "photos"].join(",");

export interface ArchiveJobSnapshot {
  id: string;
  status: string;
  mode: string;
  googleEmail: string | null;
  localFolderPath: string | null;
  messageCountEstimate: number;
  estimatedBytes: number;
  messagesSeen: number;
  messagesArchived: number;
  attachmentsArchived: number;
  contactsArchived: number;
  otherContactsArchived: number;
  bytesArchived: number;
  failureCount: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  stats: Record<string, unknown>;
}

interface AttachmentRef {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function safeFilename(value: string): string {
  const cleaned = value.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return cleaned || "attachment";
}

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function parseHeaderMap(message: GmailMessage): Record<string, string> {
  const headers = message.payload?.headers ?? [];
  const mapped: Record<string, string> = {};
  for (const header of headers) {
    if (header.name && typeof header.value === "string") mapped[header.name] = header.value;
  }
  return mapped;
}

function parseEmailAddress(raw = ""): { name: string | null; email: string | null } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim() || null,
      email: match[2].trim().toLowerCase() || null,
    };
  }
  const email = raw.trim().toLowerCase();
  return { name: null, email: email.includes("@") ? email : null };
}

function parseAddressList(raw = ""): string[] {
  if (!raw) return [];
  return raw
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((value) => parseEmailAddress(value.trim()).email)
    .filter((value): value is string => Boolean(value));
}

function dateFromInternalDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractBodyText(part?: GmailPart | null): string {
  if (!part) return "";
  if (part.body?.data) {
    const decoded = base64UrlToBuffer(part.body.data).toString("utf8");
    if (part.mimeType === "text/html") return stripHtml(decoded);
    if (part.mimeType === "text/plain") return decoded.trim();
  }

  for (const child of part.parts ?? []) {
    const text = extractBodyText(child);
    if (text) return text;
  }

  return "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectAttachments(part?: GmailPart | null, refs: AttachmentRef[] = []): AttachmentRef[] {
  if (!part) return refs;
  const attachmentId = part.body?.attachmentId;
  if (attachmentId) {
    refs.push({
      attachmentId,
      filename: part.filename ?? "",
      mimeType: part.mimeType ?? "",
      size: part.body?.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, refs);
  return refs;
}

function normalizePerson(person: PeoplePerson) {
  return {
    names: (person.names ?? [])
      .map((name) => name.displayName ?? name.unstructuredName ?? [name.givenName, name.familyName].filter(Boolean).join(" "))
      .filter((value): value is string => Boolean(value)),
    emailAddresses: (person.emailAddresses ?? []).map((email) => email.value).filter((value): value is string => Boolean(value)),
    phoneNumbers: (person.phoneNumbers ?? [])
      .map((phone) => phone.canonicalForm ?? phone.value)
      .filter((value): value is string => Boolean(value)),
    organizations: (person.organizations ?? [])
      .map((org) => [org.name, org.title].filter(Boolean).join(" - "))
      .filter((value): value is string => Boolean(value)),
  };
}

function serializeForMbox(rawMime: string, headers: Record<string, string>): string {
  const from = parseEmailAddress(headers.From).email ?? "unknown@example.com";
  const date = headers.Date ? new Date(headers.Date) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const escaped = rawMime.replace(/^From /gm, ">From ");
  return `From ${from} ${safeDate.toUTCString()}\n${escaped}\n\n`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status;
      if (![403, 429, 500, 502, 503, 504].includes(Number(status)) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** attempt));
    }
  }
  throw lastError;
}

export async function getLatestArchiveJob(userId: string): Promise<ArchiveJobSnapshot | null> {
  const [job] = await db
    .select()
    .from(googleArchiveJobs)
    .where(eq(googleArchiveJobs.userId, userId))
    .orderBy(desc(googleArchiveJobs.createdAt))
    .limit(1);
  return job ?? null;
}

export async function getArchiveJobForUser(jobId: string, userId: string): Promise<ArchiveJobSnapshot | null> {
  const [job] = await db
    .select()
    .from(googleArchiveJobs)
    .where(eq(googleArchiveJobs.id, jobId))
    .limit(1);
  if (!job || job.userId !== userId) return null;
  return job;
}

export async function estimateGoogleArchive(userId: string): Promise<ArchiveJobSnapshot> {
  const auth = await getGoogleOAuthClientForUser(userId);
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });

  const [job] = await db
    .insert(googleArchiveJobs)
    .values({
      userId,
      googleEmail: profile.data.emailAddress ?? null,
      status: "estimating",
      mode: "estimate",
      startedAt: new Date(),
    })
    .returning();

  let pageToken: string | undefined;
  let messagesSeen = 0;
  let estimatedBytes = 0;
  let attachmentsEstimated = 0;
  let messageCountEstimate = 0;

  try {
    do {
      const list = await withRetry(() =>
        gmail.users.messages.list({
          userId: "me",
          maxResults: GMAIL_PAGE_SIZE,
          includeSpamTrash: true,
          pageToken,
        }),
      );
      pageToken = list.data.nextPageToken ?? undefined;
      messageCountEstimate = list.data.resultSizeEstimate ?? messageCountEstimate;
      const messages = list.data.messages ?? [];

      const metas = await mapWithConcurrency(messages, GMAIL_BATCH_SIZE, async (message) => {
        if (!message.id) return null;
        return withRetry(() =>
          gmail.users.messages.get({
            userId: "me",
            id: message.id!,
            format: "metadata",
            metadataHeaders: ["From", "To", "Cc", "Bcc", "Subject", "Date"],
          }),
        );
      });

      for (const meta of metas) {
        if (!meta?.data) continue;
        messagesSeen++;
        estimatedBytes += meta.data.sizeEstimate ?? 0;
        attachmentsEstimated += collectAttachments(meta.data.payload).length;
      }

      await db
        .update(googleArchiveJobs)
        .set({
          messageCountEstimate,
          estimatedBytes,
          messagesSeen,
          checkpoint: { pageToken },
          stats: { attachmentsEstimated },
          updatedAt: new Date(),
        })
        .where(eq(googleArchiveJobs.id, job.id));
    } while (pageToken);

    const [updated] = await db
      .update(googleArchiveJobs)
      .set({
        status: "estimated",
        completedAt: new Date(),
        checkpoint: {},
        stats: { attachmentsEstimated },
        updatedAt: new Date(),
      })
      .where(eq(googleArchiveJobs.id, job.id))
      .returning();
    return updated;
  } catch (error) {
    const [failed] = await db
      .update(googleArchiveJobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Archive estimate failed",
        updatedAt: new Date(),
      })
      .where(eq(googleArchiveJobs.id, job.id))
      .returning();
    return failed;
  }
}

async function prepareArchiveFolder(jobId: string) {
  const root = path.join(ARCHIVE_ROOT, jobId);
  const gmailDir = path.join(root, "gmail");
  const peopleDir = path.join(root, "people");
  const attachmentDir = path.join(gmailDir, "attachments");
  await mkdir(attachmentDir, { recursive: true });
  await mkdir(peopleDir, { recursive: true });
  await writeFile(path.join(gmailDir, "messages.mbox"), "");
  await writeFile(path.join(gmailDir, "messages.jsonl"), "");
  await writeFile(path.join(gmailDir, "attachments.jsonl"), "");
  await writeFile(path.join(peopleDir, "connections.jsonl"), "");
  await writeFile(path.join(peopleDir, "other-contacts.jsonl"), "");
  return { root, gmailDir, peopleDir, attachmentDir };
}

export async function startGoogleArchive(
  userId: string,
  mode: "archive" | "light" = "archive",
): Promise<ArchiveJobSnapshot> {
  const auth = await getGoogleOAuthClientForUser(userId);
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });

  const [job] = await db
    .insert(googleArchiveJobs)
    .values({
      userId,
      googleEmail: profile.data.emailAddress ?? null,
      status: "pending",
      mode,
      messageCountEstimate: profile.data.messagesTotal ?? 0,
      startedAt: new Date(),
    })
    .returning();

  const folders = await prepareArchiveFolder(job.id);

  const [updated] = await db
    .update(googleArchiveJobs)
    .set({
      status: "running",
      localFolderPath: folders.root,
      updatedAt: new Date(),
    })
    .where(eq(googleArchiveJobs.id, job.id))
    .returning();

  return updated;
}

export async function runGoogleArchive(jobId: string, userId: string): Promise<void> {
  const auth = await getGoogleOAuthClientForUser(userId);
  const gmail = google.gmail({ version: "v1", auth });
  const peopleApi = google.people({ version: "v1", auth });
  const job = await getArchiveJobForUser(jobId, userId);
  if (!job?.localFolderPath) throw new Error("Archive job does not have a local folder.");

  // Light mode fetches header metadata only (no raw MIME, bodies, or attachments).
  // It is far faster and lighter, and still captures everything needed to build the
  // people/relationship tables and per-person conversation context.
  const light = job.mode === "light";

  const gmailDir = path.join(job.localFolderPath, "gmail");
  const peopleDir = path.join(job.localFolderPath, "people");
  const attachmentDir = path.join(gmailDir, "attachments");
  const mboxPath = path.join(gmailDir, "messages.mbox");
  const messagesPath = path.join(gmailDir, "messages.jsonl");
  const attachmentsPath = path.join(gmailDir, "attachments.jsonl");
  const mboxStream = createWriteStream(mboxPath, { flags: "a" });

  let pageToken: string | undefined;
  let messagesSeen = 0;
  let messagesArchived = 0;
  let attachmentsArchived = 0;
  let bytesArchived = 0;
  let failureCount = 0;

  try {
    do {
      const list = await withRetry(() =>
        gmail.users.messages.list({
          userId: "me",
          maxResults: GMAIL_PAGE_SIZE,
          includeSpamTrash: true,
          pageToken,
        }),
      );
      pageToken = list.data.nextPageToken ?? undefined;
      const listedMessages = list.data.messages ?? [];
      await mapWithConcurrency(listedMessages, GMAIL_BATCH_SIZE, async (listed) => {
        if (!listed.id) return;
        try {
          let rawBase64 = "";
          let rawMime = "";
          let full: GmailMessage;
          if (light) {
            const metaRes = await withRetry(() =>
              gmail.users.messages.get({
                userId: "me",
                id: listed.id!,
                format: "metadata",
                metadataHeaders: ["From", "To", "Cc", "Bcc", "Subject", "Date"],
              }),
            );
            full = metaRes.data;
          } else {
            const [rawRes, fullRes] = await Promise.all([
              withRetry(() => gmail.users.messages.get({ userId: "me", id: listed.id!, format: "raw" })),
              withRetry(() => gmail.users.messages.get({ userId: "me", id: listed.id!, format: "full" })),
            ]);
            rawBase64 = rawRes.data.raw ?? "";
            rawMime = rawBase64 ? base64UrlToBuffer(rawBase64).toString("utf8") : "";
            full = fullRes.data;
          }
          const headers = parseHeaderMap(full);
          const from = parseEmailAddress(headers.From);
          const recipients = [
            ...parseAddressList(headers.To),
            ...parseAddressList(headers.Cc),
            ...parseAddressList(headers.Bcc),
          ];
          const bodyText = extractBodyText(full.payload);
          const messageRecord = {
            gmailMessageId: full.id ?? listed.id,
            gmailThreadId: full.threadId ?? null,
            historyId: full.historyId ?? null,
            labelIds: full.labelIds ?? [],
            internalDate: full.internalDate ?? null,
            headers,
            senderEmail: from.email,
            senderName: from.name,
            recipients,
            subject: headers.Subject ?? null,
            snippet: full.snippet ?? null,
            sizeEstimate: full.sizeEstimate ?? null,
            localFilePath: mboxPath,
          };

          if (!light && rawMime) mboxStream.write(serializeForMbox(rawMime, headers));
          await appendFile(messagesPath, jsonLine({ ...messageRecord, bodyText, rawBase64 }));
          await db
            .insert(googleMailMessages)
            .values({
              archiveJobId: jobId,
              userId,
              gmailMessageId: messageRecord.gmailMessageId,
              gmailThreadId: messageRecord.gmailThreadId,
              historyId: messageRecord.historyId,
              labelIds: messageRecord.labelIds,
              internalDate: dateFromInternalDate(full.internalDate),
              headers,
              senderEmail: messageRecord.senderEmail,
              senderName: messageRecord.senderName,
              recipients,
              subject: messageRecord.subject,
              snippet: messageRecord.snippet,
              sizeEstimate: messageRecord.sizeEstimate,
              rawBase64,
              rawMime,
              bodyText,
              payload: (full.payload ?? {}) as Record<string, unknown>,
              localFilePath: mboxPath,
            })
            .onConflictDoUpdate({
              target: [googleMailMessages.userId, googleMailMessages.gmailMessageId],
              set: {
                archiveJobId: jobId,
                gmailThreadId: messageRecord.gmailThreadId,
                historyId: messageRecord.historyId,
                labelIds: messageRecord.labelIds,
                internalDate: dateFromInternalDate(full.internalDate),
                headers,
                senderEmail: messageRecord.senderEmail,
                senderName: messageRecord.senderName,
                recipients,
                subject: messageRecord.subject,
                snippet: messageRecord.snippet,
                sizeEstimate: messageRecord.sizeEstimate,
                rawBase64,
                rawMime,
                bodyText,
                payload: (full.payload ?? {}) as Record<string, unknown>,
                localFilePath: mboxPath,
                updatedAt: new Date(),
              },
            });

          for (const ref of light ? [] : collectAttachments(full.payload)) {
            const attachment = await withRetry(() =>
              gmail.users.messages.attachments.get({
                userId: "me",
                messageId: full.id ?? listed.id!,
                id: ref.attachmentId,
              }),
            );
            const dataBase64 = attachment.data.data ?? "";
            const bytes = dataBase64 ? base64UrlToBuffer(dataBase64) : Buffer.alloc(0);
            const sha256 = createHash("sha256").update(bytes).digest("hex");
            const messageAttachmentDir = path.join(attachmentDir, full.id ?? listed.id!);
            await mkdir(messageAttachmentDir, { recursive: true });
            const filename = `${safeFilename(ref.attachmentId)}-${safeFilename(ref.filename)}`;
            const localFilePath = path.join(messageAttachmentDir, filename);
            await writeFile(localFilePath, bytes);
            const attachmentRecord = {
              gmailMessageId: full.id ?? listed.id!,
              attachmentId: ref.attachmentId,
              filename: ref.filename,
              mimeType: ref.mimeType,
              sizeBytes: bytes.length || ref.size,
              sha256,
              localFilePath,
            };
            await appendFile(attachmentsPath, jsonLine({ ...attachmentRecord, dataBase64 }));
            await db
              .insert(googleMailAttachments)
              .values({
                archiveJobId: jobId,
                userId,
                ...attachmentRecord,
                dataBase64,
              })
              .onConflictDoUpdate({
                target: [
                  googleMailAttachments.userId,
                  googleMailAttachments.gmailMessageId,
                  googleMailAttachments.attachmentId,
                ],
                set: {
                  archiveJobId: jobId,
                  filename: ref.filename,
                  mimeType: ref.mimeType,
                  sizeBytes: bytes.length || ref.size,
                  sha256,
                  dataBase64,
                  localFilePath,
                },
              });
            attachmentsArchived++;
            bytesArchived += bytes.length;
          }

          messagesSeen++;
          messagesArchived++;
          bytesArchived += full.sizeEstimate ?? rawMime.length;
        } catch (error) {
          failureCount++;
          console.error("[GoogleArchive] Message archive failed:", listed.id, error);
        }
      });

      await db
        .update(googleArchiveJobs)
        .set({
          messageCountEstimate: list.data.resultSizeEstimate ?? job.messageCountEstimate,
          messagesSeen,
          messagesArchived,
          attachmentsArchived,
          bytesArchived,
          failureCount,
          checkpoint: { gmailPageToken: pageToken },
          updatedAt: new Date(),
        })
        .where(eq(googleArchiveJobs.id, jobId));
    } while (pageToken);

    const peopleStats = await archivePeople({
      peopleApi,
      jobId,
      userId,
      peopleDir,
    });

    const manifest = {
      jobId,
      userId,
      googleEmail: job.googleEmail,
      completedAt: new Date().toISOString(),
      files: {
        mbox: mboxPath,
        messages: messagesPath,
        attachments: attachmentsPath,
        connections: path.join(peopleDir, "connections.jsonl"),
        otherContacts: path.join(peopleDir, "other-contacts.jsonl"),
      },
      stats: {
        messagesSeen,
        messagesArchived,
        attachmentsArchived,
        contactsArchived: peopleStats.contactsArchived,
        otherContactsArchived: peopleStats.otherContactsArchived,
        bytesArchived,
        failureCount,
      },
    };
    await writeFile(path.join(job.localFolderPath, "manifest.json"), JSON.stringify(manifest, null, 2));

    await db
      .update(googleArchiveJobs)
      .set({
        status: "complete",
        contactsArchived: peopleStats.contactsArchived,
        otherContactsArchived: peopleStats.otherContactsArchived,
        messagesSeen,
        messagesArchived,
        attachmentsArchived,
        bytesArchived,
        failureCount,
        checkpoint: {},
        stats: manifest.stats,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(googleArchiveJobs.id, jobId));

    // Materialize the downloaded mail + contacts into the people/relationship tables
    // so the dashboard, review sheet, and CSV exports reflect the full archive.
    // A failure here must not fail the archive itself.
    try {
      await materializeArchiveMemory(userId);
    } catch (materializeError) {
      console.error("[GoogleArchive] Materialize after archive failed:", materializeError);
    }
  } catch (error) {
    await db
      .update(googleArchiveJobs)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Google archive failed",
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(googleArchiveJobs.id, jobId));
    throw error;
  } finally {
    mboxStream.end();
  }
}

async function archivePeople({
  peopleApi,
  jobId,
  userId,
  peopleDir,
}: {
  peopleApi: ReturnType<typeof google.people>;
  jobId: string;
  userId: string;
  peopleDir: string;
}) {
  let contactsArchived = 0;
  let otherContactsArchived = 0;
  let pageToken: string | undefined;
  const connectionsPath = path.join(peopleDir, "connections.jsonl");
  const otherContactsPath = path.join(peopleDir, "other-contacts.jsonl");

  do {
    const response = await withRetry(() =>
      peopleApi.people.connections.list({
        resourceName: "people/me",
        pageSize: PEOPLE_PAGE_SIZE,
        pageToken,
        personFields: PEOPLE_FIELDS,
      }),
    );
    pageToken = response.data.nextPageToken ?? undefined;
    for (const person of (response.data.connections ?? []) as PeoplePerson[]) {
      await savePersonContact({
        jobId,
        userId,
        sourceType: "connection",
        person,
        jsonlPath: connectionsPath,
      });
      contactsArchived++;
    }
  } while (pageToken);

  pageToken = undefined;
  do {
    const response = await withRetry(() =>
      peopleApi.otherContacts.list({
        pageSize: PEOPLE_PAGE_SIZE,
        pageToken,
        readMask: OTHER_CONTACTS_MASK,
      }),
    );
    pageToken = response.data.nextPageToken ?? undefined;
    for (const person of (response.data.otherContacts ?? []) as PeoplePerson[]) {
      await savePersonContact({
        jobId,
        userId,
        sourceType: "other_contact",
        person,
        jsonlPath: otherContactsPath,
      });
      otherContactsArchived++;
    }
  } while (pageToken);

  return { contactsArchived, otherContactsArchived };
}

async function savePersonContact({
  jobId,
  userId,
  sourceType,
  person,
  jsonlPath,
}: {
  jobId: string;
  userId: string;
  sourceType: "connection" | "other_contact";
  person: PeoplePerson;
  jsonlPath: string;
}) {
  const resourceName = person.resourceName ?? `${sourceType}:${createHash("sha256").update(JSON.stringify(person)).digest("hex")}`;
  const normalized = normalizePerson(person);
  await appendFile(jsonlPath, jsonLine({ sourceType, ...person }));
  await db
    .insert(googlePeopleContacts)
    .values({
      archiveJobId: jobId,
      userId,
      sourceType,
      resourceName,
      etag: person.etag ?? null,
      ...normalized,
      rawJson: person as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: [googlePeopleContacts.userId, googlePeopleContacts.sourceType, googlePeopleContacts.resourceName],
      set: {
        archiveJobId: jobId,
        etag: person.etag ?? null,
        ...normalized,
        rawJson: person as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
}
