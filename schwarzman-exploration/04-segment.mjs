// Segment enriched alumni into target CSVs. Pure local, no API calls.
// Reads data/merged.jsonl (directory-enriched, from 05-merge-directory.mjs)
// when present, else data/enriched.jsonl.
// Personal layer: my-notes.csv (gitignored) is joined in by name+year; edit it
// and rerun this script to refresh the outputs. Columns there:
//   status, notes, last_contacted, next_step, exclude (yes = drop row),
//   linkedin_override (replaces linkedin_url).
// Run: node 04-segment.mjs
import fs from 'node:fs';
import { writeCsv, parseCsv, nameTokens } from './lib.mjs';

const source = fs.existsSync('data/merged.jsonl') ? 'data/merged.jsonl' : 'data/enriched.jsonl';
const rows = fs
  .readFileSync(source, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

// Latest attempt per person wins (reruns append).
const byKey = new Map();
for (const r of rows) byKey.set(`${r.roster_name}|${r.class_year}`, r);
const people = [...byKey.values()];

const TECH_COMPANIES = [
  'bytedance', 'tiktok', 'tencent', 'alibaba', 'baidu', 'deepseek', 'moonshot', 'zhipu', '智谱',
  'minimax', 'baichuan', '百川', 'sensetime', '商汤', 'xiaomi', 'huawei', 'dji', 'meituan',
  'pinduoduo', 'temu', 'didi', 'ant group', 'ant international', 'jd.com', 'kuaishou', 'unitree',
  'google', 'meta', 'apple', 'amazon', 'aws', 'microsoft', 'nvidia', 'openai', 'anthropic',
  'stripe', 'airbnb', 'uber', 'lyft', 'palantir', 'databricks', 'snowflake', 'salesforce',
  'linkedin', 'netflix', 'tesla', 'spacex', 'scale ai', 'figma', 'notion', 'ramp', 'plaid',
  'coinbase', 'robinhood', 'doordash', 'instacart', 'waymo', 'cruise', 'deepmind', 'x.ai', 'xai',
];
const TECH_TITLE = /software|engineer|developer|product manager|\bpm\b|data scien|machine learning|\bai\b|artificial intelligence|\bml\b|cto|chief technology|founder|co-founder|technical|research scientist|product design|growth|algorithm|robotics/i;
const TECH_COMPANY_HINT = /\btech\b|technology|\bai\b|software|robotics|semiconductor|startup|labs?\b|digital|data|cyber|intelligen/i;
const VC = /venture|\bvc\b|capital|invest/i;

const CHINA = /beijing|shanghai|shenzhen|hangzhou|guangzhou|suzhou|nanjing|chengdu|china|hong kong/i;
const BAY = /san francisco|bay area|silicon valley|palo alto|menlo park|mountain view|san jose|oakland|berkeley|cupertino|sunnyvale|redwood|south san|santa clara|fremont, cal/i;

function classify(p) {
  const company = (p.company || '').toLowerCase();
  const title = p.title || '';
  const reasons = [];
  if (TECH_COMPANIES.some((c) => company.includes(c))) reasons.push('known tech company');
  if (TECH_TITLE.test(title)) reasons.push('tech role title');
  if (TECH_COMPANY_HINT.test(company)) reasons.push('tech-sounding company');
  if (VC.test(company) || VC.test(title)) reasons.push('vc/investor');
  return reasons;
}

// Personal notes layer, joined by normalized name + class year.
const NOTES_FILE = 'my-notes.csv';
const noteKey = (name, year) => `${[...nameTokens(name)].sort().join(' ')}|${year}`;
const notes = new Map();
if (fs.existsSync(NOTES_FILE)) {
  for (const n of parseCsv(NOTES_FILE)) {
    if (n.name) notes.set(noteKey(n.name, n.class_year), n);
  }
}
const noteFor = (p) =>
  notes.get(noteKey(p.profile_name || p.roster_name, p.class_year)) ||
  notes.get(noteKey(p.roster_name, p.class_year)) || {};

function toRow(p, reasons) {
  const n = noteFor(p);
  return {
    name: p.profile_name || p.roster_name,
    class_year: p.class_year,
    company: p.company,
    role: p.title,
    location: p.location,
    linkedin_url: n.linkedin_override || p.linkedin_url,
    email: p.email || '',
    instagram: p.instagram || '',
    website: p.website || '',
    home_city: p.home_city || '',
    interests: p.interests || '',
    languages: p.languages || '',
    undergrad: p.undergrad || p.schools || '',
    home_country: p.home_country,
    in_directory: p.directory || '',
    match_confidence: n.linkedin_override ? 'manual' : p.match_confidence,
    segment_reason: reasons.join('; '),
    status: n.status || '',
    notes: n.notes || '',
    last_contacted: n.last_contacted || '',
    next_step: n.next_step || '',
  };
}

const HEADERS = [
  'name', 'class_year', 'company', 'role', 'location', 'linkedin_url',
  'email', 'instagram', 'website', 'home_city', 'interests', 'languages',
  'undergrad', 'home_country', 'in_directory', 'match_confidence', 'segment_reason',
  'status', 'notes', 'last_contacted', 'next_step',
];

const excluded = (p) => /^y/i.test(noteFor(p).exclude || '');

const beijing = [];
const bay = [];
const full = [];
for (const p of people) {
  if (excluded(p)) continue;
  const reasons = p.matched ? classify(p) : [];
  full.push(toRow(p, reasons));
  if (!p.matched || !reasons.length) continue;
  if (CHINA.test(p.location || '')) beijing.push(toRow(p, reasons));
  if (BAY.test(p.location || '')) bay.push(toRow(p, reasons));
}

const bySeg = (rows) => rows.sort((a, b) => (a.match_confidence > b.match_confidence ? 1 : -1) || b.class_year - a.class_year);

writeCsv('output/beijing-china-tech-alumni.csv', HEADERS, bySeg(beijing));
writeCsv('output/bay-area-tech-alumni.csv', HEADERS, bySeg(bay));
writeCsv('output/alumni-enriched-full.csv', HEADERS, full);

// Seed the personal notes file on first run with the two target segments.
if (!fs.existsSync(NOTES_FILE)) {
  const seedHeaders = ['name', 'class_year', 'segment', 'status', 'notes', 'last_contacted', 'next_step', 'exclude', 'linkedin_override'];
  const seen = new Set();
  const seed = [];
  for (const [segment, list] of [['beijing', beijing], ['bay', bay]]) {
    for (const r of list) {
      const k = noteKey(r.name, r.class_year);
      if (seen.has(k)) continue;
      seen.add(k);
      seed.push({ name: r.name, class_year: r.class_year, segment, status: '', notes: '', last_contacted: '', next_step: '', exclude: '', linkedin_override: '' });
    }
  }
  writeCsv(NOTES_FILE, seedHeaders, seed);
  console.log(`Seeded ${NOTES_FILE} with ${seed.length} people - add your notes there and rerun.`);
}

const matched = people.filter((p) => p.matched).length;
console.log(`Source: ${source}${notes.size ? ` | notes joined: ${notes.size}` : ''}`);
console.log(`People: ${people.length} (${matched} matched to profiles)`);
console.log(`Beijing/China tech: ${beijing.length} -> output/beijing-china-tech-alumni.csv`);
console.log(`Bay Area tech: ${bay.length} -> output/bay-area-tech-alumni.csv`);
console.log(`Full enriched roster -> output/alumni-enriched-full.csv`);
