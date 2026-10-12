// Import local Reel files into the design directions (stand-in for the Instagram sync job).
//
//   node scripts/import-reels.mjs "/path/to/folder" [--limit 9] [--max-seconds N]
//   node scripts/import-reels.mjs --clear          remove the import, back to placeholders
//
// - Picks the newest files first (by modified time). mp4, mov, m4v, webm.
// - Transcodes exactly as PLAN.md 4.6: 720 px wide, H.264 CRF 28 preset slow, no audio, faststart.
//   WebP poster from the frame at 0.3 s, 24 px LQIP. Hero loops built with the PLAN.md 4.7 recipe.
// - Writes media/local/ (gitignored) and data/instagram.local.json (gitignored). The build prefers
//   the local manifest over the committed placeholder fixture. Nothing here is committed.
// - Optional <folder>/reels.json: { "file name.mp4": { "title": "...", "lane": "comedy|ads|sport", "permalink": "https://..." } }
// - There are no view counts in local files, so per-video views are left empty and the proof row keeps
//   the labelled sample figure until the API supplies real numbers.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
const OUT = 'media/local';
const MANIFEST = 'data/instagram.local.json';
if (args.includes('--clear')) {
  rmSync(OUT, { recursive: true, force: true });
  rmSync(MANIFEST, { force: true });
  console.log('Cleared local import. Directions will use the placeholder fixture.');
  process.exit(0);
}
const folder = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? +args[i + 1] : d; };
const LIMIT = opt('--limit', 9);
const MAX = opt('--max-seconds', 0);
if (!folder || !existsSync(folder)) {
  console.error('Usage: node scripts/import-reels.mjs "/path/to/folder" [--limit 9] [--max-seconds N]');
  process.exit(1);
}

import { probe, transcodeReel, posterFrom, buildHeroLoops } from './lib/media.mjs';
const meta = existsSync(join(folder, 'reels.json')) ? JSON.parse(readFileSync(join(folder, 'reels.json'), 'utf8')) : {};
const files = readdirSync(folder)
  .filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f))
  .map((f) => ({ f, p: join(folder, f), t: statSync(join(folder, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .slice(0, LIMIT);
if (!files.length) { console.error(`No video files in ${folder}`); process.exit(1); }

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const items = [];
for (const [i, { f, p, t }] of files.entries()) {
  const n = String(i + 1).padStart(2, '0');
  const id = `local-${n}`;
  const src = probe(p);
  const out = transcodeReel(p, join(OUT, `${id}.mp4`), { maxSeconds: MAX });
  const lqip = posterFrom(join(OUT, `${id}.mp4`), join(OUT, `${id}.webp`));
  const m = meta[f] || {};
  const kb = (x) => Math.round(statSync(x).size / 1024);
  items.push({
    id, placeholder: false, source_file: f,
    permalink: m.permalink || 'https://www.instagram.com/barfainshtein/',
    timestamp: new Date(t).toISOString(),
    caption: m.title || '', lane: m.lane || 'reels', has_video: true,
    video_url: `${OUT}/${id}.mp4`, poster_url: `${OUT}/${id}.webp`, lqip,
    width: out.w, height: out.h, duration: Math.round(out.d * 10) / 10, views: null, likes: null,
  });
  console.log(`${n}  ${src.w}x${src.h} ${src.d.toFixed(1)}s -> ${out.w}x${out.h}  ${kb(p)} KB -> ${kb(join(OUT, `${id}.mp4`))} KB  ${f.slice(0, 70)}`);
}
const hero = buildHeroLoops(items.map((i) => i.video_url), OUT);

const manifest = {
  generated_at: new Date().toISOString(),
  placeholder: false,
  source: `local import from ${basename(folder)}`,
  media_base_url: '',
  stats: { total_videos: items.length, total_views: null, views_sample: true, missing_media_url: 0, missing_media_url_pct: 0 },
  hero,
  items,
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
const total = readdirSync(OUT).reduce((a, f) => a + statSync(join(OUT, f)).size, 0);
console.log(`\n${items.length} reels imported, ${(total / 1048576).toFixed(1)} MB in ${OUT}. Wrote ${MANIFEST}.`);
console.log('Next: node scripts/build-directions.mjs && node scripts/shots.mjs');
