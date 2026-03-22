import OpenAI from "openai";
import type { ContactRow, BYOKProvider } from "@/types";
import type { SenderRecord } from "./gmail";

const SYSTEM_PROMPT = `You are a contact extraction assistant. Given email metadata and message excerpts, extract meaningful human contacts and summarize each relationship.

Return ONLY a valid JSON array. No markdown, no explanation, no backticks.

For each contact:
- name: full name from email signature, header, or body
- email: their email address
- relationship_type: one of classmate | professor | professional | friend | other
- how_we_met: one sentence inference from subject lines, email content, and context (past tense)
- interaction_summary: 2-3 sentences summarizing the relationship, what you discussed, and notable exchanges
- last_contact: ISO date string of most recent message
- total_emails: total message count across all their threads
- confidence: high (clear human, multiple exchanges) | medium (likely human, few exchanges) | low (unclear)
- tags: array of 1-4 relevant tags from [classmate, professor, mentor, colleague, friend, lab-partner, club, internship, research, hackathon, ta, advisor]

Exclude: mailing lists, automated systems, no-reply addresses, newsletters.
Only include confidence: high or medium.`;

const BYOK_CONFIGS: Record<BYOKProvider, { baseURL: string; defaultModel: string }> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
  },
};

function createClient(
  mode: "cloud" | "byok" | "local",
  apiKey?: string,
  byokProvider?: BYOKProvider
): OpenAI {
  if (mode === "local") {
    return new OpenAI({
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
    });
  }

  if (mode === "byok" && apiKey) {
    const provider = byokProvider ?? "openrouter";
    const config = BYOK_CONFIGS[provider];
    const headers: Record<string, string> = {};
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL ?? "";
      headers["X-Title"] = "WhoDoYouKnow";
    }
    return new OpenAI({
      baseURL: config.baseURL,
      apiKey,
      ...(Object.keys(headers).length > 0 ? { defaultHeaders: headers } : {}),
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
  mode: "cloud" | "byok" | "local" = "cloud",
  apiKey?: string,
  model?: string,
  onProgress?: (processed: number, total: number) => void,
  byokProvider?: BYOKProvider
): Promise<{ contacts: ContactRow[]; skippedBatches: number }> {
  const client = createClient(mode, apiKey, byokProvider);
  // Smaller batches for local models — less data per LLM call
  const BATCH = mode === "local" ? 5 : 25;

  // Use provider-specific default model if none specified
  const effectiveModel = model
    ?? (mode === "byok" ? BYOK_CONFIGS[byokProvider ?? "openrouter"].defaultModel : "anthropic/claude-3.5-sonnet");
  const allContacts: ContactRow[] = [];
  let skippedBatches = 0;

  const modelsToTry = mode === "local"
    ? [effectiveModel]
    : [effectiveModel, "openai/gpt-4o-mini"];

  for (let i = 0; i < senders.length; i += BATCH) {
    const batch = senders.slice(i, i + BATCH);
    const snippetLimit = mode === "local" ? 200 : 500;
    const batchData = batch.map((s) => ({
      email: s.email,
      name: s.name,
      total_emails: s.totalEmails,
      last_contact: s.lastContact,
      subject_snippets: s.subjectSnippets,
      body_snippets: (s.bodySnippets ?? []).map((b) => b.substring(0, snippetLimit)),
    }));

    let success = false;

    for (const m of modelsToTry) {
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
