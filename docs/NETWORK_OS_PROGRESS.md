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
| M0: baseline and design | In progress | Repo and objective inspected; branch created; initial security patches committed; remaining dependency assessment before deployment |
| M1: people, circles, interactions, cadence | In progress | Storage, owner-scoped routes and working People/Circles/Person/Today UI implemented; 17 unit tests, 8 PostgreSQL tests and full desktop/mobile browser flow passed; production build, type checking and lint passed |
| M2: interviews and reviewed memory | In progress | Storage, authenticated API, capture/review UI and profile source links implemented; browser and database checks pass. Real provider/jobs, autosave, source correction and deletion remain |
| M3: Today and reconnecting | In progress | Due queue derives state on read; open loops, preferences, personal updates and optional grounded drafts remain |
| M4: cohort import and voice | Not started | Roster source/reconciliation, private audio/transcription |
| M5: UI and data controls | In progress | Core workspace browser-tested; complete interview/voice UI and export/deletion/privacy remain |
| M6: AWS, workers, RDS | Not started | Credit/cost/resource audit, IaC, durable storage/jobs, migration/restore/deployment |

## Security findings to resolve

- Secure-cookie support and verified route guards are implemented; continue auditing every new route and background path.
- Missing private-user configuration now fails closed; real signed-session rejection tests pass.
- Production rejects the development secret fallback. Gmail scopes are still requested during sign-in and must become optional.
- Existing import-derived `lastContactedAt` and mentor-review completion must not become meaningful-contact evidence automatically.
- Existing archive uses local paths and the pipeline uses process memory; both must become durable before deployment.
- Production DB remains untouched. Test against a dedicated local database, never by automatically loading `.env.local`.

## Continuation

Next: add the configured AI provider through durable revision-aware work with explicit processing consent, bounded requests and retry/cancellation checks. The capture/review UI and internal generation boundary are implemented; the app does not yet run a real AI interview. Add autosave, source correction/deletion and invalidation before claiming M2 complete. Keep reviewing and committing small verified slices. AWS credit coverage, domain and model configuration are deployment inputs; they do not block local work.

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

## Security checkpoint — `ef2821b`

- Updated Next to 15.5.25, BetterAuth to 1.6.30, Drizzle to 0.45.2, adm-zip to 0.6.0 and direct PostCSS to 8.5.28. Removed unused `@better-auth/infra`, which pulled an old SSO plugin. No forced major upgrades.
- Closed owner allowlist, verified identity on private requests and user/session creation, lazy production configuration validation, seven-day sessions, secure-cookie middleware support, exact-origin mutation checks.
- Bounded JSON and LinkedIn multipart streams, ZIP central-directory limits, safe paths and sanitized import errors.
- 16 unit tests and six local PostgreSQL integration tests pass, including actual signed cookies, tampering, expiration and denied session creation. Denied user creation is also tested. Type checking, lint and the production build passed. New UI changes made after the build are a separate, unverified slice.
- Audit after patches: 28 reported vulnerabilities (0 critical, 13 high, 12 moderate, 3 low). Remaining advisories include tooling/CLI dependencies, transitive fetch/image libraries and Next's bundled PostCSS. These still need reachability assessment and targeted fixes before deployment. Do not interpret reduced counts as a clean security audit or blindly upgrade to suggested older Drizzle tooling.
- Production data, AWS resources and Neon remain untouched. No email/contact messages sent.

## M1 workspace — `bce79e1`, verified core workflow

- Owner-scoped people/circle/contact-plan routes and queries added; new People, Circles, Person and Today screens use the PRD notebook palette and responsive layout. Name-only creation, circle membership, contact logging, plan editing and snooze/skip/pause/resume are wired to PostgreSQL.
- Keyword search covers names, email, organization, private profile notes, note bodies and interactions; 50-row pagination and archived filtering. Separate last outgoing/last mutual dates avoid implying replies. An outbound-only message no longer marks a person as met.
- 17 unit tests and eight integration tests pass. A new correlated-date query initially failed because Drizzle stripped nested column qualifiers; changed to a nested query builder and reran successfully.
- Playwright uses a loopback dev server on port 3007, synthetic fixtures, real signed sessions and the disposable local database. First run failed while a cold route was still compiling (five-second assertion timeout); second run is live with a 30-second assertion timeout and a failed-save/input-retention check. Browser verification is not yet complete.
- Do not run Next build and dev against the same `.next` output concurrently. A typecheck raced route generation and found stale generated layout types; regenerate via Next/build after browser completion.
- M2–M6 remain incomplete: interview/proposal review, open loops, preferences/updates, optional drafts, voice, roster reconciliation, full privacy/export/deletion, durable jobs and AWS/RDS operations.

### Browser verification update

- First complete browser workflow passed in 2.9 minutes: create circle, add a name-only person, set a quarterly plan, display it on Today, log exact contact, verify December 5 due date after September 5 contact, reload without duplicate events, search interactions, and reject missing Origin, forged cookies and another owner's person ID. Deliberately aborted save preserved input for retry.
- Desktop Person and mobile People screenshots inspected. Refined mobile tools into a collapsed menu, tightened filter layout, and widened calendar-unit control. Added screenshots/overflow assertions for Today, Circle and Person at both sizes.
- Final browser rerun passed (2.8 minutes including startup). Today, Circle, Person and People screenshots inspected; no mobile horizontal overflow. Production build, type checking and lint all passed. Exec session `38818` completed successfully; no build/dev process from this run remains active. Run build/dev checks sequentially against `.next`.
- Added Playwright and Prettier as development dependencies; `npm run test:browser` runs the fixture-isolated browser suite with explicit TEST_DATABASE_URL. The tests use installed Chrome.

## M2 interview storage checkpoint — `4f43a42`

- Added owner-scoped interviews, ordered turns, participants, grounded proposals, confirmed facts, open loops and personal updates. Migration `0006_robust_marvex.sql` applied successfully only to the disposable local database; composite unique indexes precede foreign keys.
- Session creation and turn saves are idempotent. Revision checks reject late model results; quotes must match current user-authored turns exactly. Unknown identities remain unresolved until explicit review. Model output cannot grant draft-sharing permission.
- All eight proposal types accept individually in the same transaction as their materialized records. Repeated/concurrent acceptance cannot duplicate notes or group interactions. Stale plans, foreign destinations and sensitive sharing requests roll back without changing review state.
- Verified 20 unit tests and 14 PostgreSQL integration tests, type checking, lint and production build. No UI changed in this checkpoint. These are synthetic storage/provider-boundary fixtures, not a real AI-provider test. No live database, AWS resource or private record changed.
- Remaining M2: HTTP routes, capture/review UI, configured provider with consent and bounded durable execution, source corrections/forgetting, and timeline provenance. Full M1–M6 goal remains active.

## M2 capture and review workspace

- Added owner-scoped interview list/create/read/status, turn-save and proposal-review routes; no public endpoint accepts model generations. Added Interviews navigation, Today capture link, desktop conversation/review columns and mobile view controls.
- Capture preserves failed input in the open tab, resumes after reload, and supports pause/resume/finish. Review shows exact source quotes, unresolved-name selection, editable fields for all eight proposal types, sensitivity and explicit sharing choices, and separate accept/reject actions.
- Reviewed notes/interactions and confirmed profile details link to the source interview. Keyword search includes active confirmed details and excludes stale details. PostgreSQL regression suite remains 14 passing tests.
- First browser run passed the existing people/circle/plan flow but the new test failed at a dynamic test-only module import; static imports fixed Playwright alias resolution. The next run exposed an overly broad alert assertion matching Next's route announcer; scoped it to the capture region.
- Interview workflow then passed in Chrome: failed capture and review saves retain edits, reload and pause/resume work, ambiguous identity requires confirmation, acceptance creates one private note, rejection persists, source links return to the interview, literal HTML is not executed, and foreign IDs/forged sessions/missing Origin/oversized bodies are rejected. Desktop and 390px mobile screenshots inspected; no horizontal overflow.
- Lint, production build and explicit typecheck passed. Final targeted browser rerun also passed (23.9 seconds including startup), including opening a source quote from mobile review and returning to the preserved edits. Exec session `78457` completed; no build/dev process from this checkpoint remains active.
- This screen currently uses explicit Save, not autosave, and clearly states the AI provider is not connected. Browser model output comes only from synthetic test fixtures passed to the internal publication boundary. No real inference, production migration, deployment or outreach took place.
- Next worker integration must not let the legacy `processQueuedAITasks` loop claim new interview jobs: it currently claims every queued task and has neither atomic leases nor source-revision validation. Reuse/extend the task storage deliberately, isolate execution by task type, and preserve the import flow while adding cancellation and consent checks. Do not silently use the old default model or fall back from local processing to cloud.
