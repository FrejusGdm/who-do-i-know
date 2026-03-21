# for agents

hey, if you're an AI reading this — welcome. here's what you need to know to not break things.

---

## what this is

a one-shot personal CRM generator. users connect Gmail, configure what they want scanned, pay $9, and get a CSV of every real person they've meaningfully emailed. the server then forgets everything.

it's a monolith Next.js 14 app (App Router). no separate backend. all frontend + backend logic lives in `src/`.

---

## stack at a glance

- **Next.js 14** — App Router, no pages directory
- **Tailwind CSS v3** + **shadcn/ui** (pinned to Radix UI primitives, not base-ui)
- **BetterAuth** — all auth. never hand-roll auth.
- **Drizzle ORM** — all DB access. schema lives in `src/db/schema.ts`.
- **Stripe** — checkout + webhooks
- **OpenRouter** — LLM calls (OpenAI-compatible SDK)
- **Vercel Blob** — temp CSV storage (15 min TTL)
- **Resend** — transactional email
- **Framer Motion + GSAP** — animations (GSAP only in Hero component)

---

## file structure

```
src/
  app/                  pages + API routes
    api/                all API endpoints (all use force-dynamic)
    globals.css         brand tokens + shadcn CSS vars
    layout.tsx          root layout
    page.tsx            landing page
    connect/            post-OAuth confirmation screen
    filter/             scan configuration
    checkout/           stripe redirect handler
    processing/         live progress screen
    download/[jobId]/   download + delivery screen
    privacy/            privacy policy (needed for Google review)
    terms/              terms of service
  components/
    landing/            Hero, HeroBackground, TrustBadges, SampleCsv
    filter/             FilterPanel (the big config form)
    processing/         ProgressStages, DownloadCard, ProcessingContent
    ui/                 shadcn primitives (button, card, badge, slider, switch, checkbox)
  db/
    index.ts            lazy-initialized drizzle client
    schema.ts           jobs table + BetterAuth tables
  lib/
    auth.ts             BetterAuth server config
    auth-client.ts      BetterAuth client
    pipeline.ts         the whole email processing pipeline + progressStore
    gmail.ts            Gmail API helpers
    openrouter.ts       LLM calls via OpenRouter
    stripe.ts           Stripe client
    resend.ts           Resend client
    csv.ts              CSV builder
  types/
    index.ts            shared TypeScript types
```

---

## things that will bite you

**service clients are lazy-initialized via Proxy.** DB, Stripe, Resend — they don't crash at build time if env vars are missing. the pattern is in `src/db/index.ts` and `src/lib/stripe.ts`. keep it this way or the build breaks.

**all API routes need `export const dynamic = "force-dynamic"`.** without it, Next.js tries to pre-render them and crashes.

**shadcn/ui components are Tailwind v3 + Radix UI.** do NOT run `npx shadcn@latest add` — it generates Tailwind v4 / base-ui components. if you add a component, copy from the existing ones in `src/components/ui/` as reference. use `@radix-ui/react-*` primitives.

**`useSearchParams` needs a Suspense boundary.** the processing page does this correctly — look at `src/app/processing/page.tsx`.

**the privacy invariant is sacred.** email bodies must never be written to disk, DB, or logs. if you're about to persist email content, stop.

**`progressStore` is an in-memory Map** in `pipeline.ts`. works fine locally. won't survive serverless cold starts in prod — known limitation.

---

## auth

BetterAuth handles everything. the config is in `src/lib/auth.ts`. check https://www.better-auth.com/docs before touching auth. don't hand-roll sessions or tokens.

OAuth scopes: `gmail.readonly` + `contacts.readonly`. these are the minimum needed and anything beyond them needs re-verification with Google.

---

## LLM modes

there are three, and the architecture changes based on which one is selected:

- **cloud** — server-side pipeline, OpenRouter API. default.
- **local (ollama)** — Gmail fetch is server-side, LLM calls are browser → `localhost:11434`. CSV is built client-side. data never touches server after fetch.
- **byok** — same as cloud but using the user's own API key.

the user picks the mode on the filter screen, before checkout.

---

## DB schema

just a `jobs` table (no email content ever) + BetterAuth's managed tables. see `src/db/schema.ts`.

run `npm run db:push` to push schema changes (needs `DATABASE_URL`).

---

## how to run

```bash
cp .env.example .env.local
# fill in the values
npm install
npm run dev       # port 3000
npm run build     # production build
npm run lint      # ESLint
npm run db:push   # push Drizzle schema
```

the app starts without env vars. the landing page and static pages render fine. API routes will fail if their required vars are missing.

---

## env vars that matter

- `DATABASE_URL` — Neon Postgres connection string
- `BETTER_AUTH_SECRET` — random secret for BetterAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — OAuth app
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `OPENROUTER_API_KEY`
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob
- `RESEND_API_KEY`
- `NEXT_PUBLIC_APP_URL` — full URL (e.g. `https://whodoyouknow.xyz`)

see `.env.example` for the full list.

---

## what's out of scope (v1)

- Outlook or other email providers
- user dashboards or ongoing sync
- LinkedIn enrichment
- team/shared network features
- mobile app

don't implement these unless explicitly asked.

---

## code style

- TypeScript strict. no `any`.
- no raw SQL — use Drizzle.
- all DB/service clients must be lazy-initialized.
- keep files under ~300 lines, refactor if they grow beyond that.
- no mock/stub data in code that runs in dev or prod.
