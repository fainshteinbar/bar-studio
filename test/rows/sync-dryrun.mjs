// Dry run of scripts/ig-sync.mjs against fixtures (PLAN.md 4.10): no Instagram token, no Gemini key, no upload.
//   node test/rows/sync-dryrun.mjs        (needs ffmpeg and cwebp, as the sync does)
// Fixture 1: A = a shown Reel without media_url (licensed audio) with a cover, B = a new Reel with media_url,
//            C = a Reel without media_url and without a cover. Expect A and C visible with playback "embed"
//            (cover / branded poster), B playback "file", every one in a row by keywords (no Gemini key).
// Then: the same data again must be mode "none" (the embed must not trigger work every hour); a changed layout flag
// must be "stats" (rebuild); fixture 2 gives A a media_url: detect says "media now available" and the next run turns
// A into playback "file". Nothing in data/ is written. Exit code 1 on any failed expectation.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve } from '../../scripts/serve.mjs';

const T = join(tmpdir(), `sync-dryrun-${process.pid}`);
mkdirSync(join(T, 'media'), { recursive: true });
const PORT = 4179, BASE = `http://localhost:${PORT}`;
const server = await serve(PORT, T);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=540x960:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(T, 'b.mp4')]);
copyFileSync(join('assets/first', readdirSync('assets/first').find((f) => f.endsWith('.webp'))), join(T, 'cover.webp'));

// English captions, so no translation is pending (that would rightly keep the hourly run in "stats").
const NOW = '2026-11-04T10:00:00+0000';
const reel = (id, sc, caption, extra = {}) => ({ id, caption, media_type: 'VIDEO', media_product_type: 'REELS', is_shared_to_feed: true, permalink: `https://www.instagram.com/reel/${sc}/`, timestamp: NOW, like_count: 10, comments_count: 1, ...extra });
const A = reel('900000000000000001', 'DfFhE2Qy16n', 'We bought a home that does not exist yet. #realestate', { thumbnail_url: `${BASE}/cover.webp` });
const B = reel('900000000000000002', 'DfTEST00002', 'POV: the world stops on the way to your wedding #wedding', { media_url: `${BASE}/b.mp4`, thumbnail_url: `${BASE}/cover.webp` });
const C = reel('900000000000000003', 'DfTEST00003', 'Just a reel with no keyword at all');
const fixture = (media) => ({ me: { user_id: '1', username: 'fixture', account_type: 'MEDIA_CREATOR', media_count: media.length }, media, views: { [A.id]: 1200, [B.id]: 3400, [C.id]: 50 } });
writeFileSync(join(T, 'f1.json'), JSON.stringify(fixture([A, B, C])));
writeFileSync(join(T, 'f2.json'), JSON.stringify(fixture([{ ...A, media_url: `${BASE}/b.mp4` }, B, C])));

const MANIFEST = join(T, 'manifest.json');
const env = (f, extra = {}) => ({ ...process.env, IG_FIXTURE: join(T, f), SYNC_MANIFEST: MANIFEST, SYNC_MEDIA_DIR: join(T, 'media'), GEMINI_API_KEY: '', IG_ACCESS_TOKEN: '', GITHUB_OUTPUT: join(T, 'out.txt'), GITHUB_STEP_SUMMARY: '', ...extra });
// Async on purpose: the fixture server lives in this process, so a blocking spawnSync would starve it.
const run = (args, f) => new Promise((done) => {
  writeFileSync(join(T, 'out.txt'), '');
  const c = spawn('node', ['scripts/ig-sync.mjs', ...args], { env: env(f) });
  let log = '';
  c.stdout.on('data', (d) => (log += d)); c.stderr.on('data', (d) => (log += d));
  c.on('close', (code) => done({ code, log, mode: readFileSync(join(T, 'out.txt'), 'utf8').match(/mode=(\w+)/)?.[1] }));
});
const fails = [];
const expect = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`); if (!ok) fails.push(name); };
const dataBefore = ['data/translations.json', 'data/niche-cache.json', 'data/instagram.json'].map((f) => existsSync(f) ? readFileSync(f, 'utf8') : '');

try {
  let r = await run(['--local'], 'f1.json');
  console.log(r.log.split('\n').filter((l) => /^\s+\+|Niches|Licensed|Translations|Wrote/.test(l)).join('\n'));
  expect('local run 1 exits 0', r.code === 0, r.code ? r.log.slice(-600) : '');
  let m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const by = Object.fromEntries(m.items.map((i) => [i.id, i]));
  expect('A (no media_url) is visible with playback "embed"', by[A.id].visible === true && by[A.id].playback === 'embed', JSON.stringify({ visible: by[A.id].visible, playback: by[A.id].playback }));
  expect('A embed URL from the permalink shortcode', by[A.id].embed_url === 'https://www.instagram.com/reel/DfFhE2Qy16n/embed/', by[A.id].embed_url);
  expect('A poster made from its cover, with LQIP', by[A.id].poster_source === 'cover' && existsSync(by[A.id].poster_url) && /^data:image\/webp/.test(by[A.id].lqip || ''));
  expect('A has no video files', !by[A.id].video_url && !by[A.id].full_url && !by[A.id].has_video);
  expect('C (no cover) gets the branded poster', by[C.id].playback === 'embed' && by[C.id].poster_source === 'branded' && existsSync(by[C.id].poster_url));
  expect('B (media_url) is playback "file" with renditions', by[B.id].playback === 'file' && by[B.id].has_video && existsSync(by[B.id].video_url));
  expect('stats count embed Reels', m.stats.total_videos === 3 && m.stats.total_views === 4650 && m.stats.embed === 2, JSON.stringify(m.stats));
  expect('new Reels without a Gemini key sorted by keywords', by[A.id].niche === 'realestate' && by[B.id].niche === 'events' && by[C.id].niche === 'comedy' && [A, B, C].every((x) => by[x.id].niche_source === 'keywords'),
    [A, B, C].map((x) => `${by[x.id].niche}/${by[x.id].niche_source}`).join(' '));

  r = await run(['--upload', '--detect'], 'f1.json');
  expect('same data again: mode none (no hourly work for embed Reels)', r.mode === 'none', `${r.mode}: ${r.log.split('\n').find((l) => /Work to do|No media work|Nothing/.test(l))}`);

  const niches = readFileSync('data/niches.json', 'utf8');
  try {
    writeFileSync('data/niches.json', niches.replace('"layout": "rows"', '"layout": "grid"'));
    r = await run(['--upload', '--detect'], 'f1.json');
    expect('layout flag changed: mode stats (rebuild, no media work)', r.mode === 'stats', `${r.mode}: ${r.log.split('\n').find((l) => /No media work|Work to do|Nothing/.test(l))}`);
  } finally { writeFileSync('data/niches.json', niches); }

  r = await run(['--upload', '--detect'], 'f2.json');
  expect('media_url appears: detect says "media now available", mode full', r.mode === 'full' && r.log.includes(`media now available ${A.id}`), r.mode);
  r = await run(['--local'], 'f2.json');
  m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const a2 = m.items.find((i) => i.id === A.id);
  expect('A is now playback "file"', r.code === 0 && a2.playback === 'file' && a2.has_video && !a2.embed_url, JSON.stringify({ playback: a2.playback, has_video: a2.has_video }));
  const dataAfter = ['data/translations.json', 'data/niche-cache.json', 'data/instagram.json'].map((f) => existsSync(f) ? readFileSync(f, 'utf8') : '');
  expect('nothing in data/ written', dataAfter.every((x, i) => x === dataBefore[i]));
} finally {
  server.close();
  rmSync(T, { recursive: true, force: true });
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nSync dry run passed.');
process.exitCode = fails.length ? 1 : 0;
