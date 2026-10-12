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
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';

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

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const probe = (f) => {
  const j = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', f]));
  return { w: j.streams[0].width, h: j.streams[0].height, d: +j.format.duration };
};
const meta = existsSync(join(folder, 'reels.json')) ? JSON.parse(readFileSync(join(folder, 'reels.json'), 'utf8')) : {};
const files = readdirSync(folder)
  .filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f))
  .map((f) => ({ f, p: join(folder, f), t: statSync(join(folder, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)
  .slice(0, LIMIT);
if (!files.length) { console.error(`No video files in ${folder}`); process.exit(1); }

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), `reels-${process.pid}`);
mkdirSync(tmp, { recursive: true });

const items = [];
for (const [i, { f, p }] of files.entries()) {
  const n = String(i + 1).padStart(2, '0');
  const id = `local-${n}`;
  const src = probe(p);
  const trim = MAX > 0 ? ['-t', String(MAX)] : [];
  run('ffmpeg', ['-v', 'error', '-y', '-i', p, ...trim, '-vf', "scale='min(720,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-an', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(OUT, `${id}.mp4`)]);
  const out = probe(join(OUT, `${id}.mp4`));
  run('ffmpeg', ['-v', 'error', '-y', '-ss', '0.3', '-i', join(OUT, `${id}.mp4`), '-frames:v', '1', join(tmp, `${id}.png`)]);
  run('cwebp', ['-quiet', '-q', '72', join(tmp, `${id}.png`), '-o', join(OUT, `${id}.webp`)]);
  run('cwebp', ['-quiet', '-resize', '24', '0', '-q', '40', join(tmp, `${id}.png`), '-o', join(tmp, `${id}-lq.webp`)]);
  const m = meta[f] || {};
  const kb = (x) => Math.round(statSync(x).size / 1024);
  items.push({
    id, placeholder: false, source_file: f,
    permalink: m.permalink || 'https://www.instagram.com/barfainshtein/',
    timestamp: new Date(files[i].t).toISOString(),
    caption: m.title || '', lane: m.lane || 'reels', has_video: true,
    video_url: `${OUT}/${id}.mp4`, poster_url: `${OUT}/${id}.webp`,
    lqip: `data:image/webp;base64,${readFileSync(join(tmp, `${id}-lq.webp`)).toString('base64')}`,
    width: out.w, height: out.h, duration: Math.round(out.d * 10) / 10, views: null, likes: null,
  });
  console.log(`${n}  ${src.w}x${src.h} ${src.d.toFixed(1)}s -> ${out.w}x${out.h}  ${kb(p)} KB -> ${kb(join(OUT, `${id}.mp4`))} KB  ${f.slice(0, 70)}`);
}

// Hero loops (PLAN.md 4.7): 3-up 16:9 from the newest reels, plus a one-at-a-time portrait loop.
const pick = (k) => items[k % items.length].video_url;
const seg = (a, b, c, name) =>
  run('ffmpeg', ['-v', 'error', '-y', '-i', pick(a), '-i', pick(b), '-i', pick(c), '-filter_complex',
    '[0]scale=428:-2,crop=428:720[a];[1]scale=428:-2,crop=428:720[b];[2]scale=428:-2,crop=428:720[c];[a][b][c]hstack=3,crop=1280:720,format=yuv420p',
    '-t', '3.4', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-an', '-r', '30', join(tmp, `${name}.mp4`)]);
seg(0, 1, 2, 'a'); seg(3, 4, 5, 'b'); seg(6, 7, 8, 'c');
run('ffmpeg', ['-v', 'error', '-y', '-i', join(tmp, 'a.mp4'), '-i', join(tmp, 'b.mp4'), '-i', join(tmp, 'c.mp4'), '-filter_complex',
  '[0][1]xfade=transition=fade:duration=0.4:offset=3[ab];[ab][2]xfade=transition=fade:duration=0.4:offset=6',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${OUT}/hero-loop.mp4`]);
run('ffmpeg', ['-v', 'error', '-y', '-i', pick(0), '-i', pick(1), '-i', pick(2), '-filter_complex',
  '[0]scale=720:-2,crop=720:1280,trim=0:2.5,setpts=PTS-STARTPTS,fps=30[a];[1]scale=720:-2,crop=720:1280,trim=0:2.5,setpts=PTS-STARTPTS,fps=30[b];[2]scale=720:-2,crop=720:1280,trim=0:2.5,setpts=PTS-STARTPTS,fps=30[c];[a][b]xfade=transition=fade:duration=0.4:offset=2.1[ab];[ab][c]xfade=transition=fade:duration=0.4:offset=4.2,scale=480:854,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-movflags', '+faststart', '-an', `${OUT}/hero-loop-portrait.mp4`]);
for (const h of ['hero-loop', 'hero-loop-portrait']) {
  run('ffmpeg', ['-v', 'error', '-y', '-ss', '0.5', '-i', `${OUT}/${h}.mp4`, '-frames:v', '1', join(tmp, `${h}.png`)]);
  run('cwebp', ['-quiet', '-q', '70', join(tmp, `${h}.png`), '-o', `${OUT}/${h}.webp`]);
}
rmSync(tmp, { recursive: true, force: true });

const manifest = {
  generated_at: new Date().toISOString(),
  placeholder: false,
  source: `local import from ${basename(folder)}`,
  media_base_url: '',
  stats: { total_videos: items.length, total_views: null, views_sample: true, missing_media_url: 0, missing_media_url_pct: 0 },
  hero: {
    landscape: { video_url: `${OUT}/hero-loop.mp4`, poster_url: `${OUT}/hero-loop.webp`, width: 1280, height: 720 },
    portrait: { video_url: `${OUT}/hero-loop-portrait.mp4`, poster_url: `${OUT}/hero-loop-portrait.webp`, width: 480, height: 854 },
    showreel: null,
  },
  items,
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
const total = readdirSync(OUT).reduce((a, f) => a + statSync(join(OUT, f)).size, 0);
console.log(`\n${items.length} reels imported, ${(total / 1048576).toFixed(1)} MB in ${OUT}. Wrote ${MANIFEST}.`);
console.log('Next: node scripts/build-directions.mjs && node scripts/shots.mjs');
