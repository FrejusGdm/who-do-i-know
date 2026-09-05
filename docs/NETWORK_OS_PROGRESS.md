# Network OS implementation progress

## Objective and completion criteria

Implement the full Network OS PRD through M1–M6, including secure private workflows, polished responsive UI, durable jobs/files, verified AWS deployment and a tested RDS migration (or an explicitly documented deployment exception). A successful local build alone is not completion. No messages may be sent to contacts. Local commits only; no push or merge.

## Baseline — 2026-09-06

- Starting branch: `feature/download-everyone`; starting commit: `e4e930e5d3591f4c42318d052fd3dc6f3c59ccb0`.
- Implementation branch: `codex/network-os`.
- Pre-existing tracked edits: `.env.example` (+3), `.gitignore` (+3, private interview ignore rule from PRD preparation), `src/lib/archive-materialize.ts` (+174/-149). Preserve these edits; stage only our new hunks if touching the archive file.
- Pre-existing untracked paths: `.agents/`, `.claude/`, `CONTEXT.md`, `_watch.mjs`, `cs72-hw1.py`, the PRD and implementation prompt, `exports/`, `goal.md`, `linkedin-dump/`, `notes/`, `public/demo-whoYouKnow.mp4`, `skills-lock.json`, `tests/`. The PRD/glossary/handoff are intentional project artifacts; other unrelated files and private data remain unstaged.
- Existing runtime: Next 15.5.14, React 19, Drizzle + Neon HTTP, BetterAuth. PostgreSQL CLI/server binaries are available locally for isolated integration tests.
- Fresh baseline `npm run lint` and `npm run build` passed on 2026-09-06 before feature changes.

## Milestones

| Milestone | Status | Evidence / remaining work |
| --- | --- | --- |
| M0: baseline and design | In progress | Repo and objective inspected; branch created; dependency/security audit pending |
| M1: people, circles, interactions, cadence | In progress | Calendar semantics and transactional store implemented; 9 unit tests and 5 local PostgreSQL integration tests passed; routes/UI still pending |
| M2: interviews and reviewed memory | Not started | Persistent turns, grounded proposals, atomic review, correction |
| M3: Today and reconnecting | Not started | Due queue, open loops, preferences, optional grounded drafts |
| M4: cohort import and voice | Not started | Roster source/reconciliation, private audio/transcription |
| M5: UI and data controls | Not started | Browser verification, export/deletion/privacy |
| M6: AWS, workers, RDS | Not started | Credit/cost/resource audit, IaC, durable storage/jobs, migration/restore/deployment |

## Security findings to resolve

- Current API middleware assumes a non-secure cookie name; every API still needs actual server session validation.
- Missing private-user configuration currently allows any authenticated email. Production needs a closed owner allowlist and verified identity.
- Auth currently has a development secret fallback and requests Gmail scopes during all Google sign-ins.
- Existing import-derived `lastContactedAt` and mentor-review completion must not become meaningful-contact evidence automatically.
- Existing archive uses local paths and the pipeline uses process memory; both must become durable before deployment.
- Production DB remains untouched. Test against a dedicated local database, never by automatically loading `.env.local`.

## Continuation

Next: finish verification and commit the authentication/upload hardening checkpoint, then expose the M1 store through owner-scoped routes and working People, Circles, Person and Today screens. Keep reviewing and committing small verified slices and record commit IDs below. AWS credit coverage, domain and model configuration are deployment inputs; they do not block local work.

## Checkpoints

- `576b476`: committed the PRD, glossary, handoff and baseline record. No private notes committed.
- `716a395` — M1 storage: nullable person email, same-owner composite foreign keys, circles, explicit interactions, separate contact plans/check-in decisions, settings. Standard PostgreSQL driver replaces Neon HTTP to support atomic operations and future RDS. Remote TLS certificate verification is enforced.
- Local integration DB: disposable `network_os_test` on localhost:55439, cluster `/private/tmp/network-os-pg/data`. No live Neon schema/data has been changed. Tests require an explicit `TEST_DATABASE_URL` with a local host and `_test` database suffix; no production fallback.
- Migration `0005_network_foundation.sql` generated then reviewed: reordered unique indexes before composite FK creation after the first local migration test exposed generator ordering. Fresh migration and retry tests now pass.
- One compatibility guard added to the user's pre-existing uncommitted archive edits: omit null primary emails from its temporary email-to-ID map. This hunk stays uncommitted with the user's archive work; the committed pre-existing archive implementation does not contain the affected loop. Do not stage the whole archive file.
- Baseline dependency audit reports 37 advisories (2 critical, 21 high, 11 moderate, 3 low). Applicable Next.js/BetterAuth/Drizzle patches are being evaluated before deployment; this storage checkpoint is not a security release. Do not apply `npm audit fix --force`.

## Local verification commands

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

For database integration tests, set `NODE_ENV=test` and `TEST_DATABASE_URL=postgresql://network_test@127.0.0.1:55439/network_os_test`, then run `npm run test:integration`. The cluster is test-only; starting it may require sandbox approval for local sockets/shared memory.

Remote database connections require a valid certificate chain. Set `DATABASE_CA_FILE` for an additional trusted RDS CA bundle if needed; do not disable verification. `DATABASE_POOL_SIZE` defaults to 5 and is bounded to 1–30. Production schema changes run through reviewed `npm run db:migrate`, never build-time migration or `db:push`.

## Security checkpoint

- Updated Next to 15.5.25, BetterAuth to 1.6.30, Drizzle to 0.45.2, adm-zip to 0.6.0 and direct PostCSS to 8.5.28. Removed unused `@better-auth/infra`, which pulled an old SSO plugin. No forced major upgrades.
- Closed owner allowlist, verified identity on private requests and user/session creation, lazy production configuration validation, seven-day sessions, secure-cookie middleware support, exact-origin mutation checks.
- Bounded JSON and LinkedIn multipart streams, ZIP central-directory limits, safe paths and sanitized import errors.
- 16 unit tests and six local PostgreSQL integration tests pass, including actual signed cookies, tampering, expiration and denied session creation. Denied user creation is also tested. Type checking, lint and the production build passed. New UI changes made after the build are a separate, unverified slice.
- Audit after patches: 28 reported vulnerabilities (0 critical, 13 high, 12 moderate, 3 low). Remaining advisories include tooling/CLI dependencies, transitive fetch/image libraries and Next's bundled PostCSS. These still need reachability assessment and targeted fixes before deployment. Do not interpret reduced counts as a clean security audit or blindly upgrade to suggested older Drizzle tooling.
- Production data, AWS resources and Neon remain untouched. No email/contact messages sent.
