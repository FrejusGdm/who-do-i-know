# Human Guide

This file is for people who want to run, understand, or contribute to the app.

## What this app does

WhoDoYouKnow helps you build a private relationship memory from Gmail. It stores people, conversations, private notes, AI summaries, and mentor-signal rankings, then lets you export the pieces you need as CSVs.

Flow:

1. Connect Gmail (Google OAuth)
2. Pick filters (date range, domains, categories)
3. Choose processing mode (Cloud, Local/Ollama, or Bring Your Own Key)
4. Save relationship memory to the database
5. Run queued AI workers for thread summaries, person summaries, and mentor-signal reviews
6. Use the dashboard, person detail pages, Mentor Finder, and CSV exports

## Run it locally

1. Install packages:

   ```bash
   pnpm install
   ```

2. Create local env file:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in required env vars (see "Environment Variables" below)

4. Push the database schema:

   ```bash
   pnpm db:push
   ```

5. Start dev server:

   ```bash
   pnpm dev
   ```

6. Open http://localhost:3000

## Environment Variables

```bash
# Auth (self-hosted, no external API key needed)
BETTER_AUTH_SECRET=           # random secret, generate with: openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Database (Neon Postgres)
DATABASE_URL=

# Storage (optional; local dev falls back to temp CSV files)
BLOB_READ_WRITE_TOKEN=

# LLM - only needed for Cloud mode (optional if using Ollama)
OPENROUTER_API_KEY=

# Email delivery (optional)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@whodoyouknow.work

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Auth Setup (BetterAuth)

BetterAuth is self-hosted — no external auth service or API key. It runs inside the Next.js app.

Key files:
- `src/lib/auth.ts` — server config (Google OAuth, Drizzle adapter, session)
- `src/lib/auth-client.ts` — client helpers (`signIn`, `signOut`, `useSession`)
- `src/app/api/auth/[...all]/route.ts` — catch-all auth API route
- `src/db/schema.ts` — auth tables (user, session, account, verification)

If you add a Better Auth plugin, add it to **both** `auth.ts` (server) and `auth-client.ts` (client).

To regenerate auth tables after adding plugins:
```bash
npx @better-auth/cli generate   # creates auth-schema.ts
# Merge into src/db/schema.ts, then delete auth-schema.ts
pnpm db:push
```

## Processing Modes

The app supports 3 ways to run AI relationship processing:

### Cloud (OpenRouter)
- Requires `OPENROUTER_API_KEY` in `.env.local`
- Uses the default model configured in `src/lib/openrouter.ts`
- Fastest option, works in production

### Local (Ollama) — privacy-first
- Runs entirely on your machine, no data leaves localhost
- **Only works in local dev** (Vercel can't reach your localhost)

Setup:
1. Download and install Ollama from [ollama.com](https://ollama.com)
2. Pull a model:
   ```bash
   ollama pull llama3.1:8b
   ```
3. Ollama starts automatically as a background service on port 11434
4. In the app, select "Local (Ollama)" on the filter page
5. The app auto-detects Ollama and lists your available models

How it works under the hood:
- Ollama exposes an OpenAI-compatible API at `http://localhost:11434/v1`
- The server-side API route calls it using the same OpenAI SDK, just with a different `baseURL`
- No API key needed, no CORS issues (server-to-server on localhost)

If Ollama isn't running, the UI shows a clear error with install instructions and a retry button.

### Bring Your Own Key (BYOK)
- User provides their own OpenRouter API key
- Key is used for that session only, never stored
- Same models and behavior as Cloud mode

## Relationship Memory Pipeline

The Gmail pipeline does not produce one generic row per contact anymore. It saves durable relationship memory first, then uses a task queue so multiple AI passes can work over the same raw material:

- Gmail sync saves `people`, `contact_methods`, `email_threads`, `email_messages`, and `person_thread_links`.
- If full-context processing is enabled, `email_messages.body_text` stores the raw message body for later summarization and reprocessing.
- `ai_processing_tasks` queues independent workers for `thread_summarizer`, `person_summarizer`, and `mentor_signal_reviewer`.
- `ai_thread_summaries` captures what happened in each thread, including topics, personal details, follow-up signals, evidence, and confidence.
- `ai_person_summaries` combines thread summaries plus private notes into relationship summaries, how-you-know-them, why-they-matter, notable advice, open loops, and mentor-signal score.
- `outreach_tasks` is currently used as the Mentor Finder table. It stores candidates and evidence, not generated outreach drafts.
- Manual notes on a person detail page enqueue a fresh person summary task.
- `people.review_status` drives the human review lifecycle: `new`, `needs_review`, `confirmed`, `not_mentor`, or `archived`.
- `/review` is the spreadsheet-style cleanup workspace for confirming mentors, marking friends, adding phone/social links, and archiving noisy senders.
- Default People and contact exports hide archived records. The mentor export only includes confirmed mentors.

You can resume queued work with `POST /api/ai/process` while authenticated. The body can include `maxTasks`, `providerMode`, `byokApiKey`, `byokProvider`, and `ollamaModel`.

## Database

All tables in `src/db/schema.ts`. Uses Drizzle ORM with Neon Postgres.

Auth tables (managed by Better Auth): `user`, `session`, `account`, `verification`
Core app tables: `jobs`, `people`, `contact_methods`, `email_threads`, `email_messages`, `person_thread_links`, `ai_processing_tasks`, `ai_thread_summaries`, `ai_person_summaries`, `notes`, `tags`, `person_tags`, `outreach_tasks`, `imports`, `sync_runs`

Commands:
```bash
pnpm db:push       # push schema changes to Neon
pnpm db:generate   # generate migration files
pnpm db:studio     # open Drizzle Studio
```

## Main folders

- `src/app` — routes and API endpoints
- `src/components` — UI and flow components
- `src/lib` — auth, Gmail, AI worker queue, relationship memory, pipeline, CSV exports, Stripe, email
- `src/db` — schema and DB client
- `src/types` — shared TypeScript types

## Commands

```bash
pnpm dev           # start dev server
pnpm lint          # run linter
pnpm build         # production build
pnpm db:push       # push schema to DB
pnpm db:studio     # open Drizzle Studio
```

## Before opening a PR

1. Keep changes focused and small.
2. Run lint and build locally.
3. Add or update docs if behavior changed.
4. Include what you changed and why.
