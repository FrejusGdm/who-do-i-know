# Backend Fixes

**Date:** 2026-03-21

## Fix 1: Pipeline never starts (401 + fire-and-forget failure)

**Problem:** The `/api/job` route triggered processing via a fire-and-forget `fetch()` to `/api/process`. This server-to-server HTTP call failed because:
- BetterAuth session cookies weren't forwarded (causing 401)
- Even after removing the auth check, the fire-and-forget fetch could fail silently with no error feedback

**Impact:** The processing page sat stuck on "Connecting to Gmail" for 5 minutes, then the SSE stream timed out. Users saw no error.

**Fix:** Eliminated the HTTP fetch pattern entirely. The `/api/job` route now:
1. Authenticates the user directly (browser request has cookies)
2. Looks up the Google access token from the `account` table
3. Calls `runCloudPipeline()` directly as a fire-and-forget promise in the same process

**Why this works:** In the same Node.js process, the in-memory `progressStore` Map is shared between the pipeline and the SSE endpoint, so progress events flow correctly.

**Files changed:**
- `src/app/api/job/route.ts` — Merged token lookup + direct pipeline call
- `src/app/api/process/route.ts` — Kept as manual retry endpoint (no longer auto-called)

## Fix 2: Two-pass Gmail fetch (performance)

**Problem:** Switching from `format: "metadata"` to `format: "full"` caused the Gmail fetch to download 25-250MB instead of ~500KB (full email bodies for all 500 threads).

**Fix:** Two-pass approach:
1. Pass 1: Scan all threads with `format: "metadata"` (fast, ~1KB per thread)
2. Pass 2: Re-fetch only qualifying threads with `format: "full"` (50-80% fewer)

**Files changed:**
- `src/lib/gmail.ts` — Two-pass fetch logic
- `src/lib/pipeline.ts` — Granular progress callbacks for fetch/filter/enrich stages

## Fix 3: Hero button loading state

**Problem:** "Get My Network — Free" button had no visual feedback during Google OAuth redirect.

**Fix:** Added `useState` for loading, spinner animation + "Connecting..." text on click.

**Files changed:**
- `src/components/landing/Hero.tsx` — Loading state + disabled during redirect

## Architecture note: async processing patterns

**Current pattern (good for dev/low traffic):**
- Direct function call with fire-and-forget promise
- In-memory progress store (Map)
- SSE polling from client

**For production scale, consider:**
- Job queue (Upstash QStash or BullMQ) for reliable processing
- Redis/database-backed progress tracking (survives cold starts)
- Webhook callbacks instead of long-lived SSE connections
