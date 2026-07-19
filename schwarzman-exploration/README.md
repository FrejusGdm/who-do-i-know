# Schwarzman Alumni Tech Network

Maps Schwarzman Scholars alumni working in tech in Beijing/China and the SF Bay
Area, for internship networking during the Beijing year and post-graduation
recruiting. Spec: `../docs/superpowers/specs/2026-07-06-schwarzman-alumni-network-design.md`.

Pipeline (run from this directory, Node 20+):

```bash
node --env-file=../.env.local 01-probe.mjs    # optional: direct Exa query sanity check
node --env-file=../.env.local 02-roster.mjs   # scrape schwarzman.org -> data/roster.json
node --env-file=../.env.local 03-enrich.mjs   # Exa people search per alum -> data/enriched.jsonl
node 05-merge-directory.mjs                   # optional: merge data/directory.csv -> data/merged.jsonl
node 04-segment.mjs                           # -> output/*.csv
```

- `03-enrich.mjs` is resumable (skips already-enriched people; rerun after failures).
  Flags: `--limit N` (test run), `--year YYYY` (one class).
- `05-merge-directory.mjs` merges the private community directory export
  (place it at `data/directory.csv`). It confirms/corrects Exa LinkedIn matches,
  adds Instagram/website/home city/interests/languages (and emails if the export
  has an email column), and appends directory people the roster missed.
- `match_confidence`: `directory-confirmed` = LinkedIn verified by the directory;
  `high` = profile mentions Schwarzman/Tsinghua or matches undergrad with strong
  name agreement; `medium`/`low` = verify before outreach; `mismatch` = directory
  and Exa disagree (see `output/match-issues.csv`); `directory-only` = in the
  directory but no Exa profile; `manual` = set via `my-notes.csv` override.
- `data/`, `output/`, and `my-notes.csv` are gitignored (third-party profile
  data and personal notes).

Personal notes: `my-notes.csv` (seeded with the two segments on first
04-segment run). Fill in `status`, `notes`, `last_contacted`, `next_step`;
set `exclude=yes` to drop a bad row; `linkedin_override` to fix a wrong match.
Rows are joined by `name` + `class_year`, so you can add anyone from the full
roster as a new line. Rerun `node 04-segment.mjs` after editing.

Outputs:

- `output/beijing-china-tech-alumni.csv` — internship intros for the Beijing year
- `output/bay-area-tech-alumni.csv` — post-graduation recruiting pipeline
- `output/alumni-enriched-full.csv` — everyone, for the who-do-i-know CRM import
- `output/match-issues.csv` — LinkedIn conflicts to eyeball (often the same
  person with two accounts; fix real errors via `my-notes.csv`)
- `output/directory-unmatched.csv` — directory people not auto-matched
