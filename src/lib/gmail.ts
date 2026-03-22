import { google } from "googleapis";
import type { FilterConfig } from "@/types";

export interface ThreadMeta {
  threadId: string;
  senderEmail: string;
  senderName: string;
  subjectSnippet: string;
  userReplied: boolean;
  messageCount: number;
  lastDate: string;
  bodySnippets: string[];
}

export interface SenderRecord {
  email: string;
  name: string;
  totalEmails: number;
  lastContact: string;
  subjectSnippets: string[];
  bodySnippets: string[];
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match)
    return {
      name: match[1].replace(/"/g, "").trim(),
      email: match[2].trim(),
    };
  return { name: raw, email: raw };
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

  const threadList = await gmail.users.threads.list({
    userId: "me",
    q,
    maxResults: Math.min(filters.maxThreads ?? 500, 500),
  });

  const threads = threadList.data.threads ?? [];
  onProgress?.("fetch", threads.length);

  // ── Pass 1: Fast metadata scan to identify qualifying threads ──
  const BATCH_SIZE = 20;
  const results: ThreadMeta[] = [];

  for (let i = 0; i < threads.length; i += BATCH_SIZE) {
    const batch = threads.slice(i, i + BATCH_SIZE);
    const metas = await Promise.all(
      batch.map((t) =>
        gmail.users.threads.get({
          userId: "me",
          id: t.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
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

      for (const msg of msgs) {
        const headers = msg.payload?.headers ?? [];
        const from = headers.find((h) => h.name === "From")?.value ?? "";
        const subject =
          headers.find((h) => h.name === "Subject")?.value ?? "";
        const date = headers.find((h) => h.name === "Date")?.value ?? "";

        if (from.includes(userEmail)) {
          userReplied = true;
        } else {
          const parsed = parseEmailAddress(from);
          senderEmail = parsed.email;
          senderName = parsed.name;
        }

        if (subject && !subjectSnippet) {
          subjectSnippet = subject.substring(0, 80);
        }
        if (date) lastDate = date;
      }

      if (!userReplied || !senderEmail) continue;
      if (msgs.length < (filters.minInteractions ?? 2)) continue;

      results.push({
        threadId: meta.data.id!,
        senderEmail,
        senderName,
        subjectSnippet,
        userReplied,
        messageCount: msgs.length,
        lastDate,
        bodySnippets: [],
      });
    }

    onProgress?.("filter", results.length);
  }

  // ── Pass 2: Fetch full bodies only for qualifying threads ──
  onProgress?.("enrich", results.length);

  for (let i = 0; i < results.length; i += BATCH_SIZE) {
    const batch = results.slice(i, i + BATCH_SIZE);
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

      for (const msg of msgs) {
        if (snippets.length >= 3) break;
        const from = msg.payload?.headers?.find((h) => h.name === "From")?.value ?? "";
        // Only extract body from the other person's messages, not the user's
        if (from.includes(userEmail)) continue;
        const bodyText = extractBodyText(msg.payload);
        if (bodyText) {
          snippets.push(bodyText.substring(0, 500));
        }
      }

      batch[j].bodySnippets = snippets;
    }
  }

  // ── Group by sender ──
  const bySender = new Map<string, ThreadMeta[]>();
  for (const t of results) {
    const existing = bySender.get(t.senderEmail) ?? [];
    bySender.set(t.senderEmail, [...existing, t]);
  }

  return Array.from(bySender.entries()).map(([email, ts]) => ({
    email,
    name: ts[0].senderName,
    totalEmails: ts.reduce((sum, t) => sum + t.messageCount, 0),
    lastContact: ts[ts.length - 1].lastDate,
    subjectSnippets: ts.map((t) => t.subjectSnippet).slice(0, 5),
    bodySnippets: ts.flatMap((t) => t.bodySnippets).slice(0, 3),
  }));
}
