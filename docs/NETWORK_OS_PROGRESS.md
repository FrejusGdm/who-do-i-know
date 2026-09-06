# Network OS implementation progress

## Objective and completion criteria

Implement the full Network OS PRD through M1–M6, including secure private workflows, polished responsive UI, durable jobs/files, verified AWS deployment and a tested RDS migration (or an explicitly documented deployment exception). A successful local build alone is not completion. No messages may be sent to contacts. Local commits and an explicit branch push are authorized; the owner requested push/deploy on 2026-09-06. No merge into main.

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
| M2: interviews and reviewed memory | In progress | Storage, authenticated API, capture/review UI and profile source links implemented; browser and database checks pass. Configured provider boundary and durable local worker implemented; autosave implemented; source correction/removal implemented; live-provider verification and broader deletion remain |
| M3: Today and reconnecting | In progress | Due queue groups dated commitments before routine plans; open-loop controls implemented; conversation preferences implemented; personal-update library committed as 1e8b33a; optional grounded drafts remain |
| M4: cohort import and voice | Not started | Roster source/reconciliation, private audio/transcription |
| M5: UI and data controls | In progress | Core workspace browser-tested; complete interview/voice UI and export/deletion/privacy remain |
| M6: AWS, workers, RDS | In progress | Default-domain CloudFront/private ALB infrastructure provisioning and immutable image build underway; isolated Neon deployment branch migrated and original preserved; cloud verification, owner OAuth, durable legacy runtime files/jobs and RDS cutover remain |

## Security findings to resolve

- Secure-cookie support and verified route guards are implemented; continue auditing every new route and background path.
- Missing private-user configuration now fails closed; real signed-session rejection tests pass.
- Production rejects the development secret fallback. Gmail scopes are still requested during sign-in and must become optional.
- Existing import-derived `lastContactedAt` and mentor-review completion must not become meaningful-contact evidence automatically.
- Existing archive uses local paths and the pipeline uses process memory; both must become durable before deployment.
- Production DB remains untouched. Test against a dedicated local database, never by automatically loading `.env.local`.

## Continuation

Latest owner steering (2026-09-06): prioritize a verified deployment and report its working URL before connecting a chosen mailbox. Then start mentor onboarding from the privately supplied email subject, with thread preview and identity reconciliation; see PRD workflow F / E01. No mailbox has been connected or fetched for this request. Do not assume the sign-in account is the requested mailbox. Never delete the owner's personal files outside this repository; preserve pre-existing and unrelated files inside it as well.

Read-only deployment refresh: STS identity succeeded for the previously verified account. CloudFormation in us-east-2 lists one existing Elastic Beanstalk stack in UPDATE_COMPLETE; it has not been identified as this app or changed. Route 53 returned no hosted zones (this does not rule out an externally managed domain). Free Tier GetAccountPlanState in us-east-1 returned ResourceNotFoundException / missing account data, so credit balance, expiry and service coverage remain unverified; do not interpret this as zero credits. This is a partial inventory, not deployment readiness or a cost estimate. No AWS resources or live database state changed.

Current deployment continuation is at the end of this record: branch pushed through 1055d29, AWS network provisioning and immutable image build underway. Optional drafts from approved context with durable source dependencies remain outstanding. Conversation preferences are implemented and verified. M3 dated open-loop controls are implemented: create/edit/done/dismiss/reopen, Person history, optional interaction links, and grouped Today reminders. Completing a promise does not advance cadence. Server-backed draft autosave and entry correction/removal are implemented. Full person/workspace deletion remains M5 work. The configured AI boundary and durable local interview worker are implemented, but the real-provider smoke test is blocked by an HTTP 401 credential rejection. Do not retry unchanged credentials or treat synthetic provider tests as live verification. Keep reviewing and committing small verified slices. AWS credit coverage remains unverified; domain is optional via CloudFront. Owner identity and model configuration remain unresolved.

## Checkpoints

- `9e2e1ea`: expanded the reusable implementation prompt with the verified slice loop, privacy/security checks, explicit staging and local commit rules.

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

## M2 capture and review workspace — `a38e5c8`

- Added owner-scoped interview list/create/read/status, turn-save and proposal-review routes; no public endpoint accepts model generations. Added Interviews navigation, Today capture link, desktop conversation/review columns and mobile view controls.
- Capture preserves failed input in the open tab, resumes after reload, and supports pause/resume/finish. Review shows exact source quotes, unresolved-name selection, editable fields for all eight proposal types, sensitivity and explicit sharing choices, and separate accept/reject actions.
- Reviewed notes/interactions and confirmed profile details link to the source interview. Keyword search includes active confirmed details and excludes stale details. PostgreSQL regression suite remains 14 passing tests.
- First browser run passed the existing people/circle/plan flow but the new test failed at a dynamic test-only module import; static imports fixed Playwright alias resolution. The next run exposed an overly broad alert assertion matching Next's route announcer; scoped it to the capture region.
- Interview workflow then passed in Chrome: failed capture and review saves retain edits, reload and pause/resume work, ambiguous identity requires confirmation, acceptance creates one private note, rejection persists, source links return to the interview, literal HTML is not executed, and foreign IDs/forged sessions/missing Origin/oversized bodies are rejected. Desktop and 390px mobile screenshots inspected; no horizontal overflow.
- Lint, production build and explicit typecheck passed. Final targeted browser rerun also passed (23.9 seconds including startup), including opening a source quote from mobile review and returning to the preserved edits. Exec session `78457` completed; no build/dev process from this checkpoint remains active.
- This screen currently uses explicit Save, not autosave, and clearly states the AI provider is not connected. Browser model output comes only from synthetic test fixtures passed to the internal publication boundary. No real inference, production migration, deployment or outreach took place.
- Next worker integration must not let the legacy `processQueuedAITasks` loop claim new interview jobs: it currently claims every queued task and has neither atomic leases nor source-revision validation. Reuse/extend the task storage deliberately, isolate execution by task type, and preserve the import flow while adding cancellation and consent checks. Do not silently use the old default model or fall back from local processing to cloud.


## M2 configured interviewer and durable worker — `c29ebb5`

- Added explicit provider/model consent, fixed-endpoint OpenRouter requests, private routing parameters, bounded context/output/timeouts, disabled SDK logging, and sanitized errors. No implicit model or provider fallback. A working credential and explicit model setting remain operator inputs.
- Extended the existing job table with revision-aware generation identity, atomic leases, delayed retries and cancellation. One in-flight request per owner, three attempts per request and forty reserved attempts per UTC day. Owner authorization and consent are rechecked before context collection and publication; archived/deleted inferred candidates also invalidate results even when no proposals are returned.
- Generated turns/proposals, aggregate success-token counters and job completion commit atomically. Failed/crashed attempts count toward the daily cap. Legacy processing now filters its own task types. Added the separate `worker:network` process; SQS, ECS and durable legacy imports/files remain M6 work.
- UI supports opt-in, automatic queueing after explicit recollection submission, manual questions, reload/poll recovery, visible failures and consent revocation. Queued HTTP requests return 202. No automatic contact outreach.
- Migration `0007_hesitant_manta.sql` was reviewed and applied only to the disposable local database. Verified 23 unit tests and 20 PostgreSQL integration tests, including lease recovery, stale output, consent revocation, concurrent claims, daily limits and archive/deletion during inference. Type checking and lint passed.
- All three browser workflows passed with test-only provider injection; desktop and 390px mobile interview screenshots were inspected. The targeted browser rerun passed (54.8 seconds including startup), including the final 202 response contract. The final production build passed after all backend and response-contract changes; its lint and type checks passed too.
- Worker `--once` startup passed against the disposable database. Real-provider smoke testing sent only synthetic context and received HTTP 401. A request for a working credential was made; never put the key in chat or Git. No live schema/data migration, AWS provisioning or messages to contacts occurred.
- Configuration, limits, recovery and verification commands are documented in `docs/NETWORK_OS_OPERATIONS.md`. Autosave and correction/forget workflows still remain; this is not full M2 completion.


## M2 interview draft autosave — `ea4e5ff`

- Added server-backed drafts separate from submitted turns and model context. Migration `0008_large_power_pack.sql` is additive and applied only to the disposable local database.
- Draft saves preserve exact whitespace, carry independent revisions and retry-stable keys, and reject foreign access, stale tabs and writes to inactive interviews. Submission checks the saved draft and clears it atomically with turn creation. Replaying old requests cannot restore the cleared draft or duplicate a turn.
- The client debounces and serializes autosaves, retains failed input in memory, visibly distinguishes waiting/saving/acknowledged states, and retries lost acknowledgments. Interview lists do not return draft bodies. Completing an interview with an unfinished draft is rejected.
- All 23 database tests pass. The first run exposed a quota fixture left exhausted by a previous test; isolated that state and reran successfully. All 23 unit tests and lint pass. The four browser workflows passed (2.0 minutes), and the final targeted autosave rerun passed (38.4 seconds), including pause/resume after reload. The first pause test reloaded before acknowledgment; corrected it to wait for the persisted pause state. Desktop and 390px mobile screenshots inspected with no overflow. Final production build and explicit typecheck passed after all changes (exec session `22790` completed).
- Added the final UI safeguards: editor state remounts per interview ID, editing is held during pause/submission transitions, and transitions use the latest acknowledged conversation revision. Committed as `ea4e5ff`; no live schema/data or AWS resource changed. Next full feature is source correction/forgetting with invalidation; M3–M6 remain incomplete.


## Legacy AI publication safety — `d356e54`

- Inspection found legacy person/thread/mentor workers could write after cancellation and could overwrite a newer generation of the same task. Hardened all three before exposing memory-forgetting controls.
- Added owner-serialized claims, one unexpired legacy lease per owner, generation identity, two-minute leases, three attempts and delayed retries. Publication rechecks the verified owner, active parent and a hash of current source records. Source text is not copied into job metadata.
- Each writer saves its results, downstream tasks and completion atomically; failed transactions leave no partial summary. Re-enqueueing replaces generation identity and retains an in-flight lease until its call finishes or expires. Late publication/failure cannot revive a canceled or superseded request.
- Cross-owner legacy person/thread links are filtered in both context collection and downstream enqueue. SDK logging is disabled for this processor; requests use a 45-second timeout, no hidden SDK retries and a 4,096-token output cap. Stored failures contain a generic category, not raw provider exceptions.
- `/api/ai/process` now uses the common session/origin/bounded-JSON boundary and validates provider configuration. HTTP batches are limited to six tasks; internal import callers retain their existing batch interface. Remaining queued tasks are reported for subsequent processing. No automatic cloud fallback from a missing BYOK key is allowed by this endpoint.
- All 28 database tests passed, including actual processor execution with an injected fetch fixture, cancellation during inference, rollback, lease recovery, source changes/deletion, archive, foreign targets and corrupt cross-owner links. The browser API test passed (17.5 seconds including startup); it made no model calls. Type checking, lint, final production build and post-build typecheck passed (exec session `63460` completed). No UI changed in this slice.
- Source correction/forgetting remains the next feature. It must use `lockMemoryOwner` before canceling affected jobs and invalidating derived records, matching the owner lock already used by interview jobs. This is not full deletion support, a complete legacy worker deployment, or a live-provider check. Legacy JSON fallback/model selection and import storage still need the deployment audit.


## M2 recollection correction/removal — `f70e60b`

- Added previewed, owner-scoped correction/removal for saved user turns and an accessible Radix confirmation. The preview detects changes to accepted proposals and derived rows even when the interview revision has not changed. Repeated requests use hash-only receipts; previous source bodies and dependent proposal quotes are purged, with empty turn tombstones preventing replay.
- Invalidates all later assistant generations in the interview, removes their materialized narrative memories, clears linked person summaries/outreach text, and cancels unfinished interview/person AI work under the shared owner lock. Confirmed people/profile fields, met status, memberships, mentor decisions and plan settings are retained only with explicit scope acknowledgment. Other recollections/drafts/imports remain; this is not full M5 deletion.
- Removed contact evidence is disconnected from historical check-ins before deletion. Remaining qualifying contacts determine last-contact dates; plans affected by removed evidence or plan suggestions pause with a review flag surfaced on Today and Person. Explicit plan review/resume clears that flag.
- Reviewed additive migration `0009_interview_corrections.sql`, applied only to the disposable database. All 32 integration tests passed, including a forced final-write failure proving source/memory/summary/plan rollback. All 23 unit tests, lint and typechecking passed. The final production build and explicit post-build typecheck passed after the final UI change (exec session `4787` completed).
- First browser attempt exposed an ambiguous source-text assertion (the text also appears in its supporting quote). Scoped it to the conversation. The next run waited for an exact label on a prefilled textarea; separated labels from controls with explicit IDs. The targeted workflow then passed in 28.3 seconds, including lost-acknowledgment retry, focus return, desktop correction and mobile removal. Simplified zero-count preview text after visual inspection. All six browser workflows passed (2.3 minutes). A final mobile improvement keeps confirmation actions outside the scrolling preview; the targeted rerun passed (21.9 seconds), including viewport assertions for both actions. Final desktop and 390px mobile screenshots were inspected. Added Radix AlertDialog 1.1.23; install audit reports the same 28 existing advisories (0 critical, 13 high, 12 moderate, 3 low), which still need deployment assessment.

- No live schema/data migration, AWS resource change, private record creation or contact outreach occurred. The real-provider gate still needs a working credential and configured model; do not repeat unchanged HTTP 401 attempts. Full M3–M6 work remains. New drafting/retrieval consumers must register source dependencies and extend invalidation, including updates shared through circle audiences, before use.


## M3 dated commitments — `fcf03ef`

- Added owner-scoped, revisioned create/edit/complete/dismiss/reopen operations, optional participating-interaction links, and hash-only retry receipts. Replays return current state and cannot duplicate or resurrect a promise after its source is removed. Reviewed migration `0010_open_loop_controls.sql` was applied only to the disposable database.
- Person displays open and closed commitments with source links; Today groups each person's commitments and routine plan, showing promises due within seven local calendar days (including overdue ones) first. Pausing/snoozing a routine plan leaves promise deadlines visible. Completing a promise never writes contact evidence, check-in history or plan dates. Archived people remain read-only.
- Commitment mutations invalidate related unfinished interview work; the originating interview's reviewed summary uses current commitment text/date/status. Source correction includes promises linked to removed interactions and invalidates their originating interviews, including those without selected participants. Wider commitment retrieval was deliberately deferred: add durable output dependencies and deletion propagation before feeding private promise bodies into other interviews or outreach drafts.
- Verified 24 unit tests and 37 database tests, including owner isolation, linked-participant validation, concurrent replay, stale edits, completion without contact, source removal, worker invalidation and rollback. New fixtures initially used the wrong interaction payload/provenance fields and omitted identity confirmation for an unselected person; corrected fixtures pass against real PostgreSQL.
- All seven Chrome workflows passed (1.9 minutes), including validation rejection with editable input, a lost create acknowledgment, edit, complete on Today, dismiss/reopen, and authenticated API negatives. The first targeted run navigated before the edit acknowledgment because its assertion matched textarea text; the corrected assertion waits for the saved card. Desktop and 390px mobile Person/Today screenshots inspected; no overflow. Lint and final production build passed. Explicit post-build typecheck passed (session `85882` completed).
- No production migration, real private-record creation, AWS resource change, contact message or push. Provider HTTP 401 and AWS credit/cost/domain gates remain external inputs; full M1–M6 completion remains outstanding.


## M3 conversation preferences — `a354a7b`

- Added explicit intention, natural topics, preferred formats/language and draft exclusions per person. Empty fields retain uncertainty; clearing a field removes its saved text. No inferred rules from someone's profession or relationship type. Preferences are private manual guidance until the optional drafting implementation applies their exclusions and tracks revisions.
- Added owner-scoped read/save routes, composite ownership foreign keys, optimistic revisions and hash-only retry receipts. Concurrent retries write once; replay cannot restore older choices; stale tabs retain their input and can explicitly reload the current version. Save leaves relationship type, met state, contact evidence and plans unchanged. Archived profiles retain read-only preferences.
- Reviewed migration `0011_conversation_preferences.sql`, applied only to the disposable local database. All 39 integration tests pass, including foreign access/direct FK rejection, concurrent idempotency, stale revisions, clearing values, archive and transaction rollback. Type checking and lint pass. The new Chrome workflow passed in 25.0 seconds including server startup: lost acknowledgment, two-tab conflict, explicit reload, mobile field clearing, auth/origin/size negatives and archived display. Desktop and 390px mobile screenshots inspected with no overflow. Final production build and explicit post-build typecheck passed (sessions `68788` and `5172` completed).
- No AI calls, private record creation, deployment, live database migration, messages to contacts or pushes. Next source-aware draft generation must account for preference changes; this slice does not silently pass these private fields into existing interview/legacy models.


## M3 personal-update library — `1e8b33a`

- Implemented `/updates`, owner-scoped create/edit/remove routes, optional dates and explicit person/circle audiences. Defaults stay private; person/circle ownership is validated before changes commit. Reused the searchable person picker with a contextual label. The mobile add panel comes first. Reviewed migration `0012_personal_update_controls.sql` adds tombstones and hash-only receipts; test database only.
- Removal clears saved text/date/audiences without claiming to remove original interview words. Replays cannot restore deleted updates; source correction can hard-remove the materialized row while receipts prevent resurrection. Origination-aware interview invalidation is shared with commitments; current reviewed summaries reflect edited/removed updates. No new cross-interview or outreach retrieval is enabled before source-dependency tracking.
- All 43 database tests now pass, including pagination (3.7 seconds). Earlier approval timeouts and the sandboxed connection failure are resolved. The 24 unit tests, lint, nine Chrome workflows (2.5 minutes), final production build and explicit post-build typecheck passed. Desktop and 390px mobile screenshots inspected; the add panel precedes the list on mobile.
- Browser coverage includes lost create/removal acknowledgments, private defaults, explicit audience, edit/reload and authentication/origin/size/foreign-audience negatives. Reviewed the actual feature diff and schema snapshot: only personal_updates and personal_update_requests change. No production migration or new model consumer.
- Optional drafts still require durable source/version dependencies and invalidation for people, updates, circle audiences/membership, facts, interactions and preferences before generated messages use them. Deployment now takes priority per the owner request.


## Push and deployment request — 2026-09-06

- Owner explicitly authorized pushing and deploying. Push the reviewed codex/network-os branch; do not merge main or include unrelated local files. The GitHub origin is public, so review outgoing history for secrets/private artifacts first.
- The previously pending integration run now passes all 43 tests, including pagination (3.7 seconds). Prior 24 unit tests, nine Chrome workflows, lint, production build and post-build typecheck remain valid for this unchanged application slice. The former approval blocker is resolved.
- Existing Elastic Beanstalk deployment is a separate language-learning application; leave it untouched. There is no verified Network OS deployment. Local auth URL is localhost, the private-owner allowlist is absent, and the interview model is absent. Existing provider credential previously failed; no new private context was sent. Production hostname, owner identity, credit/cost coverage and deployment infrastructure still need resolution.
- Next: commit the verified update library, scan and push the explicit branch, then prepare the isolated AWS deployment and identify exact remaining external configuration. Preserve Neon and all personal files.


## AWS deployment preparation — verified locally, not deployed

- Pushed `codex/network-os` through `1e8b33a` to origin. Reviewed 338 outgoing/staged blobs against configured secret values and private-path/private-key patterns; no findings after excluding API directories from the private-root pattern. This is a bounded scan, not proof that every possible secret pattern is covered. No unrelated local files were staged.
- Added standalone Next output, a non-root multi-stage container, production worker dependency placement, exact GET/HEAD public health exemption, and immutable source packaging from a Git commit. Packaging refuses to overwrite existing files and excludes personal/uncommitted inputs; fixture tests verify these boundaries.
- Added pinned CDK infrastructure: separate artifact bootstrap (private S3, ECR and bounded CodeBuild) and web/worker/HTTPS stack, one deployment architecture. Network tests verify no worker ingress, web ingress only from the load balancer, no NAT/RDS, secret references, build-role isolation and immutable images. No cloud resources were created. Docker is unavailable locally because its app executable is missing; cloud image build remains unexecuted.
- Verification: all 26 application unit tests pass; the earlier 43 database tests pass; three CDK tests and infrastructure typecheck pass; lint, final production build and explicit post-build typecheck pass. The built standalone server passed synthetic localhost HTTP checks (health 200, private APIs 401, untrusted mutation 403), then stopped. No UI layout changed in this preparation slice. The container itself and cloud environment have not been tested.
- Current Ohio Price List rates produce a $65–80/month planning estimate before credits, AI and the existing Neon bill. Credit coverage is unverified; owner budget, hostname and sign-in email questions are pending. See NETWORK_OS_DEPLOYMENT.md for assumptions, concrete stacks, callback settings and ordered build/deploy/rollback steps.
- Fresh production dependency audit reports 27 advisories (12 high, 12 moderate, 3 low, no critical). Reachability review and applicable patches remain a deployment gate, alongside live-schema backup/restore/migration checks and legacy runtime-file/job durability. Do not claim production readiness from local checks.
- Exact continuation: resolve the owner's hostname/sign-in/budget answers, finish security and production-data checks, inspect actual account inventory and synthesized diff, provision the artifact stack, build/scan the committed release, and deploy the reviewed service stack. Verify real HTTPS/auth/storage/worker behavior before reporting a live URL. Preserve Neon, the separate language app and personal files; no mentor mailbox fetch or messages.


## Default AWS HTTPS deployment — in progress, 2026-09-06

The owner explicitly requested an AWS-generated link now and a custom domain later. The earlier domain prerequisite is superseded. Artifact stack NetworkOsArtifacts is deployed in account 974640818655/us-east-2, including the private runtime secret. NetworkOs creation has started with zero tasks while the release image is built. CloudFront uses a private ALB VPC origin, default HTTPS hostname and disabled caching; optional custom certificates must be in us-east-1. No unrelated AWS resources were changed. Credits remain unverified; prior $65–80/month allowance is not a hard cap.

Preserved a no-compute Neon predeploy branch, then created a separate deployment branch. Verified existing schema drift against the tested local schema before reconciling migration journal entries 0003–0004 and applying 0005–0012 atomically on the deployment copy. All 27 original table counts match and no constraints are unvalidated. Source and preserved branches remain unchanged. The copy currently has a 0.25 CU endpoint; suspension could not be configured under this account.

Compatible dependency security patches and moving shadcn to devDependencies reduce the production audit to seven affected packages (one high, six moderate). Remaining PostCSS build-time CSS/source-map and esbuild development-server findings are not reached by private application requests; cloud builds have no runtime secrets or personal inputs. Post-update verification passed 26 unit tests, 43 disposable PostgreSQL tests and all nine Chrome workflows (2.3 minutes). Three infrastructure assertions and typecheck pass; production compilation/build passed. Local disk filled during build-cache writing; only this repository’s generated .next/cache was removed to recover space. No AI provider retry, email fetch or contact messaging.

Next: finish checks; review/stage only deployment and dependency files; commit/push the branch; package the exact commit; upload a pinned S3 source version; run CodeBuild and review image scan; start services and verify live HTTPS/API/DB/worker behavior. Owner email remains unanswered, so sign-in stays closed rather than selecting among existing users. Configure the exact Google callback once the endpoint exists. Update this record with actual results and URL; M4/M5/full M6 remain unfinished.


### Release 1055d29 — cloud build started

- Final production build, post-build typecheck and lint passed after all dependency changes. Only repo/.next/cache was removed following disk exhaustion; no personal files or out-of-repo files were deleted.
- Explicitly staged seven deployment/dependency/progress files; secret-value/private-key scan and staged diff checks passed. Committed and pushed `1055d29fa05f8a47294f6c935b516089d486c5b1` to codex/network-os; no main merge. Unrelated changes remain unstaged.
- Exact Git archive uploaded to private S3 source version `kAHU0oWukyAQb9FNTToSSZtQW8U3J2A0`. CodeBuild run `Build45A36621-SK5Njm9sv3Wy:b19053bd-245f-4193-a48f-74ef9e421c30` is building it. Image tag is the full commit. No runtime secret or owner file entered this build.
- NetworkOs stack is still creating the CloudFront VPC origin/distribution; services remain at desired zero until image verification. Runtime secret populated through stdin with deployment-copy DB credentials, fresh auth secret, existing Google configuration, empty owner allowlist and disabled AI. No credentials printed or committed. Await owner identity and real Google callback configuration.


Cloud build 1055d29 failed during TypeScript checking with V8 heap exhaustion around 1.9 GiB; compilation itself succeeded and the failed image was not pushed. Increase only the temporary CodeBuild machine to MEDIUM and build-stage Node heap to 4096 MiB. Runtime Fargate sizing is unchanged; checks remain enabled. Rebuild a new committed release rather than retrying the unchanged configuration.
