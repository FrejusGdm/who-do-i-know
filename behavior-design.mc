# WhoDoYouKnow — Behavior & Design Document
> This doc describes HOW the product behaves. No code scaffolds. The agent should derive implementation from behavior specs + official docs.

---

## 0. Agent Ground Rules

- **BetterAuth:** Always read https://www.better-auth.com/docs before implementing auth. Use official plugins. Never hand-roll sessions, tokens, or OAuth.
- **shadcn/ui:** Always run `npx shadcn-ui@latest add [component]`. Never copy-paste component source.
- **OpenRouter:** Use OpenAI-compatible SDK with `baseURL: https://openrouter.ai/api/v1`. Docs at https://openrouter.ai/docs.
- **Ollama:** Local model server at `http://localhost:11434`. OpenAI-compatible via `/v1` endpoint. Docs at https://ollama.com/blog/openai-compat.
- **Drizzle ORM:** All DB access goes through Drizzle. Never raw SQL strings. Schema lives in one file.
- **Privacy invariant:** Email bodies are NEVER written to disk, database, or logs. If you are about to persist email content, stop and refactor.
- **TypeScript strict.** No `any`.

---

## 1. What the Product Does (Behavioral Summary)

A user arrives, connects Gmail, configures what they want scanned, pays $9, waits a few minutes, and downloads a CSV of every real person they've meaningfully emailed. The product then forgets everything it learned about them.

There are no accounts. No dashboard. No ongoing relationship. It's a vending machine: insert payment, receive network, walk away.

---

## 2. LLM Provider System — Behavior

This is the most important behavioral decision in the product. The system must support three provider modes, and the user chooses which one to use before processing begins.

### 2.1 The Three Modes

**Mode A — Cloud (OpenRouter)**
The default. Processing happens on our servers using models accessed via OpenRouter. The user pays $9 and we absorb the ~$0.20–0.50 LLM cost. Fast, no setup required. Requires internet. Data leaves the user's machine to OpenRouter's inference infrastructure (contact metadata only — never email bodies).

**Mode B — Local (Ollama)**
The privacy-maximalist option. The user runs Ollama on their own machine. Processing uses their local GPU/CPU. We never send their contact data anywhere — not even to OpenRouter. No LLM cost for us. Slower (depends on their hardware). Requires them to have Ollama installed and a model pulled.

**Mode C — BYOK (Bring Your Own Key)**
Power user option. The user pastes their own API key for any OpenRouter-compatible provider (OpenAI, Anthropic, Groq, etc.). Processing uses their key and their quota. We charge $9 for the product but not the LLM cost (they pay their provider directly). Useful for users who already have API credits or want a specific model.

### 2.2 Provider Selection UI Behavior

The provider selector appears on the filter/config screen, before checkout. It should feel like choosing a shipping method — same destination, different tradeoffs.

- **Cloud** is pre-selected. Shows "Recommended — fastest, no setup."
- **Local (Ollama)** shows a connection status indicator. When selected, the UI immediately attempts to ping `localhost:11434/api/tags`. If Ollama is not running, it shows a friendly "Ollama not detected" state with a link to ollama.com and instructions to pull a recommended model. If Ollama IS running, it lists available models from the tags response and lets the user pick one.
- **BYOK** shows a text field for the API key and a model selector. The model list is fetched from OpenRouter's `/models` endpoint filtered to text generation models.

The user cannot proceed to checkout until their chosen provider is in a valid/ready state.

### 2.3 Model Recommendations by Mode

For **Cloud (OpenRouter)**, the system uses:
- Primary extraction: `anthropic/claude-3.5-sonnet` — best accuracy for structured contact parsing
- Fallback (if primary fails): `openai/gpt-4o-mini` — cheaper, still capable
- Bulk deduplication pass: `meta-llama/llama-3.1-8b-instruct` — fast and cheap for simple classification

For **Local (Ollama)**, recommended models (shown in order of recommendation):
- `llama3.1:8b` — good balance of speed and quality on most hardware
- `mistral:7b` — slightly faster, good extraction quality
- `gemma2:9b` — best quality if the user has a capable GPU
- `phi3:mini` — for users with weak hardware / CPU-only

The UI shows estimated processing time for each local model based on a rough heuristic (number of contacts × model size tier).

For **BYOK**, no recommendation — user picks from whatever their key can access.

### 2.4 How Provider Mode Affects Architecture

In Cloud mode: the processing pipeline runs entirely on the server. The Gmail OAuth token is used server-side to fetch threads, the LLM calls go from server to OpenRouter, and the CSV is built server-side.

In Local mode: the architecture fundamentally changes. The Gmail fetch still happens server-side (we need to handle the OAuth), but the contact metadata is streamed back to the user's browser, and LLM inference calls are made from the browser directly to `localhost:11434`. The CSV is built client-side and downloaded directly — it never touches our server at all. This is the true privacy guarantee.

In BYOK mode: same as Cloud mode architecturally, but the API key used for LLM calls is the user's, passed through our server for that session only and never stored.

---

## 3. Page-by-Page Behavior

### 3.1 Landing Page

The landing page has one job: communicate the value proposition and get the user to click "Get Started."

**Visual feel:** Warm, editorial, slightly luxurious. Like an upscale stationery brand. Serif headlines (Playfair Display), clean sans body (Inter). A full-bleed AI-generated background image — soft golden network threads on cream — sits behind the hero at low opacity. The page feels like it belongs to someone who takes their network seriously.

**Above the fold:** A large serif headline, one-sentence explainer, and a single CTA button. No navigation clutter. No pricing hidden below the fold — "$9, one time" is visible in the hero.

**Scroll behavior:** As the user scrolls, sections animate in (Framer Motion, subtle — translate up + fade). GSAP is used only for the hero headline word-by-word reveal on load.

**Trust section:** Three trust badges: "Read-only Gmail access", "Data deleted after download", "No account required." These are not fine print — they are prominent design elements because they are the answer to the user's biggest objection.

**Sample output section:** Shows a static, anonymized preview of what the CSV looks like. Real column names, fake but realistic data. This answers "what exactly do I get?"

**Provider preview:** A brief mention that local processing via Ollama is available, for privacy-conscious users. Not the focus — just a trust signal.

**Footer:** Privacy policy, terms, contact email. Nothing else.

### 3.2 Connect Screen (Post-OAuth)

After the user clicks the CTA and authenticates with Google, they land here. This is a transitional screen — they've authorized, now we reassure them before they configure anything.

**Behavior:** Shows their Google account profile picture and name. Shows exactly what permissions were granted ("Read-only access to Gmail and Contacts"). Shows what we will and won't do with those permissions. Has a single "Configure Your Scan" CTA.

This screen exists to reduce anxiety between the scariest moment (granting Gmail access) and the next step. It should feel like a calm confirmation, not a loading state.

### 3.3 Filter & Configuration Screen

This is where the user shapes what gets scanned. It should feel like a thoughtful settings panel — not overwhelming, but with enough control that privacy-conscious users feel respected.

**Sections:**

*Date range:* A slider or date picker. Default: last 4 years. The user can narrow this. Shows an estimated thread count that updates as they adjust (pulled from a lightweight pre-scan that runs on page load — counts threads without fetching content).

*Domain blocklist:* A tag-style input where the user types domains to exclude (e.g. `canvas.instructure.com`, `mailchimp.com`). Pre-populated with common noise domains (configurable list maintained in the codebase). The user can remove pre-populated ones or add their own.

*Gmail category toggles:* Toggle switches for Promotions, Social, Updates, Forums. Default: all excluded. The user can include them if they want (some people get meaningful emails in Updates).

*Minimum interaction threshold:* A slider from 1 to 5. "Only include people I've exchanged at least N emails with." Default: 2. At 1, you get everyone you ever emailed once. At 5, only close contacts.

*Contact type filter:* Checkboxes for what relationship types to include in output: Classmates, Professors, Professionals, Personal/Friends, Other. Default: all checked. The user can uncheck types they don't care about.

*Provider selector:* The LLM mode picker described in Section 2.2. Lives at the bottom of this screen.

*Estimated output:* A live counter — "~142 contacts estimated" — that updates as the user adjusts filters. This is based on thread count heuristics, not actual LLM parsing. It is explicitly labeled as an estimate.

**Behavior on submit:** Filters are saved to the session (not DB). User proceeds to checkout. If Local mode, the Ollama connection is re-verified at this point.

### 3.4 Checkout

Simple. We don't build a checkout form. We redirect to Stripe Checkout.

**Behavior:** The user is redirected to a Stripe-hosted checkout page for a $9 one-time payment. On success, Stripe sends a webhook to our server which creates a job record and triggers processing. The user is redirected to the processing screen.

**In Local mode:** There is still a $9 charge (for the product, not the LLM). The checkout flow is identical. The only difference is where the LLM inference runs after payment.

### 3.5 Processing Screen

The user is waiting. This screen must feel alive and trustworthy, not like a frozen spinner.

**Behavior:** The screen shows a vertical list of stages. Completed stages are checked off. The current stage shows an animated indicator and a rotating copy line that changes every few seconds (e.g. "Digging through 4 years of group project emails..." → "Sorting through the club listserv chaos..."). Future stages are dimmed.

**Stages (in order):**
1. Connecting to Gmail
2. Fetching your email threads
3. Filtering out the noise
4. Identifying real contacts
5. Analyzing your relationships (this is the LLM step — longest)
6. Building your spreadsheet
7. Ready for download

Progress is communicated via SSE (Server-Sent Events) in Cloud/BYOK mode. In Local mode, progress events are emitted by the client-side processing logic and rendered the same way — same UI, different event source.

**Estimated time** shown at top: "Usually 2–5 minutes." Updates to "Almost done" when on stage 5 or 6.

**If something fails:** The screen transitions to a clear error state. Not a generic "something went wrong." Specific: "We had trouble connecting to Gmail — your payment has not been charged" or "The AI processing timed out — we'll retry automatically." There is always a support email visible.

**In Local mode:** An additional note is shown: "Processing is happening on your device. Keep this tab open." A warning appears if the tab loses focus for too long.

### 3.6 Download Screen

The payoff. This should feel like a small celebration.

**Behavior:** A large download button. The user's contact count prominently displayed: "We found 138 people in your network." A preview table showing the first 5 rows (last names blurred as a visual privacy gesture, even though this is their own data). A confirmation: "Your data has been deleted from our servers. Downloaded at [timestamp]."

**After download:** A soft prompt — "Know a classmate who'd want this?" with a referral copy link. Not pushy. Just present.

**Link expiry:** The download link is valid for 15 minutes. If the user returns after it's expired, they see a clear message: "This link has expired. Your data has been deleted per our privacy policy. If you need to reprocess, [contact us]." Do not auto-reprocess — that would require re-billing or re-running without consent.

**In Local mode:** There is no download link. The CSV was built in the browser. The download button triggers a direct browser file download (`data:text/csv` blob). The "deleted from servers" message is replaced with "Your data never left your device."

### 3.7 Privacy Policy Page

Must be live and publicly accessible for Google review. Written in plain English — not legalese. Covers: what we access, what we process (not store), what we store, what we never store, deletion timeline, Google API compliance statement, third-party services (Stripe, OpenRouter, Vercel), user rights, contact email.

The key statement for Google: *"Our use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements."*

### 3.8 Terms of Service Page

Standard. One-time service, no refunds after processing begins, no warranty, acceptable use (no scraping others' emails, no commercial resale of output). Keep it short.

---

## 4. Email Processing Pipeline — Behavior

### 4.1 What Gets Fetched

The Gmail fetch is designed to be fast and noisy-signal-free. The system queries for threads where:
- The user has sent at least one message in the thread (mutual exchange)
- The thread is not in Promotions, Updates, Social, or Forums (unless user opted in)
- The sender is not a known bot pattern (no-reply, noreply, donotreply, mailer-daemon, notifications@, automated@)
- The sender domain is not in the user's blocklist
- The thread falls within the user's selected date range
- The thread meets the minimum interaction count

Only thread metadata is fetched: sender name, sender email, subject line (first 80 characters), message count, and most recent date. Full email bodies are never requested.

### 4.2 Deduplication Before LLM

Before any LLM call, threads are grouped by sender email address. A person who sent 14 emails across 6 threads is represented as one record with 6 subject snippets and a total count of 14. This dramatically reduces LLM token usage and cost.

### 4.3 What the LLM Receives

Each LLM batch contains up to 25 sender records. Each record contains: email address, display name (from email header), total message count, date of last contact, and up to 5 subject line snippets. That is all. No email bodies. No full subject lines beyond 80 chars.

### 4.4 What the LLM Produces

For each sender, the LLM returns: full name (cleaned), relationship type (classmate / professor / professional / friend / other), a one-sentence "how we met" inference, a 2–3 sentence interaction summary, confidence level (high / medium / low). Only high and medium confidence contacts are included in the final CSV.

### 4.5 Fallback Behavior

If a batch fails (timeout, model error, rate limit), that batch is skipped and processing continues with the remaining batches. The user receives a partial result rather than a complete failure. The download screen notes: "X contacts could not be analyzed and were excluded."

If the primary model fails entirely, the system automatically retries with the fallback model (gpt-4o-mini in Cloud mode, or the next recommended model in Local mode).

### 4.6 Local Mode Pipeline Differences

In Local mode, after the Gmail fetch (server-side), the extracted thread metadata is returned to the browser as a JSON payload. The browser then calls `localhost:11434/v1/chat/completions` directly, using the same batching logic. Progress events are fired to the UI from the client-side processing loop. The CSV is assembled in the browser and downloaded directly. Our server never sees the LLM output.

---

## 5. Privacy Behavior

**What is stored:**
- User's email address (to send the download link) — deleted after download or 24 hours
- Job status record (pending/processing/complete/failed) — deleted after 30 days
- Filter configuration — deleted after job completes

**What is never stored:**
- Email bodies
- Full subject lines
- Contact names
- Relationship summaries
- The CSV itself (only a temporary signed URL pointing to Vercel Blob, TTL 15 minutes)
- Google access tokens (used for the processing window only, then discarded)

**In Local mode:** Nothing beyond job status is stored. The contact data never reaches our server.

---

## 6. Error States & Edge Cases

**No mutual threads found:** "We couldn't find any mutual email exchanges matching your filters. Try expanding your date range or lowering the minimum interaction threshold." Do not charge.

**Gmail API quota exceeded:** Queue the job and retry. Show user estimated wait time. Do not fail silently.

**Ollama connection lost mid-processing (Local mode):** Pause processing. Show "Ollama connection lost — please restart Ollama and click Resume." Save progress so completed batches don't need to re-run.

**Stripe webhook delayed:** Show "Payment received — processing will begin shortly" if the user lands on the processing screen before the webhook fires. Poll for job status.

**User closes tab during processing (Cloud mode):** Processing continues server-side. Send an email when the CSV is ready: "Your WhoDoYouKnow download is ready — [link]." Link expires in 15 minutes.

**User closes tab during processing (Local mode):** Processing stops. Show a warning modal if the user attempts to close: "Processing will stop if you close this tab. Are you sure?"

---

## 7. Google OAuth Verification — What to Submit

**Scope justifications (use this exact language):**

`gmail.readonly` — "We read Gmail thread metadata (sender address, display name, subject line snippet up to 80 characters, and message count) to identify people the user has meaningfully communicated with. Email bodies are never accessed or stored. All data is processed in memory and permanently deleted within 15 minutes of the user downloading their results."

`contacts.readonly` — "We read contact display names to supplement Gmail header parsing and improve name resolution accuracy. Contact data is processed in memory only and never stored."

**Data handling statement:**
"WhoDoYouKnow processes Google user data solely to generate a one-time personal contact export for the authenticated user. Data is not shared with third parties (except OpenRouter for LLM inference — contact metadata only, no email content), not used for advertising, not retained beyond the stated 15-minute window, and not used for any purpose other than generating the user's requested output. We comply with Google's Limited Use policy."

**Demo video should show:**
1. Landing page → click CTA
2. Google OAuth consent screen
3. Filter configuration (show the domain blocklist, the toggles)
4. Checkout ($9)
5. Processing screen with live stages
6. Download screen with CSV preview
7. Confirmation that data is deleted

---

## 8. Tone & Copy Principles

The product talks like a smart friend, not a startup. No "leverage synergies." No "unlock your network's potential." Direct, warm, slightly wry.

- Hero: "You spent years meeting people. Don't lose them."
- Processing stage copy: casual and specific ("Sorting through 4 years of reply-all chaos")
- Trust copy: matter-of-fact ("We read your emails for about 3 minutes, then forget everything")
- Error copy: honest ("That didn't work. Here's why and what to do.")
- Download copy: understated celebration ("138 people. That's your network.")

---

## 9. What's Out of Scope (v1)

- Outlook / other email providers
- Ongoing sync or CRM features
- LinkedIn enrichment
- Team features
- Mobile app
- Referral program (beyond a static share link)
- Re-processing without re-payment
