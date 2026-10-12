// Captures story/story.html frame by frame (1080x1920, 30 fps) and encodes the Story.
//   node story/render.mjs --stills 1.0,6.5,13.5     review stills -> story/out/still-<t>.jpg
//   node story/render.mjs                            all frames -> story/work/frames, then story/out/*.mp4
// Needs story/work/{site,hook,site.json,logo.svg}: node story/record-site.mjs, plus the hook frames.
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { serve } from '../scripts/serve.mjs';

const FPS = 30, DURATION = 14.8, FRAMES = Math.round(FPS * DURATION);
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const stills = arg('--stills')?.split(',').map(Number);

const server = await serve(4199, process.cwd());
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto('http://localhost:4199/story/story.html', { waitUntil: 'networkidle' });
const fontOk = await page.evaluate(() => window.ready);
if (!fontOk) throw new Error('Narkiss did not load (Adobe kit)');

const shoot = async (t, path) => {
  await page.evaluate((t) => window.render(t), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path, type: 'jpeg', quality: 95 });
};

mkdirSync('story/out', { recursive: true });
if (stills) {
  for (const t of stills) { await shoot(t, `story/out/still-${t.toFixed(1)}.jpg`); console.log(`story/out/still-${t.toFixed(1)}.jpg`); }
} else {
  rmSync('story/work/frames', { recursive: true, force: true }); mkdirSync('story/work/frames', { recursive: true });
  for (let i = 0; i < FRAMES; i++) {
    await shoot(i / FPS, `story/work/frames/${String(i).padStart(4, '0')}.jpg`);
    if (i % 60 === 0) console.log(`frame ${i}/${FRAMES}`);
  }
  // H.264 High, yuv420p, faststart, no audio track.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', 'story/work/frames/%04d.jpg',
    '-vf', 'scale=out_range=tv:out_color_matrix=bt709,format=yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', 'story/out/bfain-launch-story.mp4'], { stdio: 'inherit' });
  console.log('story/out/bfain-launch-story.mp4');
}
await browser.close();
server.close();
