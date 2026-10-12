// Records the live site on a phone viewport for the launch Story: a CDP screencast (every repainted frame,
// with timestamps), resampled to an even 30 fps JPEG sequence in story/work/site/. Also writes the tap
// position and timing to story/work/site.json so the Story can draw a tap ring in sync.
//   node story/record-site.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const URL = 'https://fainshteinbar.github.io/bar-studio/';
const W = 390, H = 844, DPR = 2, FPS = 30, LENGTH = 8.4; // seconds of footage used by the Story
const OUT = 'story/work/site';

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'he-IL' });
const page = await ctx.newPage();

// Smooth scripted scroll (ease-in-out), run inside the page on rAF.
const scrollTo = (y, ms) => page.evaluate(([y, ms]) => new Promise((done) => {
  const y0 = scrollY, t0 = performance.now(), ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const step = (now) => { const k = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(k)); k < 1 ? requestAnimationFrame(step) : done(); };
  requestAnimationFrame(step);
}), [y, ms]);
const sleep = (ms) => page.waitForTimeout(ms);
const gridTarget = () => page.evaluate(() => { const g = document.querySelector('.grid'); return Math.round(g.getBoundingClientRect().top + scrollY - 70); });
const tapTarget = () => page.evaluate(() => {
  // first grid card fully on screen, tapped a little above its centre
  const a = [...document.querySelectorAll('.grid a[data-reel]')].find((x) => { const r = x.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 20; });
  const r = a.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.42), id: a.href };
});

// Warm-up pass: same path once, so posters, Reels and the player video are cached before recording.
await page.goto(URL, { waitUntil: 'load' });
await sleep(2500);
await scrollTo(await gridTarget(), 1500); await sleep(2500);
let tap = await tapTarget();
await page.touchscreen.tap(tap.x, tap.y); await sleep(4000);
await page.keyboard.press('Escape'); await sleep(500);

// Take: reload (warm cache), let the hero settle, then record.
await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => scrollTo(0, 0));
await sleep(2200);
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
const t0 = Date.now() / 1000;
const mark = () => Date.now() / 1000 - t0;
await sleep(1800);                                   // hero: rail Reels playing
const scrollStart = mark();
await scrollTo(await gridTarget(), 2600);            // through proof and featured into the grid
const scrollEnd = mark();
await sleep(900);
tap = await tapTarget();
const tapAt = mark();
await page.touchscreen.tap(tap.x, tap.y);            // opens the Reel player
await sleep((LENGTH - mark() + 0.6) * 1000);
await cdp.send('Page.stopScreencast');
await browser.close();

// Resample to constant 30 fps: each output frame is the latest screencast frame at or before its time.
frames.sort((a, b) => a.t - b.t);
const base = frames[0].t;
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
let j = 0;
for (let i = 0; i < Math.round(LENGTH * FPS); i++) {
  const t = base + i / FPS;
  while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
  writeFileSync(`${OUT}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(frames[j].data, 'base64'));
}
const offset = base - t0; // screencast clock vs our marks (seconds)
const meta = { fps: FPS, frames: Math.round(LENGTH * FPS), width: W, height: H, captured: frames.length,
  scroll: [scrollStart - offset, scrollEnd - offset], tap: { t: tapAt - offset, x: tap.x / W, y: tap.y / H } };
writeFileSync('story/work/site.json', JSON.stringify(meta, null, 2));
console.log(meta);
