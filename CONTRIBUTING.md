# Contributing to WhoDoYouKnow

Hey, thanks for wanting to help out. Here's everything you need to know.

---

## Getting set up

```bash
git clone https://github.com/your-org/whodoyouknow.git
cd whodoyouknow
npm install
cp .env.example .env.local
npm run dev
```

The landing page and static pages work without any env vars. You only need to fill in `.env.local` if you're working on features that talk to external services (Gmail, Stripe, etc.). See the README for the full env var breakdown.

---

## How the codebase is organized

This is a Next.js 14 monolith. Frontend and backend all live in one app. No microservices, no separate API server.

- **Pages** live in `src/app/` -- each folder is a route
- **API routes** live in `src/app/api/` -- these are the backend endpoints
- **Components** live in `src/components/` -- organized by feature (landing, filter, processing)
- **UI primitives** live in `src/components/ui/` -- these are shadcn/ui components, don't edit by hand
- **Business logic** lives in `src/lib/` -- auth, Gmail fetching, Stripe, the processing pipeline, etc.
- **Database schema** lives in `src/db/schema.ts` -- Drizzle ORM, Neon Postgres

---

## Things to know before you code

### shadcn/ui is pinned to Tailwind v3

The project uses Next.js 14 + Tailwind v3. The `shadcn@latest` CLI will try to generate Tailwind v4 components using `@base-ui/react`. Our components use `@radix-ui/react-*` primitives instead. If you're adding a new shadcn component, you'll need to make sure it's compatible.

### Service clients use lazy initialization

All service clients (database, Stripe, Resend) are wrapped in a Proxy that lazy-initializes them. This prevents build-time crashes when env vars aren't set. If you're adding a new service client, follow the same pattern -- check `src/lib/stripe.ts` for an example.

### API routes are force-dynamic

Every API route exports `export const dynamic = "force-dynamic"` so Next.js doesn't try to pre-render them at build time. Don't forget this on new routes.

### useSearchParams needs Suspense

If you use `useSearchParams()` in a component, wrap it in a `<Suspense>` boundary. The processing page does this already -- look there for reference.

---

## Code style

- **Keep it simple.** If there's a straightforward way to do something, do it that way.
- **No duplicate code.** Before writing something new, check if it already exists somewhere.
- **Files under 300-500 lines.** If a file is getting long, break it up.
- **No mocked data outside of tests.** Dev and prod should always use real data paths.
- **Lint before you push.** Run `npm run lint` and fix any issues.

---

## Making a PR

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Run `npm run lint` (fix anything that comes up)
4. Run `npm run build` (make sure it builds clean)
5. Write a clear PR description -- what you changed and why
6. Open the PR

We'll review it and get back to you. No PR is too small.

---

## What to work on

Check the issues tab for things labeled `good first issue` or `help wanted`. If you have an idea for something new, open an issue first so we can chat about it before you put in the work.

---

## Questions?

Open an issue or reach out. We don't bite.
