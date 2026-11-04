// Lighthouse quality gate (PLAN.md 4.10): 3 runs per page and form factor, median per metric, thresholds enforced.
//   node scripts/lh-gate.mjs                  local build, served from the repo root (on a GitHub runner in CI)
//   node scripts/lh-gate.mjs https://fainshteinbar.github.io/bar-studio/   the live site
// Gate: performance, accessibility, best practices and SEO >= 95; mobile LCP < 2.5 s; CLS < 0.02.
// Writes shots-local/<target>/lighthouse/<page>-<ff>-<n>.json and gate.json; exit code 1 when the gate fails.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { serve } from './serve.mjs';

const PORT = 4178;
const LIVE = process.argv.slice(2).find((a) => /^https?:/.test(a));
const RUNS = +(process.env.LH_RUNS || 3);
const OUT = `${process.env.SHOTS_OUT || `shots-local/${LIVE ? 'live' : 'local'}`}/lighthouse`;
const BASE = LIVE ? LIVE.replace(/\/?$/, '/') : `http://localhost:${PORT}/`;
mkdirSync(OUT, { recursive: true });
const server = LIVE ? null : await serve(PORT, process.cwd());
const chrome = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const rows = [], failures = [];
for (const page of ['he', 'en']) {
  for (const ff of ['mobile', 'desktop']) {
    const runs = [];
    for (let n = 1; n <= RUNS; n++) {
      const file = `${OUT}/${page}-${ff}-${n}.json`;
      const r = spawnSync('npx', ['lighthouse', `${BASE}${page === 'en' ? 'en/' : ''}`, '--quiet', '--output=json', `--output-path=${file}`,
        ...(ff === 'desktop' ? ['--preset=desktop'] : []), '--chrome-flags=--headless=new --no-sandbox'], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CHROME_PATH: chrome } });
      if (r.status !== 0) { failures.push(`${page}-${ff} run ${n}: lighthouse exited ${r.status} ${String(r.stderr).slice(-300)}`); continue; }
      const j = JSON.parse(readFileSync(file, 'utf8'));
      const c = j.categories, a = j.audits;
      runs.push({
        perf: Math.round(c.performance.score * 100), a11y: Math.round(c.accessibility.score * 100), bp: Math.round(c['best-practices'].score * 100), seo: Math.round(c.seo.score * 100),
        lcp: a['largest-contentful-paint'].numericValue / 1000, cls: a['cumulative-layout-shift'].numericValue, tbt: a['total-blocking-time'].numericValue,
        errors: (a['errors-in-console']?.details?.items || []).length,
      });
    }
    if (!runs.length) continue;
    const m = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((x) => x[k]))]));
    const key = `${page === 'he' ? '/' : '/en/'} ${ff}`;
    const bad = [];
    for (const k of ['perf', 'a11y', 'bp', 'seo']) if (m[k] < 95) bad.push(`${k} ${m[k]}`);
    if (ff === 'mobile' && m.lcp >= 2.5) bad.push(`LCP ${m.lcp.toFixed(2)} s`);
    if (m.cls >= 0.02) bad.push(`CLS ${m.cls.toFixed(3)}`);
    if (m.errors) bad.push(`${m.errors} console errors`);
    if (bad.length) failures.push(`${key}: ${bad.join(', ')}`);
    rows.push({ key, ...m, runs });
    console.log(`${key.padEnd(13)} perf ${m.perf} · a11y ${m.a11y} · bp ${m.bp} · seo ${m.seo} · LCP ${m.lcp.toFixed(2)} s · CLS ${m.cls.toFixed(3)} · TBT ${Math.round(m.tbt)} ms   (runs: ${runs.map((x) => `${x.perf}/${x.lcp.toFixed(2)}s`).join(', ')})`);
  }
}
writeFileSync(`${OUT}/gate.json`, JSON.stringify({ target: BASE, runs: RUNS, rows, failures }, null, 2) + '\n');
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Lighthouse (${RUNS} runs, median) · ${BASE}\n\n| page | perf | a11y | bp | seo | LCP | CLS | TBT |\n|---|---|---|---|---|---|---|---|\n` +
    rows.map((r) => `| ${r.key} | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${r.lcp.toFixed(2)} s | ${r.cls.toFixed(3)} | ${Math.round(r.tbt)} ms |`).join('\n') +
    `\n\n${failures.length ? `**Gate failed:** ${failures.join('; ')}` : 'Gate passed.'}\n`);
}
server?.close();
console.log(failures.length ? `\nGATE FAILED:\n  ${failures.join('\n  ')}` : '\nGate passed.');
process.exitCode = failures.length ? 1 : 0;
