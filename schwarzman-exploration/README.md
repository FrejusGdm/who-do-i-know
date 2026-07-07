# Schwarzman Alumni Tech Network

Maps Schwarzman Scholars alumni working in tech in Beijing/China and the SF Bay
Area, for internship networking during the Beijing year and post-graduation
recruiting. Spec: `../docs/superpowers/specs/2026-07-06-schwarzman-alumni-network-design.md`.

Pipeline (run from this directory, Node 20+):

```bash
node --env-file=../.env.local 01-probe.mjs    # optional: direct Exa query sanity check
node --env-file=../.env.local 02-roster.mjs   # scrape schwarzman.org -> data/roster.json
node --env-file=../.env.local 03-enrich.mjs   # Exa people search per alum -> data/enriched.jsonl
node 04-segment.mjs                           # -> output/*.csv
```

- `03-enrich.mjs` is resumable (skips already-enriched people; rerun after failures).
  Flags: `--limit N` (test run), `--year YYYY` (one class).
- `match_confidence`: `high` = profile mentions Schwarzman/Tsinghua or matches
  undergrad with strong name agreement; `medium`/`low` = verify before outreach;
  `none` = no profile found.
- `data/` and `output/` are gitignored (third-party profile data).

Outputs:

- `output/beijing-china-tech-alumni.csv` — internship intros for the Beijing year
- `output/bay-area-tech-alumni.csv` — post-graduation recruiting pipeline
- `output/alumni-enriched-full.csv` — everyone, for the who-do-i-know CRM import
