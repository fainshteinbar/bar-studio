// Desktop checks for the rows (PLAN.md 4.10) in Chrome and WebKit (Safari's engine) at common laptop windows:
// a whole row (title, poster, caption) fits the window, posters load, videos play, a mouse drag scrolls the strip
// without opening the player, and a plain click still opens it.
//   node scripts/desktop-check.mjs [url]       (WebKit: npx playwright install webkit)
import { chromium, webkit } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';

const PORT = 4183;
const LIVE = process.argv.slice(2).find((a) => /^https?:/.test(a));
const BASE = LIVE ? LIVE.replace(/\/?$/, '/') : `http://localhost:${PORT}/`;
const OUT = `${process.env.SHOTS_OUT || `shots-local/${LIVE ? 'live' : 'local'}`}/desktop`;
mkdirSync(OUT, { recursive: true });
const server = LIVE ? null : await serve(PORT, process.cwd());
const SIZES = [[1440, 790], [1280, 700], [1440, 900], [1920, 1000]];   // 13" MacBook (Safari/Chrome window), smaller, full, external
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
for (const [engine, type, opts] of [['chrome', chromium, { channel: 'chrome' }], ['webkit', webkit, {}]]) {
  const browser = await type.launch({ headless: true, ...opts });
  for (const [w, h] of SIZES) for (const lang of ['he', 'en']) {
    const key = `${engine}-${w}x${h}-${lang}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${BASE}${lang === 'en' ? 'en/' : ''}`, { waitUntil: 'load' });
    await sleep(1500);
    // The row with the most cards (one that has something to scroll).
    const idx = await page.evaluate(() => { const rs = [...document.querySelectorAll('section.row')]; return rs.reduce((m, r, i) => (r.querySelectorAll('.row-item').length > rs[m].querySelectorAll('.row-item').length ? i : m), 0); });
    const row = page.locator('section.row').nth(idx);
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
    await row.evaluate((r) => scrollTo(0, r.getBoundingClientRect().top + scrollY - document.querySelector('.nav').offsetHeight - 8));
    await sleep(3000);
    const r = await row.evaluate((row) => {
      const s = row.querySelector('.row-strip'), sr = s.getBoundingClientRect(), nav = document.querySelector('.nav').getBoundingClientRect().bottom;
      const items = [...row.querySelectorAll('.row-item')].map((li) => {
        const b = li.querySelector('.row-media').getBoundingClientRect(), img = li.querySelector('img'), v = li.querySelector('video');
        const vis = Math.max(0, Math.min(b.right, sr.right) - Math.max(b.left, sr.left)) / b.width;
        return { vis, real: !img.src.startsWith('data:') && img.complete && img.naturalWidth > 50, playing: !!v && !v.paused && v.currentTime > 0, hasVideo: !!v };
      });
      const title = row.querySelector('h2').getBoundingClientRect(), meta = row.querySelector('.row-meta').getBoundingClientRect();
      const full = items.filter((x) => x.vis > 0.98);
      return { card: Math.round(row.querySelector('.row-media').getBoundingClientRect().width) + 'x' + Math.round(row.querySelector('.row-media').getBoundingClientRect().height),
        fits: title.top >= nav - 1 && meta.bottom <= innerHeight + 1, fullCards: full.length, peek: Math.round((items.find((x) => x.vis < 0.98 && x.vis > 0)?.vis ?? 0) * 100),
        posters: `${full.filter((x) => x.real).length}/${full.length}`, playing: items.filter((x) => x.playing).length, videosInView: full.filter((x) => x.hasVideo).length };
    });
    // Mouse drag: press on a card, move, release; the strip moves and no player opens.
    const strip = row.locator('.row-strip');
    const box = await strip.boundingBox();
    const before = await strip.evaluate((s) => s.scrollLeft);
    const y = box.y + box.height * 0.35, x0 = box.x + box.width * 0.55;
    await page.mouse.move(x0, y); await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(x0 + (lang === 'he' ? 1 : -1) * k * 30, y);
    await page.mouse.up(); await sleep(900);
    const after = await strip.evaluate((s) => s.scrollLeft);
    const opened = await page.evaluate(() => !!document.querySelector('dialog.player[open]'));
    r.drag = Math.round(after - before);
    r.dragOk = Math.abs(after - before) > 100 && !opened;
    // A plain click still opens the player.
    await strip.evaluate((s) => s.scrollTo({ left: 0, behavior: 'auto' })); await sleep(400);
    await row.locator('.row-card').first().click(); await sleep(700);
    r.clickOpens = await page.evaluate(() => !!document.querySelector('dialog.player[open]'));
    await page.keyboard.press('Escape'); await sleep(300);
    await row.evaluate((r) => scrollTo(0, r.getBoundingClientRect().top + scrollY - document.querySelector('.nav').offsetHeight - 8));
    await page.mouse.move(box.x + box.width / 2, box.y + 100); await sleep(700);
    await page.screenshot({ path: `${OUT}/${key}.jpg`, type: 'jpeg', quality: 70 });
    const ok = r.fits && r.fullCards >= 2 && r.posters.split('/')[0] === r.posters.split('/')[1] && r.dragOk && r.clickOpens && !errors.length && (engine === 'webkit' || r.playing > 0);
    if (!ok) failures.push(`${key}: ${JSON.stringify(r)} ${errors.slice(0, 2).join(' | ')}`);
    console.log(`${key.padEnd(24)} card ${r.card} fits:${r.fits} full:${r.fullCards} peek:${r.peek}% posters:${r.posters} playing:${r.playing}/${r.videosInView} drag:${r.drag} ok:${r.dragOk} click:${r.clickOpens} errors:${errors.length}`);
    await ctx.close();
  }
  await browser.close();
}
server?.close();
// Headless WebKit on macOS has no H.264 decoder, so "playing" is reported but not required there.
console.log(failures.length ? `\nFAILED:\n  ${failures.join('\n  ')}` : '\nAll desktop checks passed.');
process.exitCode = failures.length ? 1 : 0;
