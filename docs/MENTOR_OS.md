# Mentor OS & Relationship Memory

This document describes the current product shape after the Mentor OS review upgrade.

## Product Goal

WhoDoYouKnow is no longer just a one-shot Gmail-to-CSV exporter. It is a private relationship-memory system for life after college: sync Gmail, preserve the useful context, review people, confirm mentors, mark friends, hide noise, and export a clean working list when needed.

The app should not draft outreach messages by default. The user already knows what they want to say. The product's job is to help them understand who matters, why they matter, what they talked about, and how to keep the relationship organized.

## Storage Model

Durable data is stored in Neon Postgres through `DATABASE_URL`.

Core tables:

- `people`: one row per person, including profile fields, relationship type, review status, archive state, and manual notes.
- `contact_methods`: email and other contact method records linked to a person.
- `email_threads`: Gmail thread metadata and participants.
- `email_messages`: Gmail messages. Full bodies are stored here when full-context processing is enabled.
- `person_thread_links`: connects people to Gmail threads.
- `ai_thread_summaries`: per-thread worker summaries.
- `ai_person_summaries`: relationship-level dossiers and mentor-signal evidence.
- `ai_processing_tasks`: queued AI worker tasks.
- `outreach_tasks`: currently acts as the Mentor Finder candidate/review table.
- `notes`: timestamped private notes added by the user.

CSV exports are outputs, not the source of truth. In local dev, CSVs may be written to the temp directory when Vercel Blob is not configured.

## Review Lifecycle

`people.review_status` is the human lifecycle field:

- `new`: imported but not reviewed.
- `needs_review`: ambiguous; keep in the review workflow.
- `confirmed`: intentionally kept as a real relationship.
- `not_mentor`: real person, but not part of the mentor workflow.
- `archived`: noise or irrelevant record; hidden from default People, Mentor Finder, and normal exports.

`people.relationship_type` is the human relationship label:

- Common values: `mentor`, `friend`, `advisor`, `professor`, `teaching_assistant`, `student`, `colleague`, `unknown`.
- `relationship_type=mentor` plus `review_status=confirmed` means the user explicitly considers this person a mentor or mentor-like relationship.

## Mentor Finder Actions

Mentor Finder uses explicit decisions instead of vague queue labels:

- `Mentor`: sets task status to `confirmed`, person `relationship_type=mentor`, and person `review_status=confirmed`.
- `Friend`: sets task status to `friend`, person `relationship_type=friend`, and person `review_status=confirmed`.
- `Not a mentor`: sets task status to `not_mentor` and person `review_status=not_mentor`.
- `Needs review`: sets task status and person `review_status` to `needs_review`.
- `Archive`: sets task status to `archived`, person `review_status=archived`, and stores archive metadata.

Later AI processing should not overwrite explicit user decisions. Once a person is confirmed, marked friend, marked not-a-mentor, or archived, the mentor reviewer preserves that decision.

## Review Sheet

`/review` is the main cleanup workspace. It provides:

- Spreadsheet-style table of people.
- Detail editor for the selected person.
- Left/right keyboard navigation between people.
- Search and review-status filters.
- Editable fields: name, email, phone, Instagram, LinkedIn, website, organization, role, relationship type, review status, and private notes.
- Quick actions: Mentor, Friend, Not a mentor, Archive, Save.

Use this page to clean imported data, add contact details the AI cannot know, and remove noisy records such as Canvas, offices, automated notifications, and mailing lists.

## Exports

Exports remain download-focused.

- Default contacts export excludes archived people.
- Person summaries export excludes archived people.
- Manual notes export excludes notes attached to archived people.
- Mentor candidates export includes confirmed mentors only, with contact details, summary, evidence, and private notes.

Archived records are preserved in the database but hidden from default working views.

## Operational Notes

- Run `npm run db:generate` after schema changes.
- Run `npx drizzle-kit migrate` with `DATABASE_URL` set to apply migrations.
- Run `npm run lint` and `npm run build` before committing.
- The dev server is `npm run dev` on port 3000.
