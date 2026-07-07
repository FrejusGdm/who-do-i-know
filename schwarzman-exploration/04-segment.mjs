// Segment enriched alumni into target CSVs. Pure local, no API calls.
// Run: node 04-segment.mjs
import fs from 'node:fs';
import { writeCsv } from './lib.mjs';

const rows = fs
  .readFileSync('data/enriched.jsonl', 'utf8')
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

function toRow(p, reasons) {
  return {
    name: p.profile_name || p.roster_name,
    class_year: p.class_year,
    company: p.company,
    role: p.title,
    location: p.location,
    linkedin_url: p.linkedin_url,
    undergrad: p.undergrad,
    home_country: p.home_country,
    match_confidence: p.match_confidence,
    segment_reason: reasons.join('; '),
  };
}

const HEADERS = ['name', 'class_year', 'company', 'role', 'location', 'linkedin_url', 'undergrad', 'home_country', 'match_confidence', 'segment_reason'];

const beijing = [];
const bay = [];
const full = [];
for (const p of people) {
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

const matched = people.filter((p) => p.matched).length;
console.log(`People: ${people.length} (${matched} matched to profiles)`);
console.log(`Beijing/China tech: ${beijing.length} -> output/beijing-china-tech-alumni.csv`);
console.log(`Bay Area tech: ${bay.length} -> output/bay-area-tech-alumni.csv`);
console.log(`Full enriched roster -> output/alumni-enriched-full.csv`);
