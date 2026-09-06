# Network OS operations

## Interview provider and worker

The web app saves interviews and queues work. Run `npm run worker:network` as a separate process from the same repository with the same database and configuration. It polls the existing `ai_processing_tasks` table for interview tasks only. The legacy importer continues to handle its own task types. `npm run worker:network -- --once` claims at most one eligible task and exits.

Supply these values through local environment configuration or the deployment secret store:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Explicit target PostgreSQL database; production requires verified TLS |
| `DATABASE_CA_FILE` | Optional additional trusted CA bundle for RDS |
| `PRIVATE_USER_EMAILS` | Verified owner allowlist, also checked by the worker |
| `OPENROUTER_API_KEY` | Server credential; never enter it into the UI or commit it |
| `NETWORK_INTERVIEW_MODEL` | Explicit model ID; there is no implicit historical model fallback |
| `NODE_ENV` | Set to `production` for deployed web and worker processes |

Apply reviewed SQL migrations before starting the new worker; do not migrate as part of a web build. Migration `0007_hesitant_manta.sql` adds leases, availability, source revisions, generation keys, configuration-bound consent and aggregate usage. This migration has been exercised on the disposable local test database only.

The interface shows the configured provider/model and requires consent before sending relationship context. Changing the model invalidates the saved consent. Rotating a credential for the same provider/model does not. Revoking consent cancels queued work and prevents unfinished results from being saved. A request already transmitted cannot be recalled from the provider.

Requests go to the fixed OpenRouter chat endpoint, with redirects disabled. The request asks for JSON, enforces parameter support and requests zero-retention routing with data collection denied. No tools, web plugins or alternative models are enabled. Zod and source-quote validation remain authoritative even when the provider returns well-formed JSON. See [OpenRouter structured output support](https://openrouter.ai/docs/guides/features/structured-outputs) and [zero-retention routing](https://openrouter.ai/docs/guides/features/zdr). Provider policies and account-level logging preferences should also be reviewed before using private data.

## Limits and recovery

- One unexpired interview lease per owner; leases expire after two minutes. Inference times out after 45 seconds. Configure a production shutdown grace period of at least 60 seconds; a forced termination is recovered through lease expiry.
- At most three attempts per request, with delayed retries for transient failures. An explicit retry remains subject to the daily limit.
- Forty reserved attempts per owner per UTC day, including failed/crashed attempts; the reservation is atomic and survives restarts. The aggregate token counters currently cover successfully committed responses, not a complete provider billing ledger.
- At most 48,000 characters of relationship context, plus the fixed instruction/schema. Context keeps complete recent turns and reports omitted turn count; it does not silently clip source quotes. Responses are capped at 4,096 output tokens and one MiB before SDK JSON parsing.
- Completion rechecks consent, owner authorization, source revision, active interview/person state, and the exact lease token. Saving the generated turn/proposals and completing the job share one transaction. Superseded workers cannot publish.
- Raw model responses, prompts and exception bodies are not logged. The SDK logger is explicitly disabled; job errors contain only application-owned categories.

If a request stays queued, check the worker process and database connection. If it fails with `configuration`, check the credential, model access and availability of a route compatible with the requested privacy policy. Do not disable privacy rules or silently switch providers to make a request succeed. If a result becomes stale, request a new answer from the latest saved interview.

This worker establishes durable interview execution locally. SQS delivery, ECS deployment, CloudWatch health/alarms, durable archive/file work and the RDS cutover remain M6 work.

## Verification

Run unit and disposable-database integration tests before deployment. The browser suite overrides provider configuration with a deliberately invalid test key and injects a deterministic provider only inside test code. It cannot perform real inference.

For an explicit real-provider test, run `RUN_REAL_AI_SMOKE=1 NETWORK_INTERVIEW_MODEL=<model-id> npm run test:ai-smoke`. The script sends only its committed synthetic fixture, opens no database, and prints model/type/token counts rather than source text or credentials. It checks a concise question, parsed proposals and exact source spans. Do not treat a failed or mocked run as a successful live integration.

On 2026-09-06, the public OpenRouter catalog listed `openai/gpt-4.1-mini` with JSON response support and prices of $0.40/M input and $1.60/M output tokens ([model page](https://openrouter.ai/openai/gpt-4.1-mini)). It was selected for a low-cost smoke test, but the configured credential was rejected with HTTP 401 before any model response. Therefore this model is a candidate, not yet a validated application default. A working credential is required to complete that gate. No private interview data was sent in the smoke test, and no live database configuration was changed.

## Interview drafts

Migration `0008_large_power_pack.sql` adds one private draft per interview, an independent draft revision and the last idempotency key. Draft changes do not advance the submitted-conversation revision or queue AI work. The client debounces typing, serializes requests, retries uncertain acknowledgments with the same key, and reports a saved state only after server acknowledgment. No persistent browser storage is used. Conflicts retain local words for comparison; another tab cannot silently replace the saved draft. Submitting the draft checks its revision and words and clears it in the same transaction as the new turn.


## Legacy summary processing

The existing thread, person and mentor-review processor now uses durable leases and source checks on the same task table. Only one legacy inference per owner can hold an unexpired lease. Leases last two minutes; each request has a 45-second timeout and at most three application attempts with backoff. Re-enqueueing invalidates the earlier generation. Results, downstream work and completion share one transaction. Changed/deleted sources, archived targets, revoked owner access and canceled or superseded tasks cannot publish late results.

The authenticated `/api/ai/process` endpoint processes at most six tasks per call and returns the remaining queue count. It validates the selected provider and requires a key for BYOK; malformed configuration does not silently select cloud processing. The existing internal importer may request a larger batch. These jobs are still driven by the legacy importer/API; the standalone `worker:network` command currently claims interview tasks only. Durable SQS delivery of the full import pipeline remains M6 work.

Memory correction/deletion transactions must acquire the owner's `network_settings` row through `lockMemoryOwner` before canceling tasks, removing source records and invalidating summaries. Legacy and interview publication serialize against that same owner row. This ordering prevents a result from being published between source invalidation and transaction completion.

## Correcting or removing a recollection

Migration `0009_interview_corrections.sql` adds hash-only correction receipts and a contact-plan review flag. Apply it with the other reviewed migrations before serving the correction routes. It has only been applied to the disposable local database.

Each saved user entry has a **Correct or remove** action. The preview includes later assistant replies and proposals, accepted narrative memories, person summaries and outreach text. Later AI replies are invalidated conservatively because they may repeat earlier context without quoting it. Accepting a proposal, changing a plan or editing a dependent record invalidates the preview. The owner must review a fresh preview and explicitly retain confirmed structural choices before proceeding.

A correction replaces the source text; removal empties it and retains a content-free tombstone for retry safety. Both delete dependent proposal payloads/quotes, notes, facts, open loops, updates and interactions. Summaries for people linked to the interview are purged and outreach text cleared while mentor decisions remain. An affected plan pauses and shows a review notice on Today and the person's page; last contact is recomputed from remaining exact qualifying interactions. The prior due date is retained for review, not silently treated as valid contact evidence.

The operation is atomic with cancellation and its retry receipt. Matching retries return the current interview without restoring old content. The shared owner lock serializes against legacy/interview publication; in-flight lease tokens remain until the old caller exits or its lease expires. Interview reads use a coherent database snapshot and omit deleted turns.

This is entry-level correction/removal, not person or workspace deletion. Other user entries, unfinished drafts, imported records, confirmed identity/profile fields, met status, memberships and selected plan settings remain; the dialog discloses this scope and requires acknowledgment. Existing copies exported by the owner or retained in backups are not erased by this operation. Full export, person/workspace deletion and backup-retention operations remain M5/M6 work.

## Dated commitments

A commitment belongs to one person and can optionally link to an interaction in which that person participated. Add, edit, complete, dismiss or reopen it from Person; Today also offers complete/dismiss actions. Archived people retain history but reject new changes. Completing a commitment never records contact or advances a plan.

Today includes open commitments due on or before seven calendar days from today in the owner's timezone, including overdue ones. Commitments precede routine check-ins and group by person while keeping each deadline visible. Pausing or snoozing a routine plan does not suppress a promise. Undated, completed and dismissed commitments remain on Person.

Migration `0010_open_loop_controls.sql` adds the optional interaction link and hash-only retry receipts. Apply through the normal reviewed migration process; build/start never migrates automatically. A retry reads the current commitment and cannot restore an older status. Source removal deletes linked promises before deleting an interaction; receipts survive to prevent replay from recreating them.

Commitment changes invalidate unfinished work for related interviews. The original interview's reviewed-memory summary uses the commitment's current text, date and status. Broader commitment retrieval into other interviews or outreach drafts is deferred until generated outputs carry source dependencies that correction/removal can purge. Private commitment bodies are not added to other interviews' context in this slice.

## Conversation preferences

Person includes explicit relationship intention, natural topics, preferred formats/language and draft exclusions. Blank fields mean no preference, and clearing a field replaces its previous value. Saving never changes relationship type, met state, interaction history or cadence. Archived people retain read-only preferences.

Migration `0011_conversation_preferences.sql` adds owner/person-scoped preferences and hash-only retry receipts. Concurrent saves serialize, stale revisions are rejected, and a replay returns current choices rather than restoring older text. The editor keeps uncertain saves in memory for retry; a stale tab can reload confirmed choices explicitly. These fields currently support the owner's manual planning. The optional drafting slice must apply exclusions and track this preference revision before using them; no new interview or outreach model consumer is enabled here.

## Personal-update library

`/updates` provides a paginated private library with create/edit/remove controls and links to originating interviews. New updates have no draft audience. Selecting a person or circle is explicit permission for future draft use; a circle includes current and future members. The future draft flow must still require update selection and recheck both ownership and current membership before context collection/publication. The library does not send messages or enable a new model consumer.

Migration `0012_personal_update_controls.sql` adds deletion tombstones and hash-only request receipts. Removal clears title, body, date and audience; original interview words remain. Source correction still removes its materialized update completely, while receipts prevent old requests from recreating it. Edits/removal invalidate unfinished originating interview work; its reviewed summaries use current update text or a removed marker. Shared interview invalidation now lives in `src/lib/network/interview-invalidation.ts`.

Draft generation must track each selected update's revision, person/circle audience and circle membership. Changing or removing any of those must invalidate dependent draft output, including output already stored. Do not implement this solely as an instruction to the model.
