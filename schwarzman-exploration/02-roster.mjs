// Build ground-truth alumni roster from the schwarzman.org scholars directory.
// Run: node --env-file=../.env.local 02-roster.mjs
import fs from 'node:fs';
import { ensureDir, writeJson } from './lib.mjs';

const URL = 'https://www.schwarzmanscholars.org/scholars/';
const CACHE = 'data/scholars-page.html';

let html;
if (fs.existsSync(CACHE)) {
  html = fs.readFileSync(CACHE, 'utf8');
  console.log(`Using cached ${CACHE} (${(html.length / 1e6).toFixed(1)} MB)`);
} else {
  console.log(`Fetching ${URL} ...`);
  const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  html = await res.text();
  ensureDir('data');
  fs.writeFileSync(CACHE, html);
  console.log(`Saved ${CACHE} (${(html.length / 1e6).toFixed(1)} MB)`);
}

// Markup-agnostic parse: flatten to text lines, then walk for the
// name / "Class of YYYY - YYYY" / "Country - University, University" pattern.
const decode = (s) =>
  s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;/g, "’").replace(/&#8211;|&ndash;/g, '-')
    .replace(/&quot;|&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

const text = decode(
  html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n'),
);
const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

const scholars = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^Class of (\d{4})\s*[-–]\s*(\d{4})$/);
  if (!m) continue;
  const name = lines[i - 1];
  if (!name || /^(All|Year|University|Country)/i.test(name)) continue;
  const classYear = Number(m[2]); // "Class of 2025 - 2026" => Class of 2026
  let country = null;
  let universities = null;
  const detail = lines[i + 1];
  if (detail && !/^Class of /.test(detail) && detail !== 'View Bio') {
    const dm = detail.match(/^([^-]+?)\s*[-–]\s*(.+)$/);
    if (dm) {
      country = dm[1].trim();
      universities = dm[2].trim();
    } else {
      country = detail.trim();
    }
  }
  scholars.push({ name, classYear, country, universities });
}

// Dedup (same person can appear once); key on name+classYear.
const seen = new Set();
const roster = scholars.filter((s) => {
  const k = `${s.name}|${s.classYear}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

const byYear = {};
for (const s of roster) byYear[s.classYear] = (byYear[s.classYear] || 0) + 1;
console.log(`Parsed ${roster.length} scholars`);
console.log('By class year:', JSON.stringify(byYear, null, 2));
console.log('Sample:', JSON.stringify(roster.slice(0, 3), null, 2));

writeJson('data/roster.json', roster);
console.log('Wrote data/roster.json');
