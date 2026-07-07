// Approach B probe: direct Exa people-search queries for Schwarzman alumni in tech.
// Run: node --env-file=../.env.local 01-probe.mjs
import { exaSearch, personEntity, currentJob, writeJson } from './lib.mjs';

const QUERIES = [
  ['beijing-tech', 'Schwarzman Scholar alumni working at a tech company in Beijing'],
  ['china-ai', 'Schwarzman Scholar working in artificial intelligence in China'],
  ['bay-swe', 'Schwarzman Scholar software engineer in San Francisco Bay Area'],
  ['bay-pm', 'Schwarzman Scholar product manager at a tech company in Silicon Valley'],
  ['bay-startup', 'Schwarzman Scholar founder or early employee at a startup in San Francisco'],
  ['bay-vc', 'Schwarzman Scholar venture capital investor in the Bay Area'],
];

for (const [slug, query] of QUERIES) {
  console.log(`\n=== ${query}`);
  const data = await exaSearch({ query, category: 'people', type: 'auto', numResults: 25 });
  writeJson(`data/probe/${slug}.json`, data);
  let shown = 0;
  for (const result of data.results || []) {
    const props = personEntity(result)?.properties;
    if (!props) continue;
    const job = currentJob(props);
    const title = job?.title || '?';
    const company = job?.company?.name || '?';
    console.log(`  ${props.name} — ${title} @ ${company} — ${props.location || '?'}`);
    console.log(`    ${result.url}`);
    shown++;
  }
  console.log(`  (${shown} person entities of ${(data.results || []).length} results)`);
}
console.log('\nRaw responses saved to data/probe/*.json');
