// One-off initial row assignment (PLAN.md 4.10): classifies every shown Reel with Gemini (when GEMINI_API_KEY is set)
// and with the keyword fallback, prints a table (ID, caption start, expected row, Gemini, keywords), and with --write
// stores the expected rows (test/rows/expected-niches.json, Bar's list) in data/niches.json manual so they never move.
//   node scripts/niches-init.mjs [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { readNiches, keywordNiche, geminiNiche, NICHES } from './lib/niches.mjs';
import { captionLines } from './lib/captions.mjs';

const manifest = JSON.parse(readFileSync('data/instagram.json', 'utf8'));
const expected = JSON.parse(readFileSync('test/rows/expected-niches.json', 'utf8'));
const cfg = readNiches();
const clean = (c) => captionLines(c)[0] || '';
const expectedOf = (caption) => {
  const first = clean(caption).replace(/[’']/g, '');
  for (const [k, starts] of Object.entries(expected)) if (Array.isArray(starts) && starts.some((s) => first.startsWith(s.replace(/[’']/g, '')))) return k;
  return expected.rest;
};
const shown = manifest.items.filter((i) => i.status === 'shown');
const PACE = +(process.env.NICHES_PACE_MS || 6500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
let gemini = true;
for (const it of shown) {
  let g = '';
  if (gemini) {
    // Paced for the free tier's per-minute limit (38 back-to-back calls hit 429/503); one retry after a pause.
    for (let attempt = 0; attempt < 2 && (!g || g === '(no answer)'); attempt++) {
      if (attempt) await sleep(30000);
      try { g = (await geminiNiche(it.caption, { ...cfg, manual: {} }))?.niche || '(no answer)'; }
      catch (e) { if (!e.noCredentials) throw e; console.log(`Gemini: ${e.message}`); gemini = false; g = ''; break; }
    }
    await sleep(PACE);
  }
  rows.push({ id: it.id, start: clean(it.caption).slice(0, 34), expected: expectedOf(it.caption), gemini: g, keywords: keywordNiche(it.caption, cfg) });
}
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('id', 19)} ${pad('expected', 11)} ${pad('gemini', 11)} ${pad('keywords', 11)} caption`);
for (const r of rows) console.log(`${pad(r.id, 19)} ${pad(r.expected, 11)} ${pad(r.gemini || '-', 11)} ${pad(r.keywords, 11)} ${r.start}`);
const diff = (k) => rows.filter((r) => r[k] && r[k] !== r.expected);
console.log(`\n${rows.length} shown Reels. Gemini disagrees on ${gemini ? diff('gemini').length : 'n/a'}, keywords on ${diff('keywords').length}.`);
for (const r of gemini ? diff('gemini') : []) console.log(`  Gemini: ${r.id} ${r.start} -> ${r.gemini} (list: ${r.expected})`);
for (const r of diff('keywords')) console.log(`  keywords: ${r.id} ${r.start} -> ${r.keywords} (list: ${r.expected})`);
const counts = rows.reduce((a, r) => ((a[r.expected] = (a[r.expected] || 0) + 1), a), {});
console.log('Rows by the list:', JSON.stringify(counts));
if (process.env.NICHES_TABLE) writeFileSync(process.env.NICHES_TABLE, JSON.stringify(rows, null, 2) + '\n');
if (process.argv.includes('--write')) {
  const raw = JSON.parse(readFileSync(NICHES, 'utf8'));
  raw.manual = Object.fromEntries(rows.map((r) => [r.id, r.expected]));
  writeFileSync(NICHES, JSON.stringify(raw, null, 2) + '\n');
  console.log(`Wrote ${rows.length} entries to ${NICHES} manual.`);
}
