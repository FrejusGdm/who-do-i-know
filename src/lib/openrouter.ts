import OpenAI from "openai";
import type { ContactRow, BYOKProvider } from "@/types";
import type { SenderRecord } from "./gmail";

const SYSTEM_PROMPT = `You are a private relationship-memory analyst. Given Gmail metadata and message excerpts, extract meaningful human contacts and write specific, evidence-grounded relationship memory for the mailbox owner.

Return ONLY a valid JSON array. No markdown, no explanation, no backticks.

For each contact:
- name: full name from email signature, header, or body
- email: their email address
- relationship_type: one of classmate | professor | teaching_assistant | student | mentor | advisor | recruiter | colleague | professional | friend | weak_tie | family | other | unknown
- how_we_met: one specific sentence inferred from subject lines, message excerpts, roles, courses, orgs, and context
- interaction_summary: 3-5 specific sentences summarizing the relationship, what you discussed, and what the relationship seems to mean
- notable_advice: concrete advice, help, referral context, or support they gave, or empty string
- personal_details: personal details, preferences, life events, clubs, schools, locations, plans, or empty string
- open_loops: unresolved follow-ups, promised intros, pending work, next steps, or empty string
- why_they_matter: why this person is strategically or personally worth remembering
- reconnect_reason: a natural reason to reach out now or later
- last_contact: ISO date string of most recent message
- total_emails: total message count across all their threads
- confidence: high (clear human, multiple exchanges) | medium (likely human, few exchanges) | low (unclear)
- tags: array of 2-8 relevant tags. Include specific role/context tags when supported: ta, co-ta, student, professor, course, mentor, advisor, recruiter, internship, research, fellowship, schwarzman, china, asia, global-affairs, dartmouth, club, hackathon, lab, referral, career.

Important inference rules:
- If the excerpts suggest the mailbox owner taught, graded, staffed office hours, recitations, labs, or course logistics with/for this person, mention TA context explicitly.
- Distinguish "I was their TA", "we were TAs together", and "they were my professor" when the evidence supports it.
- Prefer concrete evidence from subjects and snippets over generic summaries.
- If evidence is weak, say what is known and keep confidence medium/low.

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

export function createAIClient(
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

export function getDefaultAIModel(
  mode: "cloud" | "byok" | "local",
  model?: string,
  byokProvider?: BYOKProvider
): string {
  if (model) return model;
  if (mode === "local") return "llama3.1:8b";
  if (mode === "byok") return BYOK_CONFIGS[byokProvider ?? "openrouter"].defaultModel;
  return "anthropic/claude-3.5-sonnet";
}

export async function extractContacts(
  senders: SenderRecord[],
  mode: "cloud" | "byok" | "local" = "cloud",
  apiKey?: string,
  model?: string,
  onProgress?: (processed: number, total: number) => void,
  byokProvider?: BYOKProvider
): Promise<{ contacts: ContactRow[]; skippedBatches: number }> {
  const client = createAIClient(mode, apiKey, byokProvider);
  // Smaller batches preserve detail and keep local models reliable.
  const BATCH = mode === "local" ? 3 : 10;

  // Use provider-specific default model if none specified
  const effectiveModel = getDefaultAIModel(mode, model, byokProvider);
  const allContacts: ContactRow[] = [];
  let skippedBatches = 0;

  const modelsToTry =
    mode === "cloud"
      ? [effectiveModel, "openai/gpt-4o-mini"]
      : [effectiveModel];

  for (let i = 0; i < senders.length; i += BATCH) {
    const batch = senders.slice(i, i + BATCH);
    const snippetLimit = mode === "local" ? 350 : 1200;
    const batchData = batch.map((s) => ({
      email: s.email,
      name: s.name,
      total_emails: s.totalEmails,
      last_contact: s.lastContact,
      subject_snippets: s.subjectSnippets,
      body_snippets: (s.bodySnippets ?? []).map((b) => b.substring(0, snippetLimit)),
      thread_count: s.threads.length,
      thread_subjects: s.threads.map((t) => t.subjectSnippet).filter(Boolean).slice(0, 12),
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
        const jsonText = text.match(/\[[\s\S]*\]/)?.[0] ?? text;
        const parsed: ContactRow[] = JSON.parse(jsonText);
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
