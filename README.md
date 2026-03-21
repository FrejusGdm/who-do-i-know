# WhoDoYouKnow

Connect your Gmail. We scan your history, find every real person you've ever meaningfully emailed, and hand you a clean spreadsheet. One time. $9.

---

## what it is

a one-shot personal CRM generator. you connect Gmail, configure what gets scanned, pay, wait a few minutes, and download a CSV of your network. the server then deletes everything it learned about you.

no accounts. no dashboard. no ongoing anything.

---

## quick start

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run db:push               # push DB schema (needs DATABASE_URL)
npm run dev                   # http://localhost:3000
```

see [docs/for-humans.md](docs/for-humans.md) for full setup instructions and env var docs.

---

## docs

- **[docs/for-humans.md](docs/for-humans.md)** — setup, contributing, how the app works
- **[docs/for-agents.md](docs/for-agents.md)** — architecture notes, gotchas, patterns (for AI coding agents)
- **[prd.md](prd.md)** — full product requirements
- **[behavior-design.mc](behavior-design.mc)** — behavioral spec (LLM modes, page-by-page behavior, error states)

---

## stack

Next.js 14 · Tailwind CSS · shadcn/ui · BetterAuth · Drizzle ORM · Stripe · OpenRouter · Vercel Blob · Resend · Framer Motion

---

## license

MIT
