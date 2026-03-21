# AGENTS.md

This file is for AI coding agents (Cursor, Copilot, etc.). If you're a human, check out [README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) instead.

## Project Overview

**WhoDoYouKnow** is a one-shot personal CRM generator built with Next.js 14 (App Router). Users connect Gmail, configure filters, pay $9 via Stripe, and receive a CSV of their contacts enriched by LLM analysis. See `prd.md`, `design.md`, and `behavior-design.mc` for full product specs.

## Service: Next.js 14 App (single service)

This is a monolith -- all frontend and backend logic lives in one Next.js app. There are no separate backend services or microservices.

- **Dev server:** `npm run dev` (port 3000)
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **DB push:** `npm run db:push` (requires `DATABASE_URL`)

## Key architecture decisions

- **BetterAuth** handles all auth. Config in `src/lib/auth.ts`, client in `src/lib/auth-client.ts`, API route at `src/app/api/auth/[...all]/route.ts`.
- **Drizzle ORM** for all DB access. Schema in `src/db/schema.ts`. Only stores job metadata -- never email content.
- **All service clients (DB, Stripe, Resend) use lazy initialization** via Proxy to avoid build-time errors when env vars aren't set.
- **All API routes use `export const dynamic = "force-dynamic"`** to prevent Next.js from trying to pre-render them at build time.
- **Three LLM modes**: Cloud (OpenRouter server-side), Local (Ollama client-side), BYOK (user's own API key).

## Visual style

The app uses a black-and-white theme with grayscale accents. The brand colors are defined as CSS custom properties in `src/app/globals.css`:

- `--brand-cream` (white background)
- `--brand-ink` (black text and primary buttons)
- `--brand-accent` (gray accent for highlights, icons, hover states)
- `--brand-muted` (lighter gray for secondary text)

Fonts: Playfair Display (serif, headings) + Inter (sans, body). Components use shadcn/ui with Radix primitives. Icons from Lucide (rendered as inline SVG).

## Key gotchas

- **shadcn/ui components are pinned to Tailwind v3 compatible versions.** The `shadcn@latest` CLI generates Tailwind v4 / `@base-ui/react` components by default, but this project uses Next.js 14 + Tailwind v3. All components in `src/components/ui/` use `@radix-ui/react-*` primitives. If adding new components, you must convert them.
- **No `.env.local` is committed.** Copy `.env.example` to `.env.local` and fill in values. The dev server starts without env vars -- landing page and static pages render fine.
- **`useSearchParams` requires Suspense boundary** -- the processing page wraps its content in `<Suspense>` for this reason.
- **Pipeline progress uses an in-memory Map** (`progressStore` in `pipeline.ts`). This works for single-instance dev but won't persist across serverless function instances in production.
- **No emojis in the UI.** Use Lucide icons (SVG) instead. Keep the visual language clean and monochrome.
