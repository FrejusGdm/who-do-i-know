# WhoDoYouKnow

A one-shot personal CRM generator. Connect your Gmail, get a CSV of every real person you've meaningfully interacted with. Pay once ($9), download, done.

**You spent years meeting people. Don't lose them.**

---

## What is this?

WhoDoYouKnow scans your Gmail history, finds every real human you've exchanged emails with, uses AI to figure out who they are (classmate, coworker, mentor, etc.), and hands you a clean spreadsheet.

No accounts. No subscriptions. No data stored after you download. One and done.

### What you get

A CSV with columns like:

| Column | What it is |
|--------|-----------|
| name | Full name from email signatures/contacts |
| email | Their email address |
| relationship_type | AI-figured category (classmate, professional, etc.) |
| how_we_met | One-sentence AI guess based on your email context |
| interaction_summary | Quick overview of your history with them |
| last_contact | When you last emailed |
| total_emails | How many threads between you two |

### How it works

```
Landing page --> Sign in with Google --> Configure filters --> Pay $9 --> Processing --> Download CSV --> Data deleted
```

That's the whole flow. No dashboards, no ongoing anything.

---

## Running it locally

### Prerequisites

- Node.js 18+
- npm

### Quick start

```bash
# Clone it
git clone https://github.com/your-org/whodoyouknow.git
cd whodoyouknow

# Install dependencies
npm install

# Set up your environment
cp .env.example .env.local
# Fill in the values (see below)

# Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The landing page works without any env vars. You only need them once you start using the actual Gmail/Stripe/DB features.

### Environment variables

Copy `.env.example` to `.env.local` and fill in what you need. Here's the breakdown:

| Variable | What it's for | Required for dev? |
|----------|--------------|-------------------|
| `BETTER_AUTH_SECRET` | Auth session signing | Yes (any random string works) |
| `BETTER_AUTH_URL` | Auth base URL | Yes (`http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | Google OAuth | Only for Gmail features |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | Only for Gmail features |
| `OPENROUTER_API_KEY` | AI contact analysis | Only for cloud processing |
| `STRIPE_SECRET_KEY` | Payments | Only for checkout flow |
| `STRIPE_WEBHOOK_SECRET` | Payment confirmation | Only for checkout flow |
| `STRIPE_PRICE_ID` | The $9 product | Only for checkout flow |
| `DATABASE_URL` | Neon Postgres | Only for job tracking |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage | Only for file downloads |
| `RESEND_API_KEY` | Email delivery | Only for sending download links |
| `RESEND_FROM_EMAIL` | Sender address | Only for sending download links |
| `NEXT_PUBLIC_APP_URL` | Public app URL | Yes (`http://localhost:3000`) |

You don't need all of these to hack on the frontend. The app is designed to start fine without them.

### Useful commands

```bash
npm run dev        # Start dev server on port 3000
npm run build      # Production build
npm run lint       # ESLint check
npm run db:push    # Push schema to database (needs DATABASE_URL)
npm run db:generate # Generate Drizzle migrations
npm run db:studio  # Open Drizzle Studio (DB browser)
```

---

## Tech stack

- **Next.js 14** (App Router) -- everything lives in one app, frontend and backend
- **Tailwind CSS** + **shadcn/ui** -- styling and components
- **BetterAuth** -- authentication (Google OAuth)
- **Drizzle ORM** + **Neon Postgres** -- database (only stores job metadata, never emails)
- **Stripe** -- one-time $9 payment
- **OpenRouter** -- AI processing (model-agnostic LLM access)
- **Framer Motion** + **GSAP** -- animations
- **Vercel Blob** -- temporary file storage for CSV downloads
- **Resend** -- email delivery

---

## Project structure

```
src/
  app/                    # Next.js App Router pages and API routes
    api/                  # Backend endpoints (auth, checkout, processing, etc.)
    connect/              # Post-OAuth connection confirmation
    filter/               # Scan configuration page
    checkout/             # Payment page
    processing/           # Real-time progress page
    download/[jobId]/     # CSV download page
    privacy/              # Privacy policy
    terms/                # Terms of service
  components/
    landing/              # Hero, trust badges, sample CSV preview
    filter/               # Filter configuration panel
    processing/           # Progress stages, download card
    ui/                   # shadcn/ui base components
  db/                     # Drizzle schema and database client
  lib/                    # Auth, Gmail, Stripe, OpenRouter, pipeline logic
  types/                  # TypeScript type definitions
```

---

## Three ways to process contacts

1. **Cloud (OpenRouter)** -- default, fastest, no setup needed on your end
2. **Local (Ollama)** -- your data never leaves your machine. Install [Ollama](https://ollama.com), pull a model, and go
3. **BYOK (Bring Your Own Key)** -- use your own OpenRouter-compatible API key

---

## Privacy

This is a privacy-first tool. Here's the deal:

- We request **read-only** Gmail access. We can't send emails or touch your account.
- Email content is processed **in memory only**. Never stored, never logged.
- Your CSV download is auto-deleted within 15 minutes.
- Google access tokens are deleted immediately after processing.
- The database only stores job status (pending/complete/failed). No email content, no contact names, nothing personal.

See `/privacy` and `/terms` in the app for the full policies.

---

## Contributing

We'd love your help. Check out [CONTRIBUTING.md](CONTRIBUTING.md) for the details, but the short version:

1. Fork it
2. Make a branch
3. Do your thing
4. Make sure `npm run lint` passes
5. Open a PR

---

## License

MIT
