# Security Architecture

This document describes the security model for the WhoDoYouKnow application.

---

## Authentication

### Stack

- **BetterAuth** (self-hosted) with Google OAuth
- **Drizzle ORM** adapter for session/account storage in Neon Postgres
- **nextCookies plugin** for automatic cookie management in Next.js

### Session lifecycle

1. User signs in via Google OAuth at `/api/auth/*`
2. BetterAuth creates a session (seven-day lifetime, refreshed at most once a day) and sets a `better-auth.session_token` cookie
3. API routes validate sessions via `auth.api.getSession({ headers })`
4. Expired sessions require re-authentication; revoked or unverified owners cannot use private routes

### Startup guard

`src/lib/auth.ts` initializes lazily. At runtime in production it requires a secret of at least 32 characters, an HTTPS auth URL, Google OAuth credentials, and a nonempty private owner allowlist. Builds do not access production credentials. The development fallback secret is rejected in production.

User and session creation require an allowlisted, verified email. Route guards repeat this check so removing an owner from the allowlist also revokes access through existing sessions. Missing allowlist configuration fails closed in every environment.

---

## API Route Protection

### Three-layer defense

1. **Middleware** (`src/middleware.ts`) — checks for session cookie presence on all `/api/*` routes (except BetterAuth and the signature-verified Stripe webhook). Both ordinary and production `__Secure-` cookie names are recognized. Cookie presence is only an early gate; handlers still verify the session. Custom API mutations also require an exact configured Origin and reject cross-site Fetch Metadata. Private API responses use `Cache-Control: private, no-store`.

2. **Route-level session validation** — each route calls `requireSession()` from `src/lib/auth-guard.ts` to fully validate the session (not just cookie presence).

3. **Ownership verification** — routes that access job data call `requireJobOwnership(jobId, userEmail)` to ensure the authenticated user owns the requested resource. Non-matching jobs return 404 (not 403) to avoid confirming job existence.

### Route auth matrix

| Route | Auth | Ownership | Notes |
|-------|------|-----------|-------|
| `POST /api/job` | Session | N/A (creates job) | Creates job for authenticated user |
| `GET /api/job/[jobId]` | Session | Yes | Returns job status |
| `GET /api/download/[jobId]` | Session | Yes | Returns CSV or download URL |
| `GET /api/progress/[jobId]` | Session | Yes | SSE stream of pipeline progress |
| `GET /api/job/by-session` | Session | Yes | Maps Stripe session to job |
| `POST /api/process` | Session | Yes | Manual pipeline retry |
| `POST /api/ai/process` | Session | User scoped | Processes queued AI relationship-memory tasks |
| `POST /api/prescan` | Session | N/A | Counts Gmail threads |
| `GET /api/exports/[exportType]` | Session | User scoped | Exports the authenticated user's relationship memory |
| `PATCH /api/outreach/[taskId]` | Session | User scoped | Updates mentor review task and linked person lifecycle state |
| `PATCH /api/people/[personId]` | Session | User scoped | Edits a person profile and review lifecycle state |
| `POST /api/people/[personId]/notes` | Session | User scoped | Adds private context and queues person reprocessing |
| `POST /api/checkout` | Session | N/A | Creates Stripe checkout |
| `POST /api/webhook/stripe` | Stripe signature | N/A | Verified via `stripe.webhooks.constructEvent()` |
| `/api/auth/*` | BetterAuth | N/A | Handles its own auth |

### Adding new API routes

When adding a new route under `src/app/api/`:

```ts
import { requireSession, requireJobOwnership } from "@/lib/auth-guard";

export async function GET(req: NextRequest, { params }) {
  const { session, error: authErr } = await requireSession();
  if (authErr) return authErr;

  // If the route accesses a specific job:
  const { job, error: jobErr } = await requireJobOwnership(jobId, session.user.email);
  if (jobErr) return jobErr;

  // ... route logic
}
```

The middleware will catch missing cookies, but always add route-level checks as well.

---

## Job Ownership Model

Jobs are scoped by `userEmail`. The `jobs` table stores the email of the user who created the job. All operations on a job verify that the requesting user's email matches `job.userEmail`.

This means:
- User A cannot view, download, or re-trigger User B's jobs
- Job IDs (UUIDs) are not treated as secrets — auth + ownership is required regardless

---

## Pipeline Invocation

### From the app (primary flow)

`POST /api/job` creates a job and triggers `runCloudPipeline()` directly via Next.js `after()` callback. The pipeline runs after the response is sent, keeping the function alive.

### From Stripe webhook (legacy/payment flow)

`POST /api/webhook/stripe` verifies the Stripe signature, inserts a job, and calls `runCloudPipeline()` directly via `after()`. No HTTP call to `/api/process` is made — the pipeline runs in the same process.

### Manual retry

`POST /api/process` is available as an authenticated retry endpoint. It requires a valid session and job ownership.

---

## Path Confinement

The download route (`/api/download/[jobId]`) reads local CSV files from the filesystem when running in local/self-hosted mode. The `blobUrl` stored in the database is validated before reading:

```ts
const resolvedPath = resolve(job.blobUrl);
const allowedDir = resolve(tmpdir());
if (!resolvedPath.startsWith(allowedDir + "/")) {
  return 403; // Invalid file path
}
```

This prevents path traversal attacks if a `blobUrl` value is ever corrupted or manipulated.

---

## BYOK Key Handling

When users provide their own API key (BYOK mode):

- The key is accepted in `POST /api/job` and passed directly to the pipeline in-process
- The key is **never** stored in the database
- The key is **never** stored in Stripe metadata or any third-party system
- The key exists only in server memory during pipeline execution

---

## Security Headers

Configured in `next.config.mjs` for all routes:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Prevent clickjacking via iframes |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforce HTTPS |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable unused browser APIs |

---

## Email Security

The `sendDownloadEmail()` function in `src/lib/resend.ts`:

- Validates that `downloadUrl` starts with `https://` — refuses to send emails with local file paths
- Escapes the URL with HTML entity encoding before interpolation into the email template
- Prevents XSS injection via crafted URLs in email bodies


## Network OS input and storage boundaries

New JSON endpoints read a bounded stream (64 KiB by default), require JSON content, and validate fields with Zod. Database errors are not returned to clients. LinkedIn ZIP parsing limits compressed and expanded sizes, entry count and per-file size before extraction; unsafe or duplicate paths are rejected. LinkedIn multipart uploads are bounded before parsing, including when Content-Length is absent or understated. Durable file handling remains deployment work.

Relationship operations enforce owner IDs in queries and composite foreign keys. Recording an interaction and updating its contact plan share a transaction and idempotency key. Unknown dates and non-contact actions cannot advance cadence. Remote PostgreSQL connections verify TLS certificates; URL parameters cannot disable verification.

## Known deployment work

This document describes implemented boundaries, not a deployment security certification. Gmail scopes are still requested at sign-in and need a separate optional connection flow. Existing local archive storage and in-memory pipeline progress need durable replacements. Private object storage, worker permissions, retention, AI review and export/deletion controls are tracked in the Network OS PRD and progress record.
