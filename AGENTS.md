# AGENTS.md

## Project Overview

**WhoDoYouKnow** is a one-shot personal CRM generator built with Next.js 14 (App Router). Users connect Gmail, configure filters, pay $9 via Stripe, and receive a CSV of their contacts enriched by LLM analysis. See `prd.md`, `design.md`, and `behavior-design.mc` for full product specs.

## Cursor Cloud specific instructions

### Service: Next.js 14 App (single service)

This is a monolith — all frontend and backend logic lives in one Next.js app. There are no separate backend services or microservices.

- **Dev server:** `npm run dev` (port 3000)
- **Build:** `npm run build`
- **Lint:** `npm run lint`

### Key gotchas

- **shadcn/ui components are pinned to Tailwind v3 compatible versions.** The `shadcn@latest` CLI generates Tailwind v4 / `@base-ui/react` components by default, but this project uses Next.js 14 + Tailwind v3. All shadcn UI components in `src/components/ui/` have been manually rewritten to use `@radix-ui/react-*` primitives. If adding new shadcn components, you must convert them to Tailwind v3 style (HSL CSS variables, `@radix-ui` primitives, no `@base-ui/react` imports).
- **No `.env.local` is committed.** The app requires several environment variables for full functionality (see `design.md` Section 2). For dev server startup alone, no env vars are needed — the landing page and static pages render without them.
- **Font files:** Geist font `.woff` files exist in `src/app/fonts/` from the Next.js scaffold but are not used; the layout uses Google Fonts (Playfair Display + Inter).
- **No database or external services needed for basic dev.** The dev server starts and all pages render without Postgres, Stripe, Google OAuth, or OpenRouter configured. Those are only needed when implementing the full pipeline.
