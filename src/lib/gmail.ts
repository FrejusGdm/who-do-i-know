import { google } from "googleapis";
import type { FilterConfig } from "@/types";

export interface ThreadMeta {
  threadId: string;
  senderEmail: string;
  senderName: string;
  participants: ParticipantMeta[];
  subjectSnippet: string;
  userReplied: boolean;
  messageCount: number;
  lastDate: string;
  bodySnippets: string[];
  messages: MessageMeta[];
}

export interface ParticipantMeta {
  email: string;
  name: string;
}

export interface MessageMeta {
  messageId: string;
  senderEmail: string;
  senderName: string;
  recipients: string[];
  subject: string;
  sentAt: string;
  snippet: string;
  body: string;
}

export interface SenderRecord {
  email: string;
  name: string;
  totalEmails: number;
  lastContact: string;
  subjectSnippets: string[];
  bodySnippets: string[];
  threads: ThreadMeta[];
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match)
    return {
      name: match[1].replace(/"/g, "").trim(),
      email: match[2].trim().toLowerCase(),
    };
  return { name: raw, email: raw.trim().toLowerCase() };
}

function parseAddressList(raw: string): ParticipantMeta[] {
  if (!raw) return [];
  return raw
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((value) => parseEmailAddress(value.trim()))
    .filter((value) => value.email && value.email.includes("@"));
}

function parseEmailList(raw: string): string[] {
  return parseAddressList(raw).map((value) => value.email);
}

function parseHeaderDate(raw: string): string {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function isUserAddress(email: string, userEmail: string): boolean {
  return email.toLowerCase() === userEmail.toLowerCase();
}

function isLikelyAutomatedAddress(email: string): boolean {
  return /(^|[-_.])(no-?reply|donotreply|mailer-daemon|notification|notifications)([-_.]|@)/i.test(email);
}

function dedupeParticipants(participants: ParticipantMeta[]): ParticipantMeta[] {
  const byEmail = new Map<string, ParticipantMeta>();
  for (const participant of participants) {
    if (!participant.email || byEmail.has(participant.email)) continue;
    byEmail.set(participant.email, participant);
  }
  return Array.from(byEmail.values());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBodyText(payload: any): string {
  if (!payload) return "";

  // Simple message (no parts)
  if (payload.body?.data) {
    const decoded = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    if (payload.mimeType === "text/plain") return decoded.trim();
    if (payload.mimeType === "text/html") return stripHtml(decoded).trim();
  }

  // Multipart message — prefer text/plain
  if (payload.parts) {
    const plainPart = payload.parts.find((p: { mimeType: string }) => p.mimeType === "text/plain");
    if (plainPart?.body?.data) {
      return Buffer.from(plainPart.body.data, "base64url").toString("utf-8").trim();
    }
    const htmlPart = payload.parts.find((p: { mimeType: string }) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      return stripHtml(Buffer.from(htmlPart.body.data, "base64url").toString("utf-8")).trim();
    }
    // Nested multipart (e.g. multipart/alternative inside multipart/mixed)
    for (const part of payload.parts) {
      const nested = extractBodyText(part);
      if (nested) return nested;
    }
  }

  return "";
}

function stripHtml(html: string): string {
  return html
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

function buildQuery(filters: FilterConfig): string {
  const parts: string[] = ["in:anywhere"];

  if (filters.skipPromotions) parts.push("-category:promotions");
  if (filters.skipUpdates) parts.push("-category:updates");
  if (filters.skipSocial) parts.push("-category:social");
  if (filters.skipForums) parts.push("-category:forums");

  for (const domain of filters.blockedDomains) {
    if (domain.trim()) parts.push(`-from:@${domain.trim()}`);
  }

  if (filters.afterDate) {
    const ts = Math.floor(new Date(filters.afterDate).getTime() / 1000);
    parts.push(`after:${ts}`);
  }

  parts.push(
    "-from:no-reply",
    "-from:noreply",
    "-from:donotreply",
    "-from:notifications@",
    "-from:mailer-daemon@"
  );

  return parts.filter(Boolean).join(" ");
}

export async function countThreads(
  accessToken: string,
  filters: FilterConfig
): Promise<number> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const q = buildQuery(filters);

  const res = await gmail.users.threads.list({
    userId: "me",
    q,
    maxResults: 1,
  });

  return res.data.resultSizeEstimate ?? 0;
}

export async function fetchMutualThreads(
  accessToken: string,
  filters: FilterConfig,
  onProgress?: (stage: string, count: number) => void
): Promise<SenderRecord[]> {
  const oauth2 = new google.auth.OAuth2();
  oauth2.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });

  const profile = await gmail.users.getProfile({ userId: "me" });
  const userEmail = profile.data.emailAddress!;
  const q = buildQuery(filters);
  const maxThreads = filters.maxThreads ?? 500;

  // ── Fetch thread IDs with pagination ──
  const allThreadIds: { id: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.threads.list({
      userId: "me",
      q,
      maxResults: Math.min(500, maxThreads - allThreadIds.length),
      pageToken,
    });
    const threads = res.data.threads ?? [];
    for (const t of threads) {
      if (t.id) allThreadIds.push({ id: t.id });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && allThreadIds.length < maxThreads);

  onProgress?.("fetch", allThreadIds.length);

  // ── Pass 1: Fast metadata scan ──
  const BATCH_SIZE = 20;
  const results: ThreadMeta[] = [];
  const requireReply = filters.requireReply ?? false;

  for (let i = 0; i < allThreadIds.length; i += BATCH_SIZE) {
    const batch = allThreadIds.slice(i, i + BATCH_SIZE);
    const metas = await Promise.all(
      batch.map((t) =>
        gmail.users.threads.get({
          userId: "me",
          id: t.id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Cc", "Bcc", "Subject", "Date"],
        })
      )
    );

    for (const meta of metas) {
      const msgs = meta.data.messages ?? [];
      let userReplied = false;
      let lastDate = "";
      let subjectSnippet = "";
      let senderEmail = "";
      let senderName = "";
      const participants: ParticipantMeta[] = [];

      for (const msg of msgs) {
        const headers = msg.payload?.headers ?? [];
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const to = headers.find((h) => h.name === "To")?.value ?? "";
        const cc = headers.find((h) => h.name === "Cc")?.value ?? "";
        const bcc = headers.find((h) => h.name === "Bcc")?.value ?? "";
        const subject =
          headers.find((h) => h.name === "Subject")?.value ?? "";
        const date = headers.find((h) => h.name === "Date")?.value ?? "";
        const parsedFrom = parseEmailAddress(from);

        participants.push(parsedFrom, ...parseAddressList(to), ...parseAddressList(cc), ...parseAddressList(bcc));

        if (isUserAddress(parsedFrom.email, userEmail)) {
          userReplied = true;
        } else {
          senderEmail = parsedFrom.email;
          senderName = parsedFrom.name;
        }

        if (subject && !subjectSnippet) {
          subjectSnippet = subject.substring(0, 80);
        }
        if (date) lastDate = date;
      }

      // Skip if no sender found
      const externalParticipants = dedupeParticipants(participants).filter(
        (participant) =>
          !isUserAddress(participant.email, userEmail) &&
          !isLikelyAutomatedAddress(participant.email)
      );
      if (!senderEmail && externalParticipants.length === 0) continue;
      // Skip if reply required but user didn't reply
      if (requireReply && !userReplied) continue;

      results.push({
        threadId: meta.data.id!,
        senderEmail: senderEmail || externalParticipants[0]?.email || "",
        senderName: senderName || externalParticipants[0]?.name || "",
        participants: externalParticipants,
        subjectSnippet,
        userReplied,
        messageCount: msgs.length,
        lastDate,
        bodySnippets: [],
        messages: [],
      });
    }

    onProgress?.("filter", results.length);
  }

  // ── Group by every non-user participant, not just the last inbound sender ──
  const bySender = new Map<string, { participant: ParticipantMeta; threads: ThreadMeta[] }>();
  for (const t of results) {
    for (const participant of t.participants) {
      const existing = bySender.get(participant.email) ?? { participant, threads: [] };
      bySender.set(participant.email, {
        participant: existing.participant,
        threads: [...existing.threads, t],
      });
    }
  }

  // ── Apply minInteractions per-sender (total emails across all threads) ──
  const minInteractions = filters.minInteractions ?? 2;
  const qualifiedSenders = Array.from(bySender.entries()).filter(
    ([, value]) => value.threads.reduce((sum, t) => sum + t.messageCount, 0) >= minInteractions
  );

  // ── Pass 2: Fetch full bodies only for qualifying threads ──
  const qualifiedThreadIds = new Set(
    qualifiedSenders.flatMap(([, value]) => value.threads.map((t) => t.threadId))
  );
  const threadsToEnrich = results.filter((t) => qualifiedThreadIds.has(t.threadId));
  onProgress?.("enrich", qualifiedSenders.length);

  for (let i = 0; i < threadsToEnrich.length; i += BATCH_SIZE) {
    const batch = threadsToEnrich.slice(i, i + BATCH_SIZE);
    const fullThreads = await Promise.all(
      batch.map((t) =>
        gmail.users.threads.get({
          userId: "me",
          id: t.threadId,
          format: "full",
        })
      )
    );

    for (let j = 0; j < fullThreads.length; j++) {
      const msgs = fullThreads[j].data.messages ?? [];
      const snippets: string[] = [];
      const messages: MessageMeta[] = [];

      for (const msg of msgs) {
        const headers = msg.payload?.headers ?? [];
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const to = headers.find((h) => h.name === "To")?.value ?? "";
        const cc = headers.find((h) => h.name === "Cc")?.value ?? "";
        const bcc = headers.find((h) => h.name === "Bcc")?.value ?? "";
        const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
        const date = headers.find((h) => h.name === "Date")?.value ?? "";
        const parsedFrom = parseEmailAddress(from);
        const bodyText = extractBodyText(msg.payload);
        const snippet = bodyText.substring(0, 500);

        if (msg.id) {
          messages.push({
            messageId: msg.id,
            senderEmail: parsedFrom.email,
            senderName: parsedFrom.name,
            recipients: [...parseEmailList(to), ...parseEmailList(cc), ...parseEmailList(bcc)],
            subject,
            sentAt: parseHeaderDate(date),
            snippet,
            body: bodyText,
          });
        }

        if (snippets.length >= 3) continue;
        if (isUserAddress(parsedFrom.email, userEmail)) continue;
        if (bodyText) {
          snippets.push(snippet);
        }
      }

      batch[j].bodySnippets = snippets;
      batch[j].messages = messages;
    }
  }

  return qualifiedSenders.map(([email, value]) => ({
    email,
    name: value.participant.name,
    totalEmails: value.threads.reduce((sum, t) => sum + t.messageCount, 0),
    lastContact: value.threads[value.threads.length - 1].lastDate,
    subjectSnippets: value.threads.map((t) => t.subjectSnippet).slice(0, 5),
    bodySnippets: value.threads.flatMap((t) => t.bodySnippets).slice(0, 3),
    threads: value.threads,
  }));
}
