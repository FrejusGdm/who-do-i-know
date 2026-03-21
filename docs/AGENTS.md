# Agent Guide

This file is for AI agents and automation contributors.

Use simple, safe changes that match the current codebase.

## Goal

Ship small, correct changes without introducing new patterns unless needed.

## Project shape

- One Next.js 14 app (frontend + backend together)
- Auth: BetterAuth (`src/lib/auth.ts`)
- DB: Drizzle (`src/db/schema.ts`)
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
