# Network OS — product requirements

Date: 2026-09-05. Owner: Josué Godeme. Status: implementation-ready draft incorporating the initial owner interview; remaining personal and deployment inputs are listed in section 15.

## 1. Product intent

Extend WhoDoYouKnow into Josué's private operating system for maintaining relationships. The app should answer: Who do I want to stay close to? What do I remember about them? When did we last really talk? What would make a thoughtful next interaction?

The central loop is **capture → review memory → reconnect → record what happened**. Gmail extraction becomes an optional source of context within that loop.

Two initial use cases:

1. **Schwarzman classmates:** Maintain the actual roster for Josué's Class of 2027, Cohort 11 (academic year 2026–2027). The official announcement lists 150 incoming scholars. Find people, record conversations, remember interests and shared experiences, and notice people he has not met. Do not equate directory membership with friendship. Source: [official Cohort 11 announcement](https://www.schwarzmanscholars.org/events-and-news/schwarzman-scholars-announces-its-eleventh-cohort-the-class-of-2026-2027/).
2. **Dartmouth mentors:** Intentionally select roughly 15 people to stay in touch with about every three months. Capture their influence and past advice, the last meaningful exchange, things Josué wants to share, and any promises to follow up.

Success means Josué can speak or type a messy recollection after an interaction and later find enough reliable context to reconnect thoughtfully.

## 2. Decisions and provisional defaults

| Topic | Requirement / default | Status |
| --- | --- | --- |
| First user | Private workspace for Josué; owner isolation throughout; no public signup flow | Confirmed |
| Primary home | Today: who to reconnect with first; promises, recent memories, prominent capture action | Confirmed: reconnecting takes priority over browsing and debriefing |
| Mentor cadence | Three calendar months, editable per person | Based on user request; calendar interpretation proposed |
| Classmates | Cohort membership and notes; cadence off unless enabled | Proposed |
| AI interview | Required text conversation; voice capture with transcription also required for complete v1 | Text ships first; live voice conversation is later |
| Message assistance | Reminders first; optional draft in Josué's own language and voice | Confirmed: drafting is an experiment, not the main workflow |
| Sending | Copy draft or open mail composer; user sends externally and records contact | Confirmed direction: tell Josué to reach out; no autonomous sending |
| Hosting | Put most infrastructure on AWS, including target RDS PostgreSQL; retain Neon until a validated cutover | AWS preference confirmed; credits/eligibility and cost remain unverified |
| Roster | Class of 2027 / Cohort 11; official announcement expects 150 | Year confirmed and source found; actual roster rows still need retrieval and reconciliation |
| Timezone | Editable setting; initial proposal Asia/Shanghai | Must be visible during setup |
| Business model | Personal tool; no checkout or subscriptions in core flow | Existing free flow preserved |

These defaults let implementation proceed without turning unknown personal details into fabricated data. A missing roster must not block building the importer. A missing mentor list must not block building interviews.

## 3. Repository reality and reuse

The implementation inspected on 2026-09-05 is more advanced than the original `prd.md` and root agent guide describe.

| Area | Current implementation | Required change |
| --- | --- | --- |
| Framework | `package.json`: Next.js ^15.5.14, React ^19.2.4, Tailwind ^3.4.1 | Use installed versions and npm lockfile; do not recreate a Next 14 app |
| Identity | BetterAuth, Google OAuth, two-hour session | Preserve auth; decouple sign-in from optional Gmail consent, support returning personal use |
| Database | Drizzle `neon-http`; local configuration points to Neon | Reuse tables; add reviewed migrations and transactional operations |
| People | Profiles, methods, tags, review state; email currently required | Support people without email, circles, explicit contact history |
| Memory | Notes, stored emails, thread/person summaries, AI jobs | Add interviews, reviewed facts, source links, corrections, privacy controls |
| Outreach | `outreach_tasks` and `/outreach` implement mentor classification | Keep mentor review separate from recurring check-ins |
| Follow-up | `nextFollowUp()` uses score-dependent 45/90/180-day intervals | Replace active scheduling with owner-chosen plans; legacy dates remain suggestions |
| Imports | Gmail, LinkedIn, Google archive; separate alumni exploration scripts | Add cohort CSV preview and person matching; preserve import compatibility |
| Storage | Vercel Blob or local temp exports; archive uses local files | Private S3 for durable deployment artifacts |
| Jobs | DB AI task table plus in-process pipeline progress | Durable worker execution, checkpoints, leases, retry-safe writes |
| Voice | `next.config.mjs` currently disables microphone via Permissions-Policy | Permit same-origin capture on the interview UI and request browser permission when used |
| Privacy copy | Older specs promise ephemeral extraction; code stores relationship/email content | Align product copy, retention controls, and actual behavior before launch |

`docs/MENTOR_OS.md` is the best current baseline. It intentionally avoids default AI drafting; this PRD adds an explicit, optional drafting action. The July alumni research spec excludes classmates for that research exercise; the new cohort product deliberately includes classmates. Do not load its alumni output as Josué's current class.

Existing local edits and untracked exports/data belong to the user. Implementation must preserve them and avoid committing personal data.

## 4. Scope and completion levels

### First usable vertical slice

Manual person creation without email → circle membership → text interview → reviewed memory and interaction → three-month plan → due queue → optional draft → manual contact logging → correct next due date. The entire slice must persist after reload and work with two isolated test accounts.

### Complete v1

The vertical slice plus cohort CSV import, mentor onboarding, user updates, voice recording/transcription, grounded search, export/deletion, resilient background work, polished mobile/desktop UI, and verified AWS deployment.

### Later

Live duplex voice, Gmail sending after explicit per-message approval, calendar ingestion, automated Gmail delta sync, mobile push, shared workspaces, contact graph visualization, proactive web enrichment, and public self-service signup.

Automated third-party outreach, scraping private directories, relationship value scores, and autonomous relationship classification are outside v1. The system should not turn a personal network into a sales pipeline.

## 5. Primary journeys

### A. Setup and mentor interview

After sign-in, choose timezone and create circles. Offer empty starter circle names “Dartmouth mentors” and “Schwarzman classmates”; these contain no example people.

Ask whom Josué wants to stay in touch with. Accept a pasted list, existing-person selection, or names one at a time. Resolve ambiguous matches visibly. Do not require email addresses or exactly 15 people.

For each mentor, the assistant asks one concise question per turn, using existing context to avoid repetition:

1. How do you know this person, and what has their role in your life been?
2. When did you last actually speak or exchange messages? Approximate answers are fine.
3. What did you discuss, and did either of you promise anything?
4. What would you like them to know about your life now?
5. How often do you want to reconnect, and by which channel?

Show a compact review: person, relationship context, last-contact precision, open loops, three-month plan, and selected shareable update. Allow edit, skip, pause, resume, or save selected items. A mentor label and a keep-in-touch plan are separate choices.

### B. Schwarzman cohort setup

Create a cohort with program, exact class label/year, source, and optional expected count. Import a user-provided CSV or a verified permitted public roster for the selected year. An importer requires only name; optional fields include email, institution, country, interests, profile URL, and source row ID.

Preview column mapping, new people, likely matches, invalid rows, and unresolved duplicates. Explicitly confirm merges; same name alone is insufficient. Store imported profile facts separately from personal recollections. Reimporting the same file must not duplicate people or memberships.

Display actual counts and any discrepancy against expected count. Directory states: “Not met”, “Met”, and “Needs context”. “Not met” is an explicit relationship state, not a conclusion drawn solely from missing notes.

### C. Capture after a conversation

From any screen, “Capture a conversation” opens an interview. Accept a freeform paragraph or short voice recording without first requiring person selection. Save the input, identify possible people, and ask for disambiguation when needed.

Example behavior: a test-only story mentioning two classmates, a shared interest, and a promise produces one group interaction linked to both people, relevant private notes per person, and a proposed open loop. It does not create two unrelated copies of the event or distribute every person's private detail to all participants.

Review cards quote the supporting passage. No guessed date, name match, personal fact, cadence, or commitment becomes confirmed automatically. A direct manually entered note can save immediately; AI-derived changes require review.

### D. Reconnect with a mentor

Today shows the person, circle, last meaningful contact, reason due, and suggested next step. Opening the check-in shows shared history, previous advice, promises, and personal updates Josué has chosen to share.

Each person also has editable conversation preferences: what Josué wants to maintain in the relationship, relevant topics, possible formats (short text, email, photo plus caption, question, useful article), and topics to avoid in drafts. These are suggestions grounded in the owner interview, not rules inferred from someone's job. A close mentor may welcome life updates; an AI safety connection may be better approached with a specific question or idea. The app must not claim that professional contacts only want professional updates.

Being due means it is time to consider reconnecting, not that the app must manufacture news. Offer “Think of something together”, a simple personal check-in, or snooze. If a recommendation exchange is already active, show that activity and offer to log it before prompting another generic check-in.

Actions: “Prepare a message”, “Log contact”, “Snooze”, “Skip this cycle”, and “Pause reminders”. Preparing a message first asks or infers from confirmed context what Josué wants to convey; insufficient context produces a question, not a generic fabricated message.

V1 allows editing, copying, and opening the external email composer where an address exists. None marks the message sent. “Log contact” explicitly records channel and actual occurrence date, then updates the plan. An unanswered email can count as an outreach attempt; it is not displayed as a two-way conversation.

### E. Find context before meeting someone

Search people by name, circle, interests, institution, and note text. Opening a person shows concise relationship context with evidence, timeline, open loops, and the active plan. Search is usable without an LLM. Optional natural-language retrieval uses owner-scoped records and links to its evidence; it can say it lacks context.

### F. Onboard mentors from a selected email conversation after deployment

The owner wants the deployed web app and its working URL first, then to connect one chosen email account and start mentor onboarding from a specific farewell/staying-connected email subject supplied in the private conversation. Keep the exact subject, mailbox identity and message contents out of versioned specifications. Do not fetch mail before this deployment-first handoff or assume the account used for app sign-in is the intended mailbox.

Offer a separate, explicit read-only mailbox connection. Preview subject matches so the owner can select the intended conversation(s) before importing their contents. Start with those selected threads; expanding into other correspondence requires a visible scope choice. Show direct participants and identity matches, exclude the owner's addresses, distinguish group recipients and quoted addresses, and require reconciliation before creating or merging people. The owner has identified this group as mentors; support different mentor relationships without inventing subtypes from message text.

Preserve message/thread provenance, direction and actual dates. Importing a thread must not mark someone as met, infer a mutual exchange from an unanswered message, or reset a contact plan. Offer the existing review and interview workflows to confirm meaningful contact, relationship context and a three-calendar-month cadence. Repeated imports must not duplicate people or evidence. Imported text remains untrusted data and cannot authorize actions or broaden access. Never send email as part of connection, import or onboarding.

Acceptance includes separate login/mail consent, wrong-account recovery, ambiguous subject matches, duplicate import, group recipients, owner isolation, expired/revoked credentials, and source deletion invalidating derived memories. This is an additional post-deployment onboarding requirement, not evidence that mailbox connection or ingestion is already implemented.

## 6. Functional requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| P01 | Create/edit/archive people without email | A name-only classmate works in interviews, circles, search, and export |
| P02 | Many-to-many circles and cohort metadata | One person can be both a classmate and another circle member without duplicate identity |
| P03 | Preview and reconcile roster imports | Repeated input is idempotent; duplicates and invalid rows are visible; original records are preserved |
| P04 | Person timeline with provenance | User can distinguish imported data, user notes, confirmed interactions, and AI suggestions |
| E01 | Post-deployment mentor onboarding from selected email threads | Explicit mailbox connection, subject-match preview, reconciled mentor identities, idempotent provenance and reviewed contact dates; no automatic sending |
| I01 | Persistent multi-person text interviews | Reload resumes the same session without losing saved turns |
| I02 | Review individual AI proposals | Accept/reject/edit each item; retrying acceptance cannot duplicate a note or interaction |
| I03 | Voice recording and transcription | Browser permission, recording indicator, stop/cancel, transcript edit, typed fallback, retry without duplicate import |
| I04 | Correct or forget memory | Corrections invalidate dependent summaries and drafts; deleted source text is no longer retrieved |
| R01 | Explicit person-level cadence and channel | Three calendar months is selectable; no inferred importance score overrides it |
| R02 | Due queue with explanations | Sort by dated commitments, then overdue plans; disclose why each item is shown |
| R03 | Log contact, snooze, skip, pause | Each has distinct persistence and scheduling semantics below |
| R04 | Dated open loops | A promise due next week appears even when ordinary cadence is three months |
| D01 | Optional grounded drafting | User edits output; supporting context is inspectable; unsupported claims and private notes are excluded |
| U01 | Personal updates library | An update such as starting Schwarzman has date, body, and allowed people/circles for drafting |
| U02 | Conversation preferences per relationship | Suggestions can differ by person; the user can change them without changing relationship type |
| S01 | Owner-scoped keyword search | Names and saved notes are retrievable without AI availability |
| X01 | Export and deletion | Owner can export all relationship data and request person/workspace deletion with clear retention status |
| O01 | AWS deployment and operations | HTTPS, auth, jobs, private files, restore procedure, logging redaction, and restart survival demonstrated |

## 7. Contact and scheduling semantics

Scheduling is deterministic application logic, not model output.

- A plan has interval count/unit, preferred channel, timezone, next due date, status, and a revision. Default mentor interval is 3 calendar months, not 90 days.
- Use the actual occurrence date of the latest qualifying interaction. A meeting on September 5 yields December 5. November 30 plus three months clamps to February's last day. Use calendar operations in the plan timezone; do not add milliseconds.
- Contact recorded today about an older event uses the older occurrence date. Backfilling an event older than the most recent qualifying contact does not move the plan backward.
- Imported email receipt, newsletter, directory import, note creation, mentor confirmation, and draft creation do not reset the cadence. Imported direct exchanges may propose a meaningful-contact event; v1 requires confirmation.
- A current administrative exchange, such as a recommendation request, is visible as recent activity. Ask whether it counts as meaningful contact; do not silently reset the personal cadence or suggest that an active conversation has gone cold.
- Outbound contact and mutual conversation have separate last-date fields. The user chooses whether an outbound attempt resets a plan; default is yes for an explicitly logged personal message. Never claim a reply occurred.
- Unknown last contact remains unknown. Offer “Start from today” or choose a first check-in date; do not label the relationship overdue from an invented date.
- Approximate dates retain original wording and precision (`day`, `month`, `range`, `unknown`). Ask for a scheduling anchor or explicit next date before deriving a precise due date from an approximate recollection.
- Snooze sets a presentation date for the current check-in and leaves the underlying cadence and contact history intact. A new actual contact supersedes that snoozed cycle.
- Skip closes the current cycle without recording contact; next due is the first cadence occurrence strictly after today, computed from the skipped due-date anchor, preserving calendar clamping rules. Store that decision in history.
- Pause suppresses recurring check-ins until resumed. Resuming asks whether to keep the previous next date or select a new one. Person archive suppresses all actionable reminders and generation.
- Completing a dated open loop without contact does not reset cadence. Completing a routine check-in requires an interaction or explicit skip action.
- One active cadence per person in v1. Circle defaults are templates copied when explicitly applied; changing a circle never silently changes individual plans.
- Due dates are local calendar dates. Timestamps for saved turns, changes, and processing are UTC. Display dates in the owner's selected timezone.
- One active check-in per plan cycle, enforced by a database uniqueness constraint. A daily background reconciliation is idempotent; Today also computes current due state on read so a missed job does not hide due people.
- Multiple reasons for the same person are grouped in the UI but retain independent open-loop deadlines. Snoozing the cadence must not silently snooze a promise.

## 8. AI interview and memory contract

### Conversation behavior

Offer modes: “People I want to stay close to”, “Someone I just met”, “Debrief a conversation”, and “Catch up on my week”. A freeform entry is always available. Keep questions short, accept uncertainty, and ask about unresolved ambiguity before moving on. Never pressure the user to rate another person's worth.

The session state is `active → reviewing → completed`, with `paused` and `discarded` alternatives. Turns autosave with client-generated idempotency keys. Show saving/saved/offline states; do not claim text is saved before acknowledgment. Keep unsent input in the current client session for retry; persistent browser storage of private transcripts is opt-in.

### Structured proposals

Validate model output with Zod. A proposal includes stable ID, session ID, proposal type, matched person IDs or unresolved identity candidates, proposed values, source turn IDs and quote spans, confidence/uncertainty, sensitivity, and review status. Supported types: new person, note, interaction, profile fact, circle membership, open loop, plan, and personal update.

Validate source IDs and quote spans against actual saved content. Treat dates, proper names, identities, commitments, and sensitive details as reviewable fields. An accepted proposal persists atomically with its acceptance record; a revision conflict asks for review rather than overwriting newer edits.

Keep source text and structured confirmed memory distinct. Summary generation uses confirmed context and cites underlying records. The system may show a suggested interpretation, but it must label it and exclude it from confirmed facts and drafts until accepted. Imported text is data, never agent instructions.

### Voice

V1 is record → transcribe → edit → converse in text, with optional additional recordings. Require HTTPS, same-origin microphone permission, accessible recording controls, and a five-minute default clip limit with visible duration. Configure supported audio types and server size limits consistently. Request browser permission only when the user activates recording.

Upload to private S3 using short-lived owner-scoped authorization. After a successful transcript is saved, delete raw audio; failed/canceled recordings expire within 24 hours. A transcription failure preserves retry options within that window and never produces fake transcript text. Backend transcription runs through a configurable provider; provider selection and real credentials are deployment inputs.

### Optional drafting voice

Use the principles in the local `write-like-josue` skill: ordinary words, short first-person sentences, concrete details, and Josué's own phrases. Avoid corporate polish, generic inspirational copy, stock greetings, exaggerated gratitude, and invented feelings. Never turn uncertain transcript text into a polished factual claim. Ask for language preference; “my own language” does not establish a particular language from the interface language alone. Allow per-person overrides and learn from explicitly saved edits or owner-selected examples, not unconsented mining of the entire inbox.

Default draft length is roughly 60–120 words for email or 1–3 short sentences for text, editable by the user. Prefer one clear reason to write. Offer talking points instead when there is no grounded message yet. A photo is only suggested when the owner selects an actual image; never fabricate an attachment. The product is successful if Josué uses reminders and never uses drafts.

### Provider and failure behavior

Retain a provider boundary; use the existing OpenAI-compatible client for text if it meets structured-output/streaming needs. Pin a tested model in configuration rather than copying historical model IDs from the old PRD. Provider choice for hosting on AWS does not require all inference to use AWS.

A hosted server cannot reach the user's laptop through `localhost` for Ollama. Preserve existing local flows, but label the new server-driven interviewer as requiring a configured server provider until a browser/local bridge is implemented. Never silently fall back to sending local-only data to a cloud provider.

Timeouts, invalid JSON, rate limits, and provider outages yield resumable errors. Manual capture and search continue working. Apply per-owner concurrency, recording, token, and request limits; record usage and error category without logging private content.

## 9. Information architecture and visual specification

The interface should feel like a considered personal notebook: calm, highly legible, and useful for daily action. Avoid sales funnels, leaderboard scores, oversized dashboard numbers, and decorative network graphs.

Primary navigation: **Today, People, Circles, Interviews**. Put Imports, Mentor review, Exports, and Settings in secondary navigation. Preserve old routes or add explicit redirects; do not remove the review workflow.

| Screen | Layout and primary action | Required states |
| --- | --- | --- |
| Today (`/dashboard`) | Date and brief greeting; “Capture a conversation”; due people list; open loops; recent memories | First use, nothing due, unknown contact dates, loading, error |
| People (`/people`) | Search and circle filters; compact rows with name, context, last meaningful contact, next check-in | No results, archived filter, missing email, pagination |
| Person (`/people/[id]`) | Identity and circles; relationship brief; chronological timeline; plan and open loops in side panel | Unknown history, pending AI review, stale summary, no contact method |
| Circles (`/circles`, `/circles/[id]`) | Cohort list/table; met-state filters; import action and actual roster count | Empty cohort, partial import, duplicate resolution, wrong-year correction |
| Interview (`/interviews/[id]`) | Conversation left, proposed memory right; one question at a time | Saving, recording, transcribing, paused, reviewing, provider error |
| Check-in detail | Relationship context, selected update, optional message editor | Missing context, no email, stale draft, contact logged |
| Settings | Timezone, integrations, privacy, AI mode, export/deletion | Disconnected provider, failed sync, pending deletion |

Desktop: roughly 220px left navigation, 1120px content maximum, generous 24–32px section spacing. Interview uses a 60/40 split with review cards. Mobile: single-column content, reachable capture button, bottom navigation or compact menu, interview/review tabs; never require horizontal scrolling for primary actions.

Visual direction: warm off-white canvas (#F7F5F0), white/near-white surfaces, dark ink (#222923), muted green accent (#43664F), fine warm-gray dividers. Reuse the currently configured Outfit for body/controls and Instrument Serif sparingly for page titles. Package fonts locally if reliable offline builds are required; the current `next/font/google` setup fetches them at build time. Body 16px, metadata no smaller than 13px, headings roughly 28–36px. Verify contrast for the actual foreground/background combinations. Prefer flat rows and small-radius cards, with meaningful real content density.

Visible keyboard focus, labels on icon buttons, semantic headings, accessible dialogs, 44px mobile targets, reduced-motion support, and readable empty/error states are acceptance requirements. Transitions should be short (120–200ms) and never delay interaction. No autoplay/ambient animation in the work area.

## 10. Data model and compatibility

Use existing `people`, `notes`, contact methods, tags, summaries, imports, and auth tables. Add concepts where semantics differ; do not overload mentor-review status with check-in status.

| Entity | Essential fields / invariants |
| --- | --- |
| People changes | Nullable primary email; explicit met state; existing owner and stable ID retained. Audit every email assumption before removing NOT NULL. Missing email never becomes a synthetic address |
| Circles / memberships | Owner, name, kind, cohort label/year, source, expected count; unique person/circle membership, same-owner enforcement |
| Interactions / participants | Owner, channel, direction, occurrence date/range/precision, original date phrase, summary, source, qualifies-for-cadence; participants link one event to many people |
| Interviews / turns | Owner, status, mode, timestamps, role/content, request key; resume and deletion supported |
| Memory proposals | Session/source references, typed payload, uncertainty, status, reviewed revision, accepted record references |
| Confirmed facts | Owner/person, value, source references, visibility for drafting, correction/supersession state |
| Keep-in-touch plans | Owner/person unique active plan, interval, timezone, next due local date, channel, active/paused, revision, scheduling anchor |
| Conversation preferences | Owner/person, relationship intention, relevant topics, preferred formats/language, draft exclusions; explicit user changes preserved |
| Check-ins | Plan and cycle key, due/snoozed date, open/completed/skipped/canceled state, linked interaction, reason and decision audit |
| Open loops | Owner, person/interaction references, body, due local date, open/done/dismissed state, source |
| Personal updates | Owner, title/body, date, permitted circles/people; explicit draft selection |
| Drafts | Owner/person, body, source references and versions, status, generated timestamp; no inferred sent flag |
| Background tasks | Reuse/extend AI task system with revision-aware identity, atomic lease, retries, checkpoint, cancellation, error category |

Use foreign keys and owner-aware validation for all joins. Nested resources and exports must authorize access through their parent owner; UUIDs do not grant access. Case-insensitive exact normalized email can suggest an identity match. Shared email and same-name collisions require explicit resolution. A merge rewires references transactionally and records source identities.

Preserve existing AI/manual review decisions. Existing `lastContactedAt` is imported evidence, not automatically authoritative meaningful contact. Existing `nextFollowUpAt` may be shown as a legacy suggestion until a plan is confirmed. `outreach_tasks.completedAt` currently records mentor review completion and must never backfill contact history.

Use additive SQL migrations, staged backfills, and indexes on owner/person/time and owner/status/due date. Replace ad hoc production `db:push` with reviewed migrations. Transactional proposal acceptance and merges may justify switching the Drizzle connection to `node-postgres`, which can also connect to Neon; verify existing call behavior rather than swapping types blindly. RDS requires a standard PostgreSQL driver, not Neon's HTTP endpoint. See [Drizzle PostgreSQL connections](https://orm.drizzle.team/docs/get-started-postgresql) and [Neon driver options](https://orm.drizzle.team/docs/connect-neon).

## 11. API and processing contracts

All private requests use server-validated BetterAuth sessions and owner-scoped access. All new API routes use `dynamic = "force-dynamic"`. Validate bodies, upload sizes, enum values, dates, and all referenced IDs server-side.

For the personal deployment, restrict sign-in/account creation to the configured owner's verified Google identity or existing user ID. Do not expose open signup merely because Google OAuth is configured. Keep owner isolation in the data model and exercise multiple identities in isolated tests. Manual capture must remain available without granting Gmail read scopes.

Suggested route families: `/api/circles`, `/api/imports/roster/preview`, `/api/imports/roster/[id]/commit`, `/api/interviews`, `/api/interviews/[id]/turns`, `/api/interviews/[id]/proposals`, `/api/people/[id]/interactions`, `/api/people/[id]/keep-in-touch`, `/api/check-ins/[id]`, `/api/personal-updates`, and `/api/drafts`. These are new contracts; existing mentor review routes retain their meaning.

Mutations return persisted record IDs, versions, and validation errors. Use idempotency keys for turn submission, import commit, proposal acceptance, and contact logging. Conflicting revisions return 409; unauthorized owner-scoped resources return 404; validation returns 400; background requests return 202 with a durable job ID.

Long imports, transcription, and bulk summarization run in workers. Interview turn generation may stream within a bounded request, with persisted turns/proposals and a polling/retry fallback. Client disconnection must not destroy already accepted input. Never depend on an unawaited promise surviving an HTTP request.

Use SQS as delivery transport and PostgreSQL for task state. SQS standard delivery can repeat messages, so consumers must be idempotent; see [AWS delivery semantics](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html). Claim a task atomically with lease expiry, extend visibility while working, and acknowledge only after durable completion. Store source revision with work so stale model output cannot overwrite newer user corrections. Use a transactional outbox or equivalent reconciliation to recover a DB commit whose queue publish failed. Exhausted retries go to a dead-letter queue and a visible retry state.

## 12. Privacy and trust requirements

Persistent relationship memory is intentional. Clearly disclose which notes, transcripts, imported content, and summaries are retained. Existing imported data must not be silently deleted to reconcile older marketing promises.

- Notes and interview transcripts are private by default. A user can mark specific facts as eligible for drafting. Sensitive comments remain excluded even when another fact from the same interaction is shared.
- A personal update's allowed audience and explicit selection determine whether it enters a draft. Do not pass the whole private notebook to a drafting model and merely ask it not to reveal it.
- Distinguish private processing consent from permission to share a fact externally. Show the configured AI provider and obtain a preference before first cloud processing; the user can still use manual capture without it.
- No raw bodies, audio, contact details, tokens, or prompts in telemetry. S3 is private with encryption and short-lived signed access. Production secrets come from a secret store; fail closed when auth secrets are missing.
- Default retained text memories persist until deletion. Raw interview audio follows the deletion window in section 8. Temporary import uploads expire after seven days; generated exports after 24 hours. Clearly distinguish “Archive” from “Delete”.
- Person/workspace deletion removes source records, transcripts containing that person's data or offers an explicit reviewed redaction path for multi-person interviews, derived facts, summaries, drafts, exports, search documents, and files. Cancel queued work first and prevent retry resurrection through deletion state/version checks.
- Backup retention is explicit and bounded; production deletion confirmation distinguishes removal from active systems from expiry in backups. Record deletion tombstones outside restored data so restores reapply deletions before reopening access.
- Keep personal data and test transcripts out of git. Synthetic data is allowed only in tests, per repository rules.

## 13. AWS deployment plan

AWS identity was verified using read-only STS in this session. The default CLI region observed is us-east-2. This verifies access, not a full service-permission audit. No infrastructure has been provisioned for this PRD.

### Proposed baseline

One repository and application, with separate web and worker entrypoints. Use AWS CDK in TypeScript for infrastructure so environments are reproducible.

| Service | Purpose | Initial scope |
| --- | --- | --- |
| ECR | Versioned application container | One repository, image retention |
| ECS Fargate | Next.js web process and background worker | One small web task and one bounded worker; cap scaling |
| ALB + ACM | HTTPS ingress | Owned DNS hostname and validated certificate |
| S3 | Audio, imports, archives, exports | Private bucket, lifecycle rules, owner prefixes |
| SQS + DLQ | Background delivery and failed work | Bounded retry policy |
| EventBridge Scheduler | Daily reconciliation | Enqueue recurring work; no outbound messaging |
| Secrets Manager | Auth, database, provider credentials | Task-specific least-privilege access |
| CloudWatch | Redacted logs, health and queue alarms | Short log retention, actionable alarms |
| Neon during transition | Existing relational source of truth | Preserve current data and backups until validated cutover |
| RDS PostgreSQL | Target relational database on AWS | Costed instance choice, private network, tested migration; avoid provisioning a second production DB indefinitely |

Fargate is the proposed fit for the existing Node app, interactive responses, and workers. Amplify Hosting is a valid alternative for the frontend and supports Next.js 15, but still needs the archive/job workload separated; see [AWS Amplify support](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html). Do not implement two hosting stacks.

For a small personal deployment, consider public-subnet Fargate tasks with assigned public IPv4, web ingress restricted to the ALB security group, and no worker ingress. This permits outbound provider connections without adding a NAT gateway. Account for IPv4 charges. Private-subnet tasks require a working egress design. See [Fargate networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html). Any future RDS instance remains in private subnets with port 5432 allowed only from application task security groups; see [RDS VPC guidance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html).

Region is a deployment parameter. Start from the configured region unless owner preference or measured app/database latency warrants changing it. Test real use from Josué's network in Beijing, including sign-in and recording; do not assume choosing an AWS region resolves third-party connectivity.

Before creating services, produce a concrete resource diff and an itemized monthly estimate at the chosen region: web/worker task hours, ALB, IPv4, optional NAT/endpoints, storage/egress, logging, secrets, Neon or RDS, and AI usage. The owner expects AWS credits/free allowances; verify available balance, expiration, covered services, and projected cost after credits when account access permits. Current service pricing must be checked at execution time; this PRD does not claim a verified dollar total or that hosting is free. If coverage cannot be verified, report the gross estimate and request the acceptable ongoing spend while continuing implementation. Budget alerts are not spending caps; bound task scaling, upload sizes, and AI usage in application/infra configuration.

The owner has authorized necessary AWS service creation. Routine provisioning within the settled design does not require another blanket permission request. An unknown budget, hostname, or credential is a deployment input, not a reason to stop independent implementation. Provision only resources tied to a deployable milestone.

### Deployment acceptance

Use a multi-stage production container, Next standalone output, health endpoints that reveal no private data, task-role credentials, and an isolated migration runner. No schema mutation during build. Preserve lazy initialization and permit a build without production secrets.

Configure BetterAuth origin/callback and HTTPS cookies; audit middleware's current literal cookie-name check against BetterAuth's production cookie configuration. Provisioning AWS does not itself configure Google's OAuth console. If external configuration is unavailable, finish the deployable build and document the precise pending callback setting.

Replace local archive/export paths with S3 object references. Verify access-controlled downloads from a different web task after restart. Cloud workers must use database checkpoints rather than `progressStore` or local files as authoritative progress. Redeployments must preserve interviews, files, and queued work.

### Neon → RDS migration

The owner prefers most infrastructure on AWS. RDS is the target for the complete deployment, while Neon remains the source of truth during feature development and migration rehearsal. First inventory database version, extensions, table sizes, auth tables, and non-database files; verify backup and restore tooling. Prepare a compatible target and tested standard PostgreSQL driver. If verified costs or service access make RDS unsuitable, document the exception and keep a functioning Neon-backed app rather than risking data to satisfy a hosting label.

Rehearse a sanitized or access-controlled copy, verify row counts and referential integrity, and test auth, imports, interviews, exports, and jobs. For this personal-scale app prefer a planned write freeze over dual writes: stop writers/workers, take final consistent export, restore, validate, change secret, then reopen writes. Keep Neon unchanged and available for rollback.

Before writes reopen, rollback can switch to Neon. After writes on RDS, switching back requires reconciling new writes; never imply a connection-string switch alone is lossless. Do not delete the source database as part of initial cutover. Document backup retention and a successful restore drill.

## 14. Delivery order and evidence

| Milestone | Deliverable | Evidence required |
| --- | --- | --- |
| M0 | Baseline, migration design, privacy/architecture discrepancy inventory | Existing lint/build results; no unrelated local changes lost |
| M1 | People without email, circles, interactions, plans, scheduling engine | Migration/reload tests and deterministic cadence edge cases |
| M2 | Text interviews and reviewed memory | One end-to-end capture → confirm → timeline flow; retry and ambiguity tests |
| M3 | Today, profile, check-ins, personal updates, optional draft | Actual contact advances cadence; copy/draft does not; private facts excluded |
| M4 | Roster import and voice capture | Reimport/duplicate tests; recording/transcription failure and permission-denied flows |
| M5 | UI completion and personal-data controls | Desktop/mobile browser evidence, keyboard flow, export/deletion checks |
| M6 | AWS infrastructure, durable jobs/files, RDS migration, deployment | HTTPS smoke test, worker restart test, ownership checks, restore record, resource/cost inventory; explicitly record any retained-Neon exception |

M1–M3 are the first-night target, not a promise that all of v1 fits one night. Complete each slice end to end before adding breadth. Keep M4–M6 visible if unfinished; a mocked interview or local-only build is not a complete deployed v1.

Required regression cases: month-end and leap-year cadence; late historical log; unknown/approximate contact; outbound without reply; duplicate contact submission; snooze then contact; skipped overdue cycles; paused/archived person; same-name people; multi-person note privacy; stale AI proposal; malicious imported instructions; concurrent worker retry; owner A accessing owner B's IDs; deletion while AI work is queued.

Use deterministic AI fixtures only in tests and at least one real provider smoke test when credentials are available. Add a real database integration test path using a disposable database. Run npm lint, production build, and feature-focused tests; document external-service limitations honestly. Inspect principal screens at desktop and mobile widths with real empty states or private runtime data, never committed fake classmates.

Product acceptance targets: a routine note can be captured in under a minute; a mentor can be configured in a few minutes; a due person can be understood and a message prepared without reopening old exports. Treat these as usability targets to validate, not measured results. No saved turn loss, duplicate accepted memory, or invented contact date is acceptable.

## 15. Owner interview status and remaining inputs

Confirmed: personal use only; reconnecting is the daily priority; reminders matter more than drafting; drafts may be tried in the owner's language and voice; cohort is 2027 / Cohort 11; most infrastructure should live on AWS because the owner expects credits/free allowances.

The owner supplied a detailed first mentor story. It illustrates a close mentor relationship, an active recommendation exchange, and uncertainty about what kind of update to send. Private details are saved in the gitignored `notes/network-os-owner-interview.local.md`, not copied into this PRD. The last-contact date and full name spelling remain unconfirmed. This is interview context, not an accepted database record or permission to send a message.

Outstanding inputs, to collect incrementally:

1. Last meaningful contact and whether an ongoing recommendation exchange should reset that person's cadence (asked in the current task).
2. Remaining mentor names; preferred topics, channel, and cadence per relationship.
3. Language preference and optionally one short writing sample for drafts.
4. Actual cohort roster rows from the [official scholars directory](https://www.schwarzmanscholars.org/scholars/), reconciled to Cohort 11; a count discrepancy must be surfaced rather than filled with invented entries.
5. Verified AWS credit coverage, acceptable cost when credits expire, owned domain, region, and provider configuration.

Use confirmed decisions and section 2 defaults to continue independent implementation. Collect sensitive stories inside the private product or local gitignored material, not in versioned specs.
