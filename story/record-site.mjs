// Records the live site full-bleed for the launch Story (v4 plan) at a true 9:16 phone viewport (405x720 CSS px at
// 3x = 1215x2160, scaled to 1080x1920 in the Story): hero → scroll to the stats row → hold until every counter has finished → scroll to the grid →
// tap the "מונולוג" card (17901612813374816).
// CDP screencast (every repainted frame, with timestamps), resampled to an even 30 fps JPEG sequence in
// story/work/site/. Marks (seconds into the recording) and the tap position go to story/work/site.json.
//   node story/record-site.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const URL = 'https://fainshteinbar.github.io/bar-studio/';
const TAP_ID = '17901612813374816';
const W = 405, H = 720, DPR = 3, FPS = 30;
const OUT = 'story/work/site';

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', `--force-device-scale-factor=${DPR}`] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, locale: 'he-IL' });
const page = await ctx.newPage();
// The site's smooth-scroll CSS would fight the frame-by-frame scroll below.
await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.scrollBehavior = 'auto'; }));

const scrollTo = (y, ms) => page.evaluate(([y, ms]) => new Promise((done) => {
  const y0 = scrollY, t0 = performance.now(), ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const step = (now) => { const k = Math.min(1, (now - t0) / ms); scrollTo(0, y0 + (y - y0) * ease(k)); k < 1 ? requestAnimationFrame(step) : done(); };
  requestAnimationFrame(step);
}), [y, ms]);
const sleep = (ms) => page.waitForTimeout(ms);
const topOf = (sel, offset) => page.evaluate(([sel, offset]) => Math.round(document.querySelector(sel).getBoundingClientRect().top + scrollY - offset), [sel, offset]);
const card = `.grid a[href*="${TAP_ID}"], .grid a[data-full*="${TAP_ID}"]`;
const cardTarget = () => page.evaluate((sel) => { const a = document.querySelector(sel); const r = a.getBoundingClientRect(); return Math.round(r.top + scrollY - (innerHeight - r.height) / 2 + 40); }, card);
const tapPoint = () => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.42) }; }, card);

// Warm-up pass: same path once (cache posters, Reels, player video); counters only animate once per load.
await page.goto(URL, { waitUntil: 'load' });
await sleep(2000);
await scrollTo(await topOf('.proof', 150), 900); await sleep(1500);
await scrollTo(await cardTarget(), 900); await sleep(2000);

// Take.
await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => scrollTo(0, 0));
await sleep(2200);
const cdp = await ctx.newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', async (f) => { frames.push({ t: f.metadata.timestamp, data: f.data }); await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: Math.round(W * DPR), maxHeight: Math.round(H * DPR), everyNthFrame: 1 });
const t0 = Date.now() / 1000, mark = () => Date.now() / 1000 - t0;
await sleep(800);                                          // hero, rail Reels playing
const m = { proofScroll: mark() };
await scrollTo(await topOf('.proof', 150), 900);           // stats row into view (counters start at 60% visible)
m.holdStart = mark();
await sleep(1800);                                         // hold: every counter finishes (700 ms each)
m.holdEnd = mark();
await scrollTo(await cardTarget(), 900);                   // on to the grid, the card centred
const miss = (await cardTarget()) - (await page.evaluate(() => scrollY));
if (Math.abs(miss) > 4) await scrollTo(await cardTarget(), 200);   // late layout (posters, reveal animations): settle
m.gridEnd = mark();
await sleep(500);
const tap = await tapPoint();
if (tap.y < 40 || tap.y > H - 40) throw new Error(`card not on screen for the tap (y=${tap.y})`);
m.tap = mark();
await page.touchscreen.tap(tap.x, tap.y);                  // opens the player
await sleep(1500);
const end = mark();
await cdp.send('Page.stopScreencast');
await browser.close();

frames.sort((a, b) => a.t - b.t);
const base = frames[0].t, n = Math.round(end * FPS);
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
let j = 0;
for (let i = 0; i < n; i++) {
  const t = base + i / FPS;
  while (j + 1 < frames.length && frames[j + 1].t <= t) j++;
  writeFileSync(`${OUT}/${String(i).padStart(4, '0')}.jpg`, Buffer.from(frames[j].data, 'base64'));
}
const off = base - t0;
const meta = { fps: FPS, frames: n, width: W, height: H, captured: frames.length, tapId: TAP_ID,
  marks: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +(v - off).toFixed(3)])), tap: { x: tap.x / W, y: tap.y / H } };
writeFileSync('story/work/site.json', JSON.stringify(meta, null, 2));
console.log(meta);
