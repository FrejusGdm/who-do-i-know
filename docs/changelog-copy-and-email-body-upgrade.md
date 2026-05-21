# Copy & Email Body Upgrade

**Date:** 2026-03-21

> Updated 2026-05-20: this note describes the older one-shot body-snippet flow.
> The current product can store full raw message bodies in the user's private
> database when full-context processing is enabled. See `docs/HUMANS.md` for the
> relationship-memory pipeline and `src/app/privacy/page.tsx` for the current
> user-facing data handling copy.

## What Changed

### 1. Gmail now reads full email bodies (not just metadata)

**Why:** Subject lines alone produce vague relationship summaries. With full message bodies, the AI can generate much more accurate `how_we_met` and `interaction_summary` fields.

**How it works:**
- `gmail.ts` now uses `format: "full"` instead of `format: "metadata"`
- Extracts up to 3 body snippets (500 chars each) per sender from non-user messages
- Prefers `text/plain` parts, falls back to stripped HTML
- Body snippets are passed alongside existing metadata to the LLM

**Historical privacy implications:**
- At the time, email bodies were processed in-memory only and not stored.
- This is superseded by the current relationship-memory design, where raw bodies can be stored for later summarization and reprocessing.
- Bodies may be sent to AI providers during Cloud or BYOK processing. Local/Ollama processing keeps inference on the local machine.

### 2. Connect page copy rewritten (reassuring & minimal tone)

**Old copy:**
- "Read-only Gmail access / We read email metadata only — never full content"
- "Read-only Contacts / Used to improve name resolution accuracy"
- "No modifications / We will never send emails or modify your account"

**New copy:**
- "Read-only Gmail access / We scan your emails to understand your relationships — then delete everything."
- "Processed, never saved / Your data passes through AI once and is permanently deleted. Nothing is stored or used for training." (historical copy; no longer accurate for full-context relationship memory)
- "No modifications / We can't send emails, delete messages, or change anything."

**Why the change:** The old copy was technically accurate but misleading now that we read bodies. The new copy is honest about reading emails while being reassuring about what happens to the data.

### 3. Privacy policy updated

- "Data We Process" section now mentions message content alongside metadata
- "Data We Never Store" section clarified bodies were processed in-memory but never persisted at that time; current privacy copy supersedes this
- Third parties section: removed Stripe reference (app is free), updated OpenRouter description to mention OpenAI/Anthropic no-training policies with a disclaimer

### 4. Terms of Service updated

- Payment section: "$9 USD via Stripe" → "Currently free. No payment required."
- Liability cap: "$9 USD" → "the amount paid, if any"

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Read full bodies | Much richer relationship summaries justify the privacy trade-off |
| 500 char body limit | Balances context quality with LLM token costs |
| 3 snippets per sender | Enough for relationship context without excessive data transfer |
| Reassuring & minimal tone | Non-technical users need calm, clear language — not jargon |
| Disclaim AI provider policies | We can't guarantee OpenAI/Anthropic won't change their training policies |
| Keep Stripe code but update copy | May re-enable payments later; only the user-facing text needed fixing |

## Files Modified

| File | Change |
|------|--------|
| `src/lib/gmail.ts` | `format: "full"`, body extraction, `bodySnippets` field |
| `src/lib/openrouter.ts` | Updated system prompt, added `body_snippets` to batch data |
| `src/app/connect/page.tsx` | Rewrote 3 permission cards |
| `src/app/privacy/page.tsx` | Updated 3 sections for body reading + AI providers |
| `src/app/terms/page.tsx` | Removed $9 references |
