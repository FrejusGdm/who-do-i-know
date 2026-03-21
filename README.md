# WhoDoYouKnow

WhoDoYouKnow is a one-time personal CRM generator.

You connect Gmail, choose filters, pay once, and download a CSV of real people you know.

## Start here

- Human guide: [`docs/HUMANS.md`](docs/HUMANS.md)
- Agent guide: [`docs/AGENTS.md`](docs/AGENTS.md)
- Product context: [`prd.md`](prd.md), [`design.md`](design.md)

## Quick local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env template:

   ```bash
   cp .env.example .env.local
   ```

3. Run the app:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## Useful scripts

```bash
npm run dev       # start dev server
npm run build     # production build
npm run start     # run production server
npm run lint      # lint checks
npm run db:push   # push schema to database
```

## Stack

- Next.js 14 (App Router)
- BetterAuth
- Drizzle ORM
- Stripe
- Resend
- Tailwind CSS + shadcn/ui
