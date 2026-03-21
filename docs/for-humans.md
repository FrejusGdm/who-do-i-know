# for humans

**WhoDoYouKnow** — connect your Gmail, get a CSV of everyone you've ever meaningfully emailed. one time, $9. the server then deletes everything it knows about you.

this is open source. here's how to get it running and how to contribute.

---

## what it does

you connect Gmail → configure what gets scanned → pay $9 via Stripe → wait a few minutes → download a spreadsheet of your network.

each contact in the CSV has: name, email, relationship type, how you met, a short summary, last contact date, email count, confidence score, and tags.

after you download, your data is gone from the server within 15 minutes.

---

## the flow

```
/ (landing)
  → /connect       sign in with Google
  → /filter        pick what gets scanned (dates, domains, categories, etc.)
  → /checkout      stripe, $9
  → /processing    live progress updates
  → /download      your CSV, expiring link
```

---

## getting it running locally

### 1. clone + install

```bash
git clone <repo>
cd whodoyouknow
npm install
```

### 2. set up env vars

```bash
cp .env.example .env.local
```

open `.env.local` and fill in what you have. the app starts without all of them — the landing page works, API routes will fail if they're missing their deps.

minimum to get the full flow working:
- a Neon (or any Postgres) database
- Google OAuth app with `gmail.readonly` + `contacts.readonly` scopes
- Stripe account + webhook
- OpenRouter API key

### 3. push the database schema

```bash
npm run db:push
```

this needs `DATABASE_URL` set.

### 4. run it

```bash
npm run dev
```

goes on port 3000. that's it.

---

## env vars

| var | what it's for |
|-----|--------------|
| `DATABASE_URL` | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | random secret string (just mash keys) |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app secret |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |
| `RESEND_API_KEY` | Resend API key (email delivery) |
| `NEXT_PUBLIC_APP_URL` | full app URL e.g. `https://whodoyouknow.xyz` |

see `.env.example` for the complete list with comments.

---

## project structure

```
src/app/           pages + API routes
src/components/    UI components
  landing/         hero, trust badges, sample CSV preview
  filter/          the scan config form
  processing/      progress stages + download card
  ui/              shadcn primitives
src/lib/           business logic
  pipeline.ts      the whole email processing pipeline
  gmail.ts         Gmail API helpers
  openrouter.ts    LLM inference
  auth.ts          BetterAuth config
src/db/
  schema.ts        database schema (jobs table only, no email content)
docs/              you're reading this
```

---

## LLM options

the filter screen lets users pick how the AI analysis runs:

- **cloud** (default) — server calls OpenRouter with your API key. fastest, no user setup.
- **local (ollama)** — user runs Ollama locally. LLM calls go browser → `localhost:11434`. data never leaves their machine. slower, requires Ollama installed.
- **byok** — user pastes their own API key. same as cloud but on their dime.

---

## privacy design

nothing scary goes to the database. ever.

what gets stored: job status, user email (for delivery), filter config (deleted after job completes).

what never gets stored: email bodies, subject lines, contact names, the CSV itself (only a 15-min signed URL to Vercel Blob).

in local mode, nothing except job status touches the server.

---

## contributing

this is a monolith — all frontend and backend in one Next.js app. no microservices.

a few things to know before you dig in:

**auth is BetterAuth.** don't touch `src/lib/auth.ts` unless you've read https://www.better-auth.com/docs.

**DB access is all Drizzle.** no raw SQL. schema is in `src/db/schema.ts`.

**all API routes need `export const dynamic = "force-dynamic"`.** without it, Next.js tries to statically render them.

**shadcn components are pinned to Tailwind v3 / Radix UI.** don't run `npx shadcn@latest add` — it generates Tailwind v4 components. add new components manually following the pattern in `src/components/ui/`.

**check lint before committing.** `npm run lint` should be clean.

---

## deploying

this is built for Vercel. a few things to set up:

1. Neon Postgres database
2. Vercel Blob storage (for temp CSVs)
3. all env vars configured in Vercel dashboard
4. Stripe webhook pointed at `https://yourdomain/api/webhook/stripe`
5. Google OAuth app with your domain authorized

for Google OAuth verification (required to get out of test mode), see the verification section in `behavior-design.mc`.

---

## questions / issues

file a GitHub issue or email support@whodoyouknow.xyz.
