# Agent Guide

This file is for AI agents and automation contributors.

Use simple, safe changes that match the current codebase.

## Goal

Ship small, correct changes without introducing new patterns unless needed.

## Project shape

- One Next.js 14 app (frontend + backend together)
- Auth: BetterAuth — self-hosted, no external API key
  - Server: `src/lib/auth.ts` (pass `schema` to Drizzle adapter)
  - Client: `src/lib/auth-client.ts`
  - Auth tables in `src/db/schema.ts`: user, session, account, verification
  - Google OAuth access token lives in the `account` table, NOT in `session.token`
- DB: Drizzle + Neon Postgres (`src/db/schema.ts`)
- LLM: 3 modes — cloud (OpenRouter), local (Ollama at localhost:11434/v1), byok
  - All use the OpenAI SDK with different `baseURL`
  - Client creation: `src/lib/openrouter.ts` → `createClient(mode)`
  - Model name flows: FilterPanel → filter page → /api/job → /api/process → pipeline → extractContacts
- Processing pipeline: `src/lib/pipeline.ts`

## Rules for edits

1. Reuse existing patterns first.
2. Avoid duplicate logic.
3. Keep dev/test/prod behavior in mind.
4. Do not add mock or fake data outside tests.
5. Keep files clean and organized.
6. Prefer small refactors over big rewrites.

## API route rule

All API routes should export:

```ts
export const dynamic = "force-dynamic";
```

This avoids build-time prerender issues.

## UI rule

Project uses Tailwind v3-compatible shadcn/radix components in `src/components/ui`.

If adding a component, keep it compatible with this stack.

## Validation checklist

Before finishing:

1. Run `npm run lint`
2. Run `npm run build`
3. Confirm no unrelated files were changed
4. Update docs when behavior or setup changes
