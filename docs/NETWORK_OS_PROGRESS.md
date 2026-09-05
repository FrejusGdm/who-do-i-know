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
| M1: people, circles, interactions, cadence | Next | Calendar semantics, transactional owner-scoped storage, migration tests, usable controls |
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

Next: finish baseline checks, add a standard PostgreSQL transactional connection with verified TLS, create M1 schema/migrations and calendar tests, then implement the owner-scoped workflow. Keep reviewing and committing small verified slices and record commit IDs below. AWS credit coverage, domain and model configuration are deployment inputs; they do not block local work.
