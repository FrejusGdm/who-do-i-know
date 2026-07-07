# Schwarzman Alumni Tech Network — Design

**Date:** 2026-07-06
**Goal:** Map Schwarzman Scholars alumni working in tech in (a) Beijing/China and (b) the SF Bay Area, to support internship networking during the Beijing year and post-graduation recruiting. Cohort classmates are explicitly out of scope (will meet them in person).

## Approach

Roster-first pipeline with a quick direct-query probe up front:

1. Probe Exa people search directly for immediate results and API validation.
2. Build ground-truth roster from schwarzman.org class lists (2016–2026).
3. Enrich every alum via Exa people search (structured person entities).
4. Segment locally into target CSVs.

Direct semantic queries alone were rejected (unknown recall); Exa Websets rejected (higher cost, less control) unless enrichment quality disappoints.

## Components

All in `schwarzman-exploration/`, standalone Node `.mjs` scripts run with
`node --env-file=../.env.local <script>`. Raw `fetch` against `api.exa.ai`, no new dependencies, no coupling to the Next.js app.

| Script | Input | Output | Notes |
|---|---|---|---|
| `01-probe.mjs` | — | `data/probe/*.json` + console summary | ~6 direct people-search queries |
| `02-roster.mjs` | schwarzman.org class pages | `data/roster.json` | name, class year, country, undergrad. Fallback: Exa contents API |
| `03-enrich.mjs` | `roster.json` | `data/enriched.jsonl` | 1 search/person; resumable (skips done names); `--limit N`; `match_confidence` field, low-confidence flagged not dropped |
| `04-segment.mjs` | `enriched.jsonl` | `output/*.csv` | pure local; no API calls |

## Outputs

- `output/beijing-china-tech-alumni.csv`
- `output/bay-area-tech-alumni.csv`
- `output/alumni-enriched-full.csv`

Columns: name, class_year, company, role, location, linkedin_url, undergrad, home_country, match_confidence, segment_reason — designed to import into the who-do-i-know CRM later.

## Error handling

- Enrichment is idempotent/resumable via JSONL checkpointing.
- 429/5xx: retry with backoff; hard failures recorded per-name and re-runnable.
- Ambiguous person matches kept with `match_confidence: low` for manual review.

## Privacy / hygiene

- `EXA_API_KEY` lives in `.env.local` (gitignored). Placeholder added to `.env.example`.
- `schwarzman-exploration/data/` and `output/` gitignored — third-party profile data stays out of git history.

## Cost

~1,500 Exa searches for full enrichment (a few dollars). Probe is negligible.

## Testing

- Probe validates key + data shape before any bulk spend.
- `03-enrich.mjs --limit 10` dry run; spot-check known alumni before full run.
