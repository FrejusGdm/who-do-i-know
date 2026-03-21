# Human Guide

This file is for people who want to run, understand, or contribute to the app.

## What this app does

WhoDoYouKnow helps you export your real network from Gmail into a clean CSV.

Flow:

1. Connect Gmail
2. Pick filters
3. Pay once
4. Download CSV

## Run it locally

1. Install packages:

   ```bash
   npm install
   ```

2. Create local env file:

   ```bash
   cp .env.example .env.local
   ```

3. Start dev server:

   ```bash
   npm run dev
   ```

4. Open http://localhost:3000

## Main folders

- `src/app`: routes and API endpoints
- `src/components`: UI and flow components
- `src/lib`: auth, Gmail, LLM, Stripe, CSV pipeline
- `src/db`: schema and DB client

## Commands you will use

```bash
npm run dev
npm run lint
npm run build
npm run db:push
```

## Before opening a PR

1. Keep changes focused and small.
2. Run lint and build locally.
3. Add or update docs if behavior changed.
4. Include what you changed and why.
