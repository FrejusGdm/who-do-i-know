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
}

export interface SenderRecord {
  email: string;
  name: string;
  totalEmails: number;
  lastContact: string;
  subjectSnippets: string[];
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
      });
    }

    onProgress?.("filter", results.length);
  }

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
  }));
}
