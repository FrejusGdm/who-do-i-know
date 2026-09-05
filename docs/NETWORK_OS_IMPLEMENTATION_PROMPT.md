# Implementation handoff — Network OS

Use the following prompt to start implementation in this repository. This file is a handoff, not evidence that implementation or deployment has run.

---

Implement the personal networking operating system specified in `docs/NETWORK_OS_PRD.md`. Read `AGENTS.md`, `docs/AGENTS.md`, `CONTEXT.md`, and `docs/MENTOR_OS.md` first. Follow the new PRD for the requested product evolution and the installed package versions for framework APIs. The original extraction PRD is historical context.

Preserve the existing working tree, user data, Gmail/LinkedIn import paths, auth, and mentor review. Do not rewrite the application from scratch, commit private exports, or silently apply destructive database changes. Work on a `codex/` branch when appropriate, preserving existing changes.

Start with M0 and implement M1–M3 as a complete vertical slice: create a person without email, assign a circle, hold a persistent text interview, review grounded memory, record an interaction, set a three-calendar-month plan, show the due check-in, optionally draft from approved context, and log actual contact. Continue through M4–M6 when prerequisites permit. Do not stop at a UI mockup or a plan.

Use the PRD's provisional defaults when owner preferences remain unanswered. Missing real names or the cohort roster must not block a functioning empty-state experience and importer. Do not invent classmates, mentor histories, conversations, or last-contact dates. Synthetic fixtures belong only in tests.

Keep mentor classification separate from recurring check-ins. Never treat a confirmed mentor, saved note, copied draft, or opened mail composer as actual contact. Implement calendar-aware cadence, uncertainty, snooze/skip/pause semantics, grounded proposals, owner checks, retries, and privacy exclusions as specified.

Make the interface polished at desktop and mobile sizes, following section 9. Use the existing Tailwind v3/Radix stack. Verify the actual screens in a browser, including empty, error, saving, review, and missing-email states. A beautiful screenshot without working persistence is not acceptance.

Use reviewed SQL migrations and a disposable database for migration/integration tests. Resolve required transaction semantics deliberately; Neon's HTTP driver cannot simply be pointed at RDS. Keep persistent progress and files out of process memory/local task disks in production. Preserve confirmed user decisions against late AI output.

Use AWS CDK for the single proposed deployment stack. AWS access has been verified and the owner has authorized necessary services; recheck identity and resource inventory at deployment time. The owner prefers most infrastructure on AWS, so target RDS PostgreSQL after the migration rehearsal, retaining Neon as source of truth during development. Verify AWS credit coverage rather than assuming zero cost. Produce the concrete resource plan and current gross cost estimate, and apply the owner's budget/region/domain choices. Do not create unrelated services or delete Neon. A DB cutover requires the tested freeze/restore/validation procedure in the PRD.

Send no messages to contacts. V1 drafting is user-triggered and external sending remains manual. Do not add scheduled outbound messaging during deployment. If the user later requests in-app sending, implement explicit per-message approval before enabling it.

The owner confirmed Today should prioritize who to reconnect with, this is for private personal use, and the cohort is Class of 2027 / Cohort 11. Drafting is optional and must follow the local `write-like-josue` skill; reminders must remain useful without generated messages. Read the gitignored owner interview note locally for continuity, preserving uncertain spellings and dates. Never commit that note or treat it as a fully reviewed relationship record.

Run the repository lint/build checks and meaningful feature tests. Add deterministic tests for scheduling, ambiguity, repeated acceptance, ownership, worker retries, and deletion. Use one real-provider smoke test when configured; never report a fixture as a live integration. If credentials, budget, DNS, or external console settings block deployment, finish independent work and identify the exact outstanding input.

Maintain a concise progress record with completed milestones, actual validation results, migration state, deployment URL/resource inventory if created, and remaining work. Conclude with what works, what was tested, and anything still incomplete. Do not declare complete v1 until M1–M6 acceptance is met.

---

Before launching a long implementation run, incorporate any owner answers from the PRD interview. The reusable prompt intentionally excludes personal relationship details and credentials.

Baseline verification on 2026-09-05: `npm run lint` passed; `npm run build` passed after allowing network access for the existing Google Fonts fetch. This verifies the current app, not the proposed features. AWS STS identity succeeded; credits, resource inventory, and service-specific provisioning permissions were not verified. No deployment or database migration was performed during PRD preparation.
