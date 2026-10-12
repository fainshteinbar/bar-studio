// Prints a one-line summary per saved Lighthouse JSON in directions/shots/lighthouse/.
import { readdirSync, readFileSync } from 'node:fs';
const dir = 'directions/shots/lighthouse';
const pct = (c) => Math.round((c?.score ?? 0) * 100);
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  const a = r.audits, c = r.categories;
  const lcpEl = Object.values(a).find((x) => /lcp|largest-contentful-paint-element/i.test(x.id) && x.details?.items)
    ?.details.items.flatMap((i) => i.items || [i]).find((i) => i.node)?.node?.nodeLabel || '?';
  console.log([f.replace('.json', ''), `perf ${pct(c.performance)}`, `a11y ${pct(c.accessibility)}`, `bp ${pct(c['best-practices'])}`, `seo ${pct(c.seo)}`,
    `LCP ${a['largest-contentful-paint'].displayValue}`, `CLS ${a['cumulative-layout-shift'].displayValue}`, `TBT ${a['total-blocking-time'].displayValue}`,
    `FCP ${a['first-contentful-paint'].displayValue}`, `LCP element: ${String(lcpEl).slice(0, 50)}`].join(' | '));
}
