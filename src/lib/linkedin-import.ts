import { boundedZipFiles } from "./zip-safety";
import { createHash } from "crypto";
import { parse } from "csv-parse/sync";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  contactMethods,
  imports,
  linkedinConnections,
  linkedinConversations,
  linkedinMessages,
  people,
  rawImportFiles,
} from "@/db/schema";

const CONNECTIONS_HEADER = "First Name,Last Name,URL,Email Address,Company,Position,Connected On";
const TEXT_EXTENSIONS = new Set([".csv", ".txt", ".json", ".html", ".htm", ".md"]);

type CsvRow = Record<string, string>;

export interface LinkedInImportResult {
  importId: string;
  sourceLabel: string;
  totalFiles: number;
  totalBytes: number;
  parsedFiles: number;
  skippedFiles: number;
  rawFilesStored: number;
  connectionsParsed: number;
  messagesParsed: number;
  conversationsParsed: number;
  connectionsMatched: number;
  messagesLinkedToPeople: number;
  archiveSha256: string;
}

interface RawFileForInsert {
  path: string;
  contentText: string | null;
  contentSha256: string;
  sizeBytes: number;
  rowCount: number | null;
  isParsed: boolean;
}

interface PersonLookup {
  byEmail: Map<string, string>;
  byLinkedInUrl: Map<string, string>;
}

function sha256(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function fileExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

function looksTextual(path: string, data: Buffer): boolean {
  if (TEXT_EXTENSIONS.has(fileExtension(path))) return true;
  if (data.includes(0)) return false;
  const sample = data.subarray(0, Math.min(data.length, 2048)).toString("utf8");
  return !sample.includes("\uFFFD");
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function normalizeLinkedInUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString().toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function splitList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function value(row: CsvRow, key: string): string {
  return row[key]?.trim() ?? "";
}

function parseCsv(text: string): CsvRow[] {
  return parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];
}

function parseConnectionsCsv(text: string): CsvRow[] {
  const lines = stripBom(text).split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() === CONNECTIONS_HEADER);
  if (headerIndex === -1) {
    throw new Error("Connections.csv is missing the expected LinkedIn header row");
  }
  return parseCsv(lines.slice(headerIndex).join("\n"));
}

function countCsvRows(text: string, path: string): number | null {
  try {
    const rows = path === "Connections.csv" ? parseConnectionsCsv(text) : parseCsv(text);
    return rows.length;
  } catch {
    return null;
  }
}

async function buildPersonLookup(userId: string): Promise<PersonLookup> {
  const personRows = await db.select().from(people).where(eq(people.userId, userId));
  const personIds = personRows.map((person) => person.id);
  const methodRows = personIds.length
    ? await db.select().from(contactMethods).where(inArray(contactMethods.personId, personIds))
    : [];

  const byEmail = new Map<string, string>();
  const byLinkedInUrl = new Map<string, string>();

  for (const person of personRows) {
    const email = normalizeEmail(person.primaryEmail);
    if (email) byEmail.set(email, person.id);

    const linkedInUrl = normalizeLinkedInUrl(person.linkedInUrl);
    if (linkedInUrl) byLinkedInUrl.set(linkedInUrl, person.id);
  }

  for (const method of methodRows) {
    const email = method.type === "email" ? normalizeEmail(method.value) : null;
    if (email && !byEmail.has(email)) byEmail.set(email, method.personId);

    const linkedInUrl = method.type === "linkedin" ? normalizeLinkedInUrl(method.value) : null;
    if (linkedInUrl && !byLinkedInUrl.has(linkedInUrl)) byLinkedInUrl.set(linkedInUrl, method.personId);
  }

  return { byEmail, byLinkedInUrl };
}

function matchPersonId(row: { email?: string | null; linkedInUrl?: string | null }, lookup: PersonLookup) {
  const email = normalizeEmail(row.email);
  if (email && lookup.byEmail.has(email)) {
    return {
      personId: lookup.byEmail.get(email) ?? null,
      metadata: { status: "matched", strategy: "exact_email", email },
    };
  }

  const linkedInUrl = normalizeLinkedInUrl(row.linkedInUrl);
  if (linkedInUrl && lookup.byLinkedInUrl.has(linkedInUrl)) {
    return {
      personId: lookup.byLinkedInUrl.get(linkedInUrl) ?? null,
      metadata: { status: "matched", strategy: "exact_linkedin_url", linkedInUrl },
    };
  }

  return {
    personId: null,
    metadata: {
      status: "unresolved",
      candidateHints: { email, linkedInUrl },
    },
  };
}

function toRawFiles(archive: Buffer): RawFileForInsert[] {
  return boundedZipFiles(archive)
    .map(({ content: data, path }) => {
      const isText = looksTextual(path, data);
      const contentText = isText ? stripBom(data.toString("utf8")) : null;
      const isCsv = isText && fileExtension(path) === ".csv";

      return {
        path,
        contentText,
        contentSha256: sha256(data),
        sizeBytes: data.byteLength,
        rowCount: contentText && isCsv ? countCsvRows(contentText, path) : null,
        isParsed: path === "Connections.csv" || path === "messages.csv",
      };
    });
}

export async function importLinkedInArchive({
  userId,
  sourceLabel,
  data,
}: {
  userId: string;
  sourceLabel: string;
  data: Buffer;
}): Promise<LinkedInImportResult> {
  const rawFiles = toRawFiles(data);
  const connectionsFile = rawFiles.find((file) => file.path === "Connections.csv");
  const messagesFile = rawFiles.find((file) => file.path === "messages.csv");

  if (!connectionsFile?.contentText) {
    throw new Error("LinkedIn export must include Connections.csv");
  }

  const connectionRows = parseConnectionsCsv(connectionsFile.contentText);
  const messageRows = messagesFile?.contentText ? parseCsv(messagesFile.contentText) : [];
  const lookup = await buildPersonLookup(userId);
  const archiveSha256 = sha256(data);
  const totalBytes = rawFiles.reduce((sum, file) => sum + file.sizeBytes, 0);

  const [importRow] = await db
    .insert(imports)
    .values({
      userId,
      type: "linkedin",
      status: "processing",
      sourceLabel,
      metadata: {
        sourceLabel,
        archiveSha256,
        totalFiles: rawFiles.length,
        totalBytes,
      },
    })
    .returning();

  try {
    if (rawFiles.length > 0) {
      await db.insert(rawImportFiles).values(
        rawFiles.map((file) => ({
          importId: importRow.id,
          userId,
          ...file,
        })),
      );
    }

    let connectionsMatched = 0;
    if (connectionRows.length > 0) {
      await db.insert(linkedinConnections).values(
        connectionRows.map((row) => {
          const firstName = value(row, "First Name");
          const lastName = value(row, "Last Name");
          const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Unknown LinkedIn connection";
          const emailAddress = normalizeEmail(value(row, "Email Address"));
          const profileUrl = normalizeLinkedInUrl(value(row, "URL"));
          const match = matchPersonId({ email: emailAddress, linkedInUrl: profileUrl }, lookup);
          if (match.personId) connectionsMatched++;

          return {
            importId: importRow.id,
            userId,
            personId: match.personId,
            firstName,
            lastName,
            fullName,
            profileUrl,
            emailAddress,
            company: value(row, "Company") || null,
            position: value(row, "Position") || null,
            connectedOn: parseDate(value(row, "Connected On")),
            matchMetadata: match.metadata,
            rawRow: row,
          };
        }),
      );
    }

    const conversationsByLinkedInId = new Map<
      string,
      {
        conversationId: string;
        title: string | null;
        folder: string | null;
        participantProfileUrls: Set<string>;
        messageCount: number;
        firstMessageAt: Date | null;
        lastMessageAt: Date | null;
      }
    >();

    for (const row of messageRows) {
      const conversationId = value(row, "CONVERSATION ID") || sha256(JSON.stringify(row)).slice(0, 32);
      const sentAt = parseDate(value(row, "DATE"));
      const existing = conversationsByLinkedInId.get(conversationId) ?? {
        conversationId,
        title: value(row, "CONVERSATION TITLE") || null,
        folder: value(row, "FOLDER") || null,
        participantProfileUrls: new Set<string>(),
        messageCount: 0,
        firstMessageAt: null,
        lastMessageAt: null,
      };

      const senderUrl = normalizeLinkedInUrl(value(row, "SENDER PROFILE URL"));
      if (senderUrl) existing.participantProfileUrls.add(senderUrl);
      for (const recipientUrl of splitList(value(row, "RECIPIENT PROFILE URLS")).map(normalizeLinkedInUrl)) {
        if (recipientUrl) existing.participantProfileUrls.add(recipientUrl);
      }

      existing.messageCount++;
      if (sentAt && (!existing.firstMessageAt || sentAt < existing.firstMessageAt)) existing.firstMessageAt = sentAt;
      if (sentAt && (!existing.lastMessageAt || sentAt > existing.lastMessageAt)) existing.lastMessageAt = sentAt;
      conversationsByLinkedInId.set(conversationId, existing);
    }

    const conversationRows = Array.from(conversationsByLinkedInId.values());
    const savedConversations = conversationRows.length
      ? await db
          .insert(linkedinConversations)
          .values(
            conversationRows.map((conversation) => ({
              importId: importRow.id,
              userId,
              conversationId: conversation.conversationId,
              title: conversation.title,
              folder: conversation.folder,
              participantProfileUrls: Array.from(conversation.participantProfileUrls),
              messageCount: conversation.messageCount,
              firstMessageAt: conversation.firstMessageAt,
              lastMessageAt: conversation.lastMessageAt,
            })),
          )
          .returning()
      : [];

    const conversationByLinkedInId = new Map(savedConversations.map((conversation) => [conversation.conversationId, conversation]));
    let messagesLinkedToPeople = 0;

    if (messageRows.length > 0) {
      await db.insert(linkedinMessages).values(
        messageRows.map((row) => {
          const linkedInConversationId = value(row, "CONVERSATION ID") || sha256(JSON.stringify(row)).slice(0, 32);
          const conversation = conversationByLinkedInId.get(linkedInConversationId);
          if (!conversation) {
            throw new Error(`Missing normalized LinkedIn conversation ${linkedInConversationId}`);
          }

          const senderUrl = normalizeLinkedInUrl(value(row, "SENDER PROFILE URL"));
          const senderMatch = matchPersonId({ linkedInUrl: senderUrl }, lookup);
          if (senderMatch.personId) messagesLinkedToPeople++;

          const recipientProfileUrls = splitList(value(row, "RECIPIENT PROFILE URLS"))
            .map(normalizeLinkedInUrl)
            .filter((url): url is string => Boolean(url));
          const recipientPersonIds = recipientProfileUrls
            .map((linkedInUrl) => matchPersonId({ linkedInUrl }, lookup).personId)
            .filter((personId): personId is string => Boolean(personId));

          return {
            importId: importRow.id,
            userId,
            conversationId: conversation.id,
            senderPersonId: senderMatch.personId,
            recipientPersonIds,
            linkedinConversationId: linkedInConversationId,
            conversationTitle: value(row, "CONVERSATION TITLE") || null,
            senderName: value(row, "FROM") || null,
            senderProfileUrl: senderUrl,
            recipientNames: value(row, "TO") || null,
            recipientProfileUrls,
            sentAt: parseDate(value(row, "DATE")),
            subject: value(row, "SUBJECT") || null,
            content: value(row, "CONTENT") || null,
            folder: value(row, "FOLDER") || null,
            attachments: value(row, "ATTACHMENTS") || null,
            matchMetadata: {
              sender: senderMatch.metadata,
              recipients: recipientProfileUrls.map((linkedInUrl) => matchPersonId({ linkedInUrl }, lookup).metadata),
            },
            rawRow: row,
          };
        }),
      );
    }

    const parsedFiles = rawFiles.filter((file) => file.isParsed).length;
    const skippedFiles = rawFiles.filter((file) => file.contentText === null).length;
    const metadata = {
      sourceLabel,
      archiveSha256,
      totalFiles: rawFiles.length,
      totalBytes,
      parsedFiles,
      skippedFiles,
      rawFilesStored: rawFiles.length,
      connectionCount: connectionRows.length,
      messageCount: messageRows.length,
      conversationCount: conversationRows.length,
      connectionsMatched,
      messagesLinkedToPeople,
      checksumSummary: rawFiles.map((file) => ({
        path: file.path,
        sha256: file.contentSha256,
        sizeBytes: file.sizeBytes,
      })),
    };

    await db
      .update(imports)
      .set({
        status: "complete",
        completedAt: new Date(),
        metadata,
      })
      .where(eq(imports.id, importRow.id));

    return {
      importId: importRow.id,
      sourceLabel,
      totalFiles: rawFiles.length,
      totalBytes,
      parsedFiles,
      skippedFiles,
      rawFilesStored: rawFiles.length,
      connectionsParsed: connectionRows.length,
      messagesParsed: messageRows.length,
      conversationsParsed: conversationRows.length,
      connectionsMatched,
      messagesLinkedToPeople,
      archiveSha256,
    };
  } catch (error) {
    await db
      .update(imports)
      .set({
        status: "failed",
        completedAt: new Date(),
        metadata: {
          sourceLabel,
          archiveSha256,
          errorMessage: "LinkedIn import failed",
        },
      })
      .where(eq(imports.id, importRow.id));
    throw error;
  }
}
