import fs from 'node:fs';
import path from 'node:path';

export async function exaSearch(body, { retries = 4 } = {}) {
  const API_KEY = process.env.EXA_API_KEY;
  if (!API_KEY) {
    console.error('EXA_API_KEY not set. Run with: node --env-file=../.env.local <script>');
    process.exit(1);
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`Exa ${res.status}: ${text.slice(0, 300)}`);
    }
    const waitMs = Math.min(30000, 1000 * 2 ** attempt);
    console.error(`  Exa ${res.status}, retrying in ${waitMs / 1000}s...`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

export function personEntity(result) {
  return (result.entities || []).find((e) => e.type === 'person') || null;
}

export function currentJob(props) {
  const jobs = props?.workHistory || [];
  return jobs.find((j) => j.dates && j.dates.to == null) || jobs[0] || null;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Parse a CSV file into an array of objects keyed by header row.
// Handles quoted fields, embedded commas/newlines, and a UTF-8 BOM.
export function parseCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row); }
  const headers = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

// Normalize a name to latin lowercase tokens for cross-source matching.
export function nameTokens(name) {
  return (name || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function linkedinSlug(url) {
  const m = (url || '').toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).replace(/\/+$/, '') : null;
}

export function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsv(file, headers, rows) {
  ensureDir(path.dirname(file));
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  fs.writeFileSync(file, lines.join('\n') + '\n');
}
