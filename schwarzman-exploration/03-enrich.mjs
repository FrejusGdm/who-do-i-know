// Enrich alumni roster with current role/company/location via Exa people search.
// Resumable: appends to data/enriched.jsonl, skips names already done.
// Run: node --env-file=../.env.local 03-enrich.mjs [--limit N] [--year YYYY]
import fs from 'node:fs';
import { exaSearch, personEntity, currentJob, ensureDir } from './lib.mjs';

const ALUMNI_MAX_YEAR = 2026; // exclude the incoming Class of 2027 cohort
const OUT = 'data/enriched.jsonl';
const CONCURRENCY = 4;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : null;
};
const limit = flag('--limit');
const onlyYear = flag('--year');

const roster = JSON.parse(fs.readFileSync('data/roster.json', 'utf8')).filter(
  (s) => s.classYear <= ALUMNI_MAX_YEAR && (!onlyYear || s.classYear === onlyYear),
);

ensureDir('data');
const done = new Set();
if (fs.existsSync(OUT)) {
  for (const line of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      done.add(`${r.roster_name}|${r.class_year}`);
    } catch {}
  }
}

let todo = roster.filter((s) => !done.has(`${s.name}|${s.classYear}`));
if (limit) todo = todo.slice(0, limit);
console.log(`Roster alumni: ${roster.length}; already enriched: ${done.size}; this run: ${todo.length}`);

const norm = (s) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

function nameSimilarity(a, b) {
  const ta = new Set(norm(a).split(' '));
  const tb = new Set(norm(b).split(' '));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

function scoreEntity(scholar, props) {
  const blob = JSON.stringify(props).toLowerCase();
  const nameScore = nameSimilarity(scholar.name, props.name);
  if (nameScore < 0.5) return { score: 0, confidence: 'reject' };
  let score = nameScore * 3; // full-name agreement outweighs any single signal
  const signals = [];
  if (blob.includes('schwarzman')) { score += 2; signals.push('schwarzman'); }
  if (blob.includes('tsinghua')) { score += 1; signals.push('tsinghua'); }
  const undergrads = (scholar.universities || '').split(',').map(norm).filter(Boolean);
  if (undergrads.some((u) => u && blob.includes(u))) { score += 1; signals.push('undergrad'); }
  // A partial name + Schwarzman mention may just be a *different* scholar.
  const confidence =
    nameScore >= 0.75 && (signals.includes('schwarzman') || signals.length >= 2) ? 'high'
    : signals.length >= 1 ? 'medium'
    : 'low';
  return { score, confidence, signals };
}

async function enrichOne(scholar) {
  const query = `"${scholar.name}" Schwarzman Scholar`;
  const data = await exaSearch({ query, category: 'people', type: 'auto', numResults: 5 });
  let best = null;
  for (const result of data.results || []) {
    const props = personEntity(result)?.properties;
    if (!props) continue;
    const s = scoreEntity(scholar, props);
    if (s.score > 0 && (!best || s.score > best.s.score)) best = { result, props, s };
  }
  const base = {
    roster_name: scholar.name,
    class_year: scholar.classYear,
    home_country: scholar.country,
    undergrad: scholar.universities,
  };
  if (!best) return { ...base, matched: false, match_confidence: 'none' };
  const job = currentJob(best.props);
  return {
    ...base,
    matched: true,
    match_confidence: best.s.confidence,
    match_signals: best.s.signals,
    profile_name: best.props.name,
    linkedin_url: best.result.url,
    location: best.props.location || null,
    title: job?.title || null,
    company: job?.company?.name || null,
    work_history: (best.props.workHistory || []).slice(0, 5).map((j) => ({
      title: j.title, company: j.company?.name, from: j.dates?.from, to: j.dates?.to,
    })),
  };
}

const out = fs.createWriteStream(OUT, { flags: 'a' });
let processed = 0;
let failed = 0;
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const scholar = queue.shift();
    try {
      const row = await enrichOne(scholar);
      out.write(JSON.stringify(row) + '\n');
    } catch (err) {
      failed++;
      console.error(`  FAIL ${scholar.name}: ${err.message}`);
    }
    processed++;
    if (processed % 25 === 0) console.log(`  ${processed}/${todo.length} (${failed} failed)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
out.end();
console.log(`Done: ${processed} processed, ${failed} failed (failures are retried on next run).`);
