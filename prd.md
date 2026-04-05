# WhoDoYouKnow — Product Requirements Document
> Version 1.0 | One-night build | Status: ACTIVE

## 1. Product Overview

**WhoDoYouKnow** is a one-shot personal CRM generator. A user connects their Gmail, optionally filters what gets scanned, pays $9, and receives a download link to a CSV/spreadsheet of every real person they've ever meaningfully interacted with — enriched by AI with context, relationship type, and interaction summaries.

**Tagline:** *"You spent years meeting people. Don't lose them."*

**Primary users:** College graduates, job changers, conference attendees — anyone with a rich email history and no organized way to recall their network.

**Business model:** 100% free. No subscriptions. No accounts after delivery. Connect → process → download → done.

---

## 2. Core User Flow

```
/ (landing)
  → /connect       (Google OAuth via BetterAuth)
  → /filter        (optional: exclude domains, date ranges, categories, select processing mode)
  → /processing    (real-time progress via SSE or polling, bypasses checkout)
  → /download      (expiring signed URL, 15 min TTL)
  → [data deleted] (immediate server-side purge)
```

---

## 3. Feature Requirements

### 3.1 Landing Page
- [ ] Hero section with generative background image (AI-generated via FAL or Replicate on build)
- [ ] Clear value proposition headline
- [ ] Sample CSV preview (static, anonymized)
- [ ] Trust signals: "We never store your emails", "Data deleted after download", "Read-only Gmail access"
- [ ] Single CTA: "Get My Network — Free"
- [ ] Fancy serif + sans font pairing (Playfair Display + Inter or similar)
- [ ] Framer Motion page transitions + scroll animations
- [ ] GSAP for hero text reveal animation

### 3.2 Authentication
- [ ] BetterAuth with Google OAuth plugin
- [ ] Scope: `gmail.readonly` + `https://www.googleapis.com/auth/contacts.readonly`
- [ ] Store: access token, refresh token, user email, display name
- [ ] Session expires after job completion (no persistent login needed)
- [ ] **Agent note:** Always check BetterAuth docs at https://www.better-auth.com/docs — use the Google provider plugin, social login plugin, and session management. Do NOT hand-roll auth.

### 3.3 Filter Screen
Users can configure what gets scanned:
- [ ] **Date range** — e.g. "only emails from last 4 years"
- [ ] **Exclude domains** — text input to blocklist e.g. `@canvas.edu`, `@mailchimp.com`
- [ ] **Categories to skip** — toggles: Promotions, Social, Updates, Forums (maps to Gmail categories)
- [ ] **Min interaction threshold** — slider: "only include people I've emailed at least N times" (default: 2)
- [ ] **Processing Mode** — split pane selection: Local (Ollama, recommended for privacy), BYOK (custom OpenRouter key), or Cloud (currently marked Coming Soon)
- [ ] Show estimated contact count (live, based on filters, via a lightweight pre-scan)

### 3.4 Payment (Bypassed)
- [ ] Previously Stripe Checkout session, $9 USD one-time
- [ ] **Currently bypassed:** The application is 100% free. Users are routed directly from `/filter` to `/processing` via a new `/api/job` endpoint.
- [ ] The Stripe code remains in the codebase for potential future use but is not active in the primary Local/BYOK flows.

### 3.5 Email Processing Pipeline
See Section 5 for full technical spec.

### 3.6 Processing Screen
- [ ] Real-time progress (SSE stream from backend)
- [ ] Stages shown: Connecting → Fetching threads → Filtering noise → Analyzing contacts → Building CSV → Ready
- [ ] Estimated time: 2–5 min
- [ ] Animated progress bar (Framer Motion)
- [ ] Fun copy at each stage ("Digging through 4 years of group project emails...")

### 3.7 Download Screen
- [ ] Signed expiring URL (15 min TTL via Vercel Blob or R2)
- [ ] One-click CSV download
- [ ] Preview: first 5 rows of the CSV (blurred last names for privacy feel)
- [ ] "Your data has been deleted from our servers" confirmation with timestamp
- [ ] Share prompt: "Know someone graduating? Send them this"
- [ ] Referral link (optional v2)

---

## 4. CSV Output Schema

| Column | Description | Example |
|--------|-------------|---------|
| `name` | Full name from signature/contacts | Sarah Chen |
| `email` | Primary email address | sarah@university.edu |
| `relationship_type` | AI-inferred category | classmate |
| `how_we_met` | One-sentence AI inference | Met via CS 301 project thread in Fall 2022 |
| `interaction_summary` | 2–3 sentence overview | Collaborated on senior capstone. She reached out twice for references. Last discussed job offers at Google. |
| `last_contact` | Date of most recent email | 2024-03-15 |
| `total_emails` | Count of mutual threads | 14 |
| `confidence` | AI confidence score | high / medium |
| `tags` | Auto-generated tags | classmate, cs-dept, hackathon |
| `linkedin_hint` | First/last for manual lookup | (for user to manually search) |

---

## 5. Technical Architecture

### 5.1 Stack
- **Framework:** Next.js 14 App Router
- **UI:** shadcn/ui + Tailwind CSS
- **Animation:** Framer Motion + GSAP (hero only)
- **Auth:** BetterAuth (Google provider plugin)
- **Payments:** Stripe code is preserved but currently bypassed (app is 100% free).
- **LLM:** OpenRouter API (model-agnostic, see 5.3)
- **Background jobs:** Vercel Background Functions or QStash (Upstash)
- **File storage:** Vercel Blob (temp, auto-delete)
- **Database:** Neon Postgres (via Drizzle ORM) — stores job status only, no email content
- **Email delivery:** Resend (download link delivery)

### 5.2 Data Flow (Privacy-first)
```
Gmail API → fetch threads (in-memory only)
         → filter + deduplicate
         → extract metadata (no full body stored)
         → OpenRouter LLM batch parse
         → build CSV string in memory
         → upload to Vercel Blob (15 min TTL)
         → send download link via Resend
         → delete Blob immediately after confirmed download
         → purge job record (keep only: job_id, status, timestamp)
```

**We never store:** email bodies, subject lines, contact names, or any PII beyond the user's own email address (for delivery).

### 5.3 LLM Strategy (OpenRouter)
Use OpenRouter to avoid vendor lock-in. Model routing:

| Task | Model | Reason |
|------|-------|--------|
| Contact extraction + summary | `anthropic/claude-3.5-sonnet` | Best at structured extraction |
| Fallback | `openai/gpt-4o-mini` | Cost-efficient fallback |
| Bulk deduplication | `meta-llama/llama-3.1-8b-instruct` | Fast + cheap for simple tasks |

**Optimization:** Batch contacts in groups of 25. Extract only: sender name, email, subject line snippets (first 100 chars), thread count. Never send full email bodies to LLM.

OpenRouter base URL: `https://openrouter.ai/api/v1`
Drop-in OpenAI SDK compatible.

### 5.4 Gmail Fetching Optimization
1. Use `gmail.users.threads.list` with `q` param to pre-filter:
   - `q: "in:sent OR in:inbox -category:promotions -category:updates -category:social"`
2. Apply user's domain blocklist to `q` param: `q: "-from:@mailchimp.com"`
3. Fetch thread metadata only first (no body) — `format: 'metadata'`
4. Filter to mutual threads (user sent at least 1 message in thread)
5. Only fetch full snippets for threads that pass mutual filter
6. Cap at 500 threads max (configurable)

### 5.5 Database Schema (Drizzle + Neon)
```sql
-- jobs table (status tracking only, no PII)
jobs (
  id          uuid PRIMARY KEY,
  user_email  text,           -- for delivery only
  status      text,           -- pending | processing | complete | failed
  filter_config jsonb,        -- user's filter settings
  contact_count int,          -- how many contacts found
  blob_url    text,           -- temp signed URL (nulled after download)
  created_at  timestamp,
  completed_at timestamp,
  downloaded_at timestamp
)

-- users table (BetterAuth managed)
-- BetterAuth handles this — do not hand-roll
```

---

## 6. Performance & Cost Estimates

**Per user cost:**
- Gmail API: free (within quota)
- OpenRouter (claude-3.5-sonnet): ~$0.003 per 1K tokens × ~50K tokens = ~$0.15
- Vercel Blob: negligible (< 1MB CSV, 15 min)
- Resend: free tier
- **Total COGS: ~$0.20–0.50 per user**
- **Margin at $9: N/A (App is currently 100% free)**

**Processing time target:** < 5 minutes for up to 500 contacts

---

## 7. Privacy & Compliance

- [ ] Privacy policy page at `/privacy`
- [ ] Terms of service at `/terms`
- [ ] Data deletion confirmation shown to user
- [ ] No email content stored at any point
- [ ] Google OAuth limited-use disclosure on landing page
- [ ] "Google API Services User Data Policy" compliance statement
- [ ] Data retention: job metadata only, auto-deleted after 30 days

---

## 8. Google OAuth Verification Checklist

To submit tonight:
- [ ] App homepage (live URL)
- [ ] Privacy policy URL (live)
- [ ] Authorized domains configured in Google Cloud Console
- [ ] OAuth consent screen filled out completely
- [ ] Scopes justified: `gmail.readonly` (read threads to build contact list), `contacts.readonly` (enrich with display names)
- [ ] Demo video: 2–3 min showing full flow (Loom)
- [ ] Data handling description: "Emails are read in-memory to extract contact metadata. No email content is stored. Data is deleted within 15 minutes of download."

---

## 9. Out of Scope (v1)

- Multi-provider (Outlook, etc.)
- Ongoing CRM sync
- User accounts / dashboards
- Mobile app
- Team/shared network features
- LinkedIn enrichment
- Referral program

---

## 10. Launch Checklist

- [ ] Domain: whodoyouknow.work (or similar)
- [ ] Vercel deployment
- [ ] Google Cloud project + OAuth app
- [ ] Stripe account + webhook
- [ ] OpenRouter account + API key
- [ ] BetterAuth configured
- [ ] Resend domain verified
- [ ] Neon DB provisioned
- [ ] Privacy policy live
- [ ] Google OAuth verification submitted
