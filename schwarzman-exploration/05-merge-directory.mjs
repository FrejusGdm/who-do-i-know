// Merge the private Schwarzman community directory (data/directory.csv) into
// the Exa-enriched roster. Pure local, no API calls.
//
// Matching priority per directory row:
//   1. LinkedIn slug == Exa-found LinkedIn slug  -> confirms the Exa match
//   2. name tokens + class year
//   3. name tokens alone (only if unique across roster)
//
// Confidence updates on enriched rows:
//   - directory LinkedIn agrees with Exa LinkedIn -> 'directory-confirmed'
//   - directory LinkedIn disagrees               -> 'mismatch' (Exa likely found
//     the wrong person; row lands in output/match-issues.csv and the directory
//     LinkedIn replaces the Exa one)
//
// Writes data/merged.jsonl (04-segment.mjs prefers it over enriched.jsonl).
// Run: node 05-merge-directory.mjs
import fs from 'node:fs';
import { parseCsv, nameTokens, linkedinSlug, writeCsv, ensureDir } from './lib.mjs';

const enriched = fs
  .readFileSync('data/enriched.jsonl', 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));
const byKey = new Map();
for (const r of enriched) byKey.set(`${r.roster_name}|${r.class_year}`, r);
const people = [...byKey.values()];

const directory = parseCsv('data/directory.csv');

// Cohort C1 = Class of 2017 ... C10 = Class of 2026.
const cohortYear = (c) => {
  const m = (c || '').match(/C\s*(\d+)/i);
  return m ? 2016 + Number(m[1]) : null;
};

// Indexes over the enriched roster.
const bySlug = new Map();
const byNameYear = new Map();
const byName = new Map(); // token key -> array (to detect ambiguity)
const byFirstLast = new Map();
for (const p of people) {
  const slug = linkedinSlug(p.linkedin_url);
  if (slug) bySlug.set(slug, p);
  for (const name of new Set([p.roster_name, p.profile_name].filter(Boolean))) {
    const toks = nameTokens(name);
    if (!toks.length) continue;
    const full = [...toks].sort().join(' ');
    byNameYear.set(`${full}|${p.class_year}`, p);
    const arr = byName.get(full) || byName.set(full, []).get(full);
    if (!arr.includes(p)) arr.push(p);
    if (toks.length >= 2) {
      const fl = `${toks[0]} ${toks[toks.length - 1]}`;
      byFirstLast.set(`${fl}|${p.class_year}`, p);
    }
  }
}

const emailCol = Object.keys(directory[0] || {}).find((h) => /email/i.test(h)) || null;

let viaSlug = 0, viaNameYear = 0, viaName = 0, unmatchedDir = [];
let confirmed = 0;
const issues = [];

for (const d of directory) {
  const name = `${d['First Name']} ${d['Last Name']}`.trim();
  const year = cohortYear(d['Schwarzman Scholars Cohort']);
  const dSlug = linkedinSlug(d['LinkedIn URL']);
  const toks = nameTokens(name);
  const full = [...toks].sort().join(' ');
  const fl = toks.length >= 2 ? `${toks[0]} ${toks[toks.length - 1]}` : null;

  let p = null, how = null;
  if (dSlug && bySlug.has(dSlug)) { p = bySlug.get(dSlug); how = 'slug'; }
  else if (byNameYear.has(`${full}|${year}`)) { p = byNameYear.get(`${full}|${year}`); how = 'name+year'; }
  else if (fl && byFirstLast.has(`${fl}|${year}`)) { p = byFirstLast.get(`${fl}|${year}`); how = 'name+year'; }
  else if (byName.get(full)?.length === 1) { p = byName.get(full)[0]; how = 'name'; }

  if (!p) { unmatchedDir.push({ name, cohort: d['Schwarzman Scholars Cohort'], linkedin: d['LinkedIn URL'] }); continue; }
  if (how === 'slug') viaSlug++; else if (how === 'name+year') viaNameYear++; else viaName++;

  p.directory = 'yes';
  p.instagram = d['Instagram URL'] || '';
  p.website = d['Website URL'] || '';
  p.home_city = d['Home City and Country'] || '';
  p.schools = d['Undergraduate/Graduate Schools attended'] || '';
  p.interests = d['Interests'] || '';
  p.languages = d['Non-English Languages Spoken'] || '';
  p.workplaces_directory = d['Current and Previous Workplaces'] || '';
  p.location_directory = d['Current Location'] || '';
  if (emailCol) p.email = d[emailCol] || '';

  const eSlug = linkedinSlug(p.linkedin_url);
  if (dSlug && eSlug && dSlug === eSlug) {
    p.match_confidence = 'directory-confirmed';
    confirmed++;
  } else if (dSlug && eSlug && dSlug !== eSlug) {
    issues.push({
      name, class_year: p.class_year,
      exa_linkedin: p.linkedin_url, directory_linkedin: d['LinkedIn URL'],
      exa_company: p.company, exa_role: p.title,
      note: 'directory LinkedIn differs from Exa match - Exa job data may belong to the wrong person',
    });
    p.linkedin_url = d['LinkedIn URL'];
    p.match_confidence = 'mismatch';
  } else if (dSlug && !eSlug) {
    p.linkedin_url = d['LinkedIn URL'];
    if (p.match_confidence !== 'directory-confirmed') p.match_confidence = p.matched ? p.match_confidence : 'directory-only';
  }
}

// Directory people missing from the Exa roster become directory-only rows so
// they still show up in the full CSV and (via directory location/workplace)
// can land in segments.
for (const u of unmatchedDir) {
  const d = directory.find((x) => `${x['First Name']} ${x['Last Name']}`.trim() === u.name);
  const firstWorkplace = (d['Current and Previous Workplaces'] || '').split(',')[0].trim();
  people.push({
    roster_name: u.name,
    class_year: cohortYear(d['Schwarzman Scholars Cohort']),
    matched: Boolean(firstWorkplace || d['Current Location']),
    match_confidence: 'directory-only',
    company: firstWorkplace,
    title: '',
    location: d['Current Location'] || '',
    linkedin_url: d['LinkedIn URL'] || '',
    undergrad: d['Undergraduate/Graduate Schools attended'] || '',
    home_country: d['Home City and Country'] || '',
    directory: 'yes',
    instagram: d['Instagram URL'] || '',
    website: d['Website URL'] || '',
    home_city: d['Home City and Country'] || '',
    schools: d['Undergraduate/Graduate Schools attended'] || '',
    interests: d['Interests'] || '',
    languages: d['Non-English Languages Spoken'] || '',
    workplaces_directory: d['Current and Previous Workplaces'] || '',
    location_directory: d['Current Location'] || '',
    ...(emailCol ? { email: d[emailCol] || '' } : {}),
  });
}

ensureDir('data');
fs.writeFileSync('data/merged.jsonl', people.map((p) => JSON.stringify(p)).join('\n') + '\n');

writeCsv('output/match-issues.csv',
  ['name', 'class_year', 'exa_linkedin', 'directory_linkedin', 'exa_company', 'exa_role', 'note'], issues);
writeCsv('output/directory-unmatched.csv', ['name', 'cohort', 'linkedin'], unmatchedDir);

console.log(`Directory rows: ${directory.length}${emailCol ? ` (email column: ${emailCol})` : ' (no email column found)'}`);
console.log(`Matched to roster: ${viaSlug + viaNameYear + viaName} (${viaSlug} by LinkedIn, ${viaNameYear} by name+year, ${viaName} by unique name)`);
console.log(`Exa matches confirmed by directory LinkedIn: ${confirmed}`);
console.log(`Conflicting LinkedIn (wrong-person risk): ${issues.length} -> output/match-issues.csv`);
console.log(`Directory people not found in roster: ${unmatchedDir.length} -> output/directory-unmatched.csv`);
console.log('Wrote data/merged.jsonl - rerun: node 04-segment.mjs');
