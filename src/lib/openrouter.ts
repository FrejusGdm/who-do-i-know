import OpenAI from "openai";
import type { ContactRow } from "@/types";
import type { SenderRecord } from "./gmail";

const SYSTEM_PROMPT = `You are a contact extraction assistant. Given email thread metadata, extract meaningful human contacts and summarize each relationship.

Return ONLY a valid JSON array. No markdown, no explanation, no backticks.

For each contact:
- name: full name from email signature or header
- email: their email address
- relationship_type: one of classmate | professor | professional | friend | other
- how_we_met: one sentence inference from subject lines and context (past tense)
- interaction_summary: 2-3 sentences summarizing the relationship and notable exchanges
- last_contact: ISO date string of most recent message
- total_emails: total message count across all their threads
- confidence: high (clear human, multiple exchanges) | medium (likely human, few exchanges) | low (unclear)
- tags: array of 1-4 relevant tags from [classmate, professor, mentor, colleague, friend, lab-partner, club, internship, research, hackathon, ta, advisor]

Exclude: mailing lists, automated systems, no-reply addresses, newsletters.
Only include confidence: high or medium.`;

function createClient(
  mode: "cloud" | "byok",
  apiKey?: string
): OpenAI {
  if (mode === "byok" && apiKey) {
    return new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "",
        "X-Title": "WhoDoYouKnow",
      },
    });
  }

  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "",
      "X-Title": "WhoDoYouKnow",
    },
  });
}

export async function extractContacts(
  senders: SenderRecord[],
  mode: "cloud" | "byok" = "cloud",
  apiKey?: string,
  model = "anthropic/claude-3.5-sonnet",
  onProgress?: (processed: number, total: number) => void
): Promise<{ contacts: ContactRow[]; skippedBatches: number }> {
  const client = createClient(mode, apiKey);
  const BATCH = 25;
  const allContacts: ContactRow[] = [];
  let skippedBatches = 0;

  const fallbackModel = "openai/gpt-4o-mini";

  for (let i = 0; i < senders.length; i += BATCH) {
    const batch = senders.slice(i, i + BATCH);
    const batchData = batch.map((s) => ({
      email: s.email,
      name: s.name,
      total_emails: s.totalEmails,
      last_contact: s.lastContact,
      subject_snippets: s.subjectSnippets,
    }));

    let success = false;

    for (const m of [model, fallbackModel]) {
      try {
        const res = await client.chat.completions.create({
          model: m,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(batchData) },
          ],
          temperature: 0.2,
        });

        const text = res.choices[0].message.content ?? "[]";
        const parsed: ContactRow[] = JSON.parse(text);
        allContacts.push(...parsed.filter((c) => c.confidence !== "low"));
        success = true;
        break;
      } catch (e) {
        console.error(`Model ${m} failed for batch ${i}:`, e);
      }
    }

    if (!success) {
      skippedBatches++;
      console.error(`All models failed for batch ${i}, skipping`);
    }

    onProgress?.(Math.min(i + BATCH, senders.length), senders.length);
  }

  const seen = new Set<string>();
  const deduplicated = allContacts.filter((c) => {
    if (seen.has(c.email)) return false;
    seen.add(c.email);
    return true;
  });

  return { contacts: deduplicated, skippedBatches };
}
