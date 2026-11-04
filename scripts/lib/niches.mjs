// Niche rows (PLAN.md 4.10), shared by the sync (classification) and the build (rows).
// A Reel's row: data/niches.json manual > Gemini, cached in data/niche-cache.json by media ID + caption hash >
// keywords in row order > the fallback row. Every Reel ends up in exactly one niche row; the "top" row is extra.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { captionHash, captionLines } from './captions.mjs';
import { generateJson } from './translate.mjs';

export const NICHES = 'data/niches.json';
export const NICHE_CACHE = 'data/niche-cache.json';

export function readNiches() {
  const cfg = existsSync(NICHES) ? JSON.parse(readFileSync(NICHES, 'utf8')) : {};
  return { layout: 'rows', min_row: 3, fallback: 'comedy', rows: [], manual: {}, ...cfg };
}
export const readNicheCache = () => (existsSync(NICHE_CACHE) ? JSON.parse(readFileSync(NICHE_CACHE, 'utf8')) : { items: {} });
export const writeNicheCache = (c) => writeFileSync(NICHE_CACHE, JSON.stringify(c, null, 2) + '\n');

// Niche keys a Reel can be classified into (every row except the "top N" one), in page order.
export const nicheKeys = (cfg) => cfg.rows.filter((r) => !r.top).map((r) => r.key);
const known = (cfg, key) => nicheKeys(cfg).includes(key);

// Hash of the files the build reads besides the manifest that only Bar edits (rows, titles, the layout flag),
// so the sync rebuilds the site when one of them changes, the same way it reacts to a new Reel.
export function buildInputsHash(files = [NICHES, 'i18n/he.json', 'i18n/en.json']) {
  const h = createHash('sha256');
  for (const f of files) h.update(`${f}\n${existsSync(f) ? readFileSync(f, 'utf8') : ''}\n`);
  return h.digest('hex').slice(0, 16);
}

// Lowercased, without bidi marks or quote marks (so נדל"ן matches נדלן).
const norm = (s) => String(s || '').toLowerCase().replace(/[⁦-⁩‎‏"'׳״‘’“”]/g, '');

export function keywordNiche(caption, cfg) {
  const c = norm(caption);
  for (const r of cfg.rows) if (!r.top && (r.keywords || []).some((k) => c.includes(norm(k)))) return r.key;
  return cfg.fallback;
}

// The row a Reel belongs to, without calling anything: what the build uses.
export function nicheOf(item, cfg, cache = { items: {} }) {
  const manual = cfg.manual?.[item.id];
  if (manual && known(cfg, manual)) return manual;
  const c = cache.items?.[item.id];
  if (c && c.hash === captionHash(item.caption) && known(cfg, c.niche)) return c.niche;
  if (item.niche && known(cfg, item.niche)) return item.niche;
  return keywordNiche(item.caption, cfg);
}

const SYSTEM = (cfg) => `You sort Instagram Reels by an Israeli AI-video creator into the rows of his portfolio site.
Read the caption (Hebrew or English, hashtags included) and answer with exactly one row key from this closed list:
${cfg.rows.filter((r) => !r.top).map((r) => `- ${r.key}: ${r.about || r.key}`).join('\n')}
Pick the row a potential client in that field would look in. Almost every Reel is AI-generated, so "made with AI" alone
does not make a Reel "ai": that row is for Reels about building things with AI tools. If nothing fits, answer "${cfg.fallback}".`;

// Gemini (same key, models and fallback as the caption translation), temperature 0, closed list of keys.
// Returns { niche, model } or null. Throws { noCredentials } when there is no usable key.
export async function geminiNiche(caption, cfg) {
  const keys = nicheKeys(cfg);
  const r = await generateJson({
    system: SYSTEM(cfg),
    payload: { caption: captionLines(caption).join('\n').slice(0, 600), hashtags: (caption || '').match(/#[\p{L}\p{N}_]+/gu) || [] },
    schema: { type: 'OBJECT', properties: { row: { type: 'STRING', enum: keys } }, required: ['row'] },
    temperature: 0,
  });
  return r && keys.includes(r.data?.row) ? { niche: r.data.row, model: r.model } : null;
}

// Sets item.niche / item.niche_source on every visible Reel. Each caption goes to Gemini once (cached by media ID +
// caption hash; an edited caption is classified again); without a key, or when the call fails, keywords decide and
// the Reel is tried again on a later run. Mutates the cache; returns counts and whether the cache changed.
export async function classifyMissing(items, cfg, cache) {
  cache.items ??= {};
  const out = { manual: 0, cached: 0, gemini: 0, keywords: 0, noCredentials: false, changed: false };
  for (const it of items) {
    if (it.visible === false) continue;
    const manual = cfg.manual?.[it.id];
    if (manual && known(cfg, manual)) { it.niche = manual; it.niche_source = 'manual'; out.manual++; continue; }
    const c = cache.items[it.id];
    if (c && c.hash === captionHash(it.caption) && known(cfg, c.niche)) { it.niche = c.niche; it.niche_source = 'gemini'; out.cached++; continue; }
    let g = null;
    if (!out.noCredentials) {
      try { g = await geminiNiche(it.caption, cfg); } catch (e) { if (!e.noCredentials) throw e; console.log(`   ${e.message}`); out.noCredentials = true; }
    }
    if (g) {
      cache.items[it.id] = { hash: captionHash(it.caption), niche: g.niche, source: `${g.model} (Gemini), ${new Date().toISOString().slice(0, 10)}` };
      it.niche = g.niche; it.niche_source = 'gemini'; out.gemini++; out.changed = true;
    } else {
      it.niche = keywordNiche(it.caption, cfg); it.niche_source = 'keywords'; out.keywords++;
    }
  }
  return out;
}

// The rows the page shows, from visible Reels: the top N by views (ties: newer first), then one row per niche in
// config order, newest first. A niche row with fewer than min_row Reels merges into the fallback row; empty rows
// are dropped. Each Reel is in exactly one niche row (plus, possibly, the top row).
export function buildRows(items, cfg, cache) {
  const byTime = (a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  const groups = Object.fromEntries(nicheKeys(cfg).map((k) => [k, []]));
  for (const it of items) (groups[nicheOf(it, cfg, cache)] ?? (groups[cfg.fallback] ??= [])).push(it);
  for (const k of Object.keys(groups)) {
    if (k !== cfg.fallback && groups[k].length && groups[k].length < cfg.min_row) {
      (groups[cfg.fallback] ??= []).push(...groups[k]);
      groups[k] = [];
    }
  }
  return cfg.rows.map((r) => {
    if (r.top) {
      const list = [...items].sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || byTime(a, b)).slice(0, r.top);
      return { key: r.key, top: true, items: list };
    }
    return { key: r.key, top: false, items: (groups[r.key] || []).sort(byTime) };
  }).filter((r) => r.items.length);
}
