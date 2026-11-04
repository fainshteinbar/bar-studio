// Functional checks for the niche rows and the embed player, in real Google Chrome (PLAN.md 4.10).
//   node scripts/rows-check.mjs                      local build (served from the repo root)
//   node scripts/rows-check.mjs https://fainshteinbar.github.io/bar-studio/   the live site
// For each language at 390 and 1440 px: card size against the grid baseline, the peek of the next card, titles not
// cut, scroll direction (Hebrew reveals more to the left, English to the right), video.currentTime advancing only for
// cards in view and stopping when a card leaves the strip, the playing cap, arrows only on fine pointers, a focused
// card scrolled into its strip, layout shift while loading, console errors and failed requests. Then the embed player:
// no Instagram request before a tap, the iframe after it, Esc and focus return, and whether the embed's video plays
// with sound (honestly measured from inside the frame, not assumed).
// Writes shots-local/<target>/rows-report.json and rows-*.jpg (gitignored). Exit code 1 if a check fails.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serve } from './serve.mjs';

const PORT = 4175;
const LIVE = process.argv.slice(2).find((a) => /^https?:/.test(a));
const OUT = process.env.SHOTS_OUT || `shots-local/${LIVE ? 'live' : 'local'}`;
const BASE = LIVE ? LIVE.replace(/\/?$/, '/') : `http://localhost:${PORT}/`;
// Grid card poster sizes on the live site before the rows (measured 2026-11-04): 390 px -> 173 x 307, 1440 px -> 429 x 763.
const BASELINE = { mobile: 173, desktop: 429 };
const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
mkdirSync(OUT, { recursive: true });
const server = LIVE ? null : await serve(PORT, process.cwd());
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {};
const failures = [];
const check = (key, name, ok, detail = '') => { if (!ok) failures.push(`${key}: ${name}${detail ? ` (${detail})` : ''}`); return ok; };

for (const lang of ['he', 'en']) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const key = `${lang}-${vpName}`;
    const ctx = await browser.newContext({ ...vp, locale: lang === 'he' ? 'he-IL' : 'en-US' });
    await ctx.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    const page = await ctx.newPage();
    const errors = [], instagram = [];
    page.on('console', (m) => m.type() === 'error' && !/instagram|facebook|fbcdn|cdninstagram/i.test(m.location()?.url || '') && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (r) => r.status() >= 400 && !/instagram|facebook|fbcdn/i.test(r.url()) && errors.push(`${r.status()}: ${r.url()}`));
    page.on('request', (r) => /instagram\.com|cdninstagram|fbcdn/.test(r.url()) && instagram.push(r.url()));
    const r = { errors, };
    await page.goto(`${BASE}${lang === 'en' ? 'en/' : ''}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await sleep(2500);
    r.clsLoad = await page.evaluate(() => Math.round(window.__cls * 10000) / 10000);
    check(key, 'CLS while loading < 0.02', r.clsLoad < 0.02, String(r.clsLoad));

    const rows = page.locator('section.row');
    r.rows = await rows.evaluateAll((els) => els.map((s) => ({
      title: s.querySelector('h2').textContent,
      cut: s.querySelector('h2').scrollWidth > s.querySelector('h2').clientWidth + 1,
      cards: s.querySelectorAll('.row-item').length,
    })));
    check(key, 'rows present', r.rows.length >= 3, JSON.stringify(r.rows.map((x) => x.title)));
    check(key, 'no row title cut', r.rows.every((x) => !x.cut));
    check(key, 'no featured section in rows layout', !(await page.locator('section.featured').count()));

    // Sizes and scroll direction on the second row (the first is the top row, with rank numbers).
    const strip = page.locator('section.row').nth(1).locator('.row-strip');
    await strip.scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollBy(0, -80));
    await sleep(600);
    const geo = await strip.evaluate((s) => {
      const items = [...s.querySelectorAll('.row-item')].map((li) => li.querySelector('.row-media').getBoundingClientRect());
      const sr = s.getBoundingClientRect();
      const visible = (b) => Math.max(0, Math.min(b.right, sr.right) - Math.max(b.left, sr.left)) / b.width;
      return { w: items[0].width, h: items[0].height, first: { l: items[0].left, r: items[0].right }, second: items[1] && { l: items[1].left, r: items[1].right },
        peek: items.map(visible).find((v) => v < 0.98) ?? null, perScreen: items.filter((b) => visible(b) > 0.98).length, canScroll: s.scrollWidth > s.clientWidth };
    });
    r.card = { w: Math.round(geo.w), h: Math.round(geo.h), fullyVisible: geo.perScreen, peekOfNext: geo.peek == null ? null : Math.round(geo.peek * 100) / 100 };
    check(key, `card not smaller than the grid (${BASELINE[vpName]} px)`, geo.w >= BASELINE[vpName] - 0.5, `${Math.round(geo.w)} px`);
    if (geo.second) {
      if (geo.canScroll) check(key, 'next card peeks', geo.peek > 0.05 && geo.peek < 0.95, String(r.card.peekOfNext));
      check(key, lang === 'he' ? 'second card is to the left (RTL)' : 'second card is to the right (LTR)', lang === 'he' ? geo.second.r <= geo.first.l + 1 : geo.second.l >= geo.first.r - 1);
    }
    // Scroll the strip toward its end and confirm the new cards came from that side.
    const dirOk = await strip.evaluate(async (s, he) => {
      const before = s.scrollLeft;
      s.style.scrollBehavior = 'auto';
      s.scrollBy({ left: (he ? -1 : 1) * s.clientWidth, behavior: 'auto' });
      await new Promise((res) => setTimeout(res, 400));
      const after = s.scrollLeft;
      s.scrollTo({ left: 0, behavior: 'auto' });
      await new Promise((res) => setTimeout(res, 300));
      s.style.scrollBehavior = '';
      return { before, after };
    }, lang === 'he');
    r.scroll = dirOk;
    if (geo.canScroll) check(key, lang === 'he' ? 'scrolling left reveals more (scrollLeft < 0)' : 'scrolling right reveals more (scrollLeft > 0)', lang === 'he' ? dirOk.after < -10 : dirOk.after > 10, JSON.stringify(dirOk));

    // Video: only cards in view play, the cap holds, and a card scrolled out of the strip stops.
    const top = page.locator('section.row').first().locator('.row-strip');
    await top.scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollBy(0, -60));
    await sleep(2200);
    const times = async () => top.evaluate((s) => {
      const sr = s.getBoundingClientRect();
      return [...s.querySelectorAll('.row-item')].map((li) => {
        const v = li.querySelector('video'), b = li.querySelector('.row-media').getBoundingClientRect();
        const inView = Math.max(0, Math.min(b.right, sr.right, innerWidth) - Math.max(b.left, sr.left, 0)) / b.width >= 0.5 && b.top < innerHeight && b.bottom > 0;
        return { inView, t: v ? v.currentTime : null, playing: v ? !v.paused : false };
      });
    });
    const t1 = await times(); await sleep(1200); const t2 = await times();
    const advancing = t2.map((x, i) => x.t != null && x.t > t1[i].t + 0.2);
    r.video = { inView: t2.filter((x) => x.inView).length, advancing: advancing.filter(Boolean).length,
      outOfViewAdvancing: advancing.filter((a, i) => a && !t2[i].inView).length,
      playingAll: await page.evaluate(() => [...document.querySelectorAll('main video:not([data-hero])')].filter((v) => !v.paused).length) };
    check(key, 'a card in view plays (currentTime advances)', r.video.advancing > 0);
    check(key, 'no card out of view advances', r.video.outOfViewAdvancing === 0);
    check(key, 'playing cap', r.video.playingAll <= (vpName === 'mobile' ? 2 : 4), String(r.video.playingAll));
    // Push the first card out of the strip: its video must stop.
    const firstStops = await top.evaluate(async (s, he) => {
      const v = s.querySelector('.row-item video');
      if (!v) return null;
      s.style.scrollBehavior = 'auto';
      s.scrollBy({ left: (he ? -1 : 1) * s.clientWidth * 1.2 });
      await new Promise((res) => setTimeout(res, 900));
      const a = v.currentTime; await new Promise((res) => setTimeout(res, 800));
      const stopped = v.paused && v.currentTime === a;
      s.scrollTo({ left: 0 }); s.style.scrollBehavior = '';
      return stopped;
    }, lang === 'he');
    r.video.firstStopsWhenScrolledOut = firstStops;
    check(key, 'video stops when its card leaves the strip', firstStops !== false);

    // Arrows: fine pointer only.
    const arrows = await page.locator('section.row').first().locator('.row-next').evaluate((b) => getComputedStyle(b).display);
    r.arrows = arrows;
    check(key, vpName === 'desktop' ? 'arrows on desktop' : 'no arrows on touch', vpName === 'desktop' ? arrows !== 'none' : arrows === 'none');
    if (vpName === 'desktop') {
      const row = page.locator('section.row').first();
      await row.hover();
      await sleep(400);
      r.arrowNextOpacity = await row.locator('.row-next').evaluate((b) => getComputedStyle(b).opacity);
      const before = await row.locator('.row-strip').evaluate((s) => s.scrollLeft);
      await row.locator('.row-next').click();
      await sleep(900);
      const after = await row.locator('.row-strip').evaluate((s) => s.scrollLeft);
      r.arrowScroll = { before, after };
      check(key, 'next arrow scrolls toward the end', lang === 'he' ? after < before - 10 : after > before + 10, JSON.stringify(r.arrowScroll));
      await row.locator('.row-strip').evaluate((s) => s.scrollTo({ left: 0, behavior: 'auto' }));
    }
    // Keyboard: focusing a card far along the strip scrolls it into view.
    const focusOk = await page.locator('section.row').first().locator('.row-card').nth(5).evaluate(async (b) => {
      b.focus(); await new Promise((res) => setTimeout(res, 900));
      const s = b.closest('.row-strip').getBoundingClientRect(), r = b.getBoundingClientRect();
      return r.left >= s.left - 2 && r.right <= s.right + 2;
    });
    check(key, 'focused card scrolled into its strip', focusOk);
    await page.locator('section.row').first().locator('.row-strip').evaluate((s) => s.scrollTo({ left: 0, behavior: 'auto' }));

    // Viewport capture at the first row (a capture of the whole .rows element drops touch emulation, and on a slow
    // font host it can time out); a failed screenshot never fails the checks.
    await page.evaluate(() => { const r = document.querySelector('section.row'); scrollTo(0, r.getBoundingClientRect().top + scrollY - 80); });
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/rows-${key}.jpg`, type: 'jpeg', quality: 72, timeout: 60000 }).catch((e) => console.log(`   screenshot skipped: ${String(e).split('\n')[0]}`));

    // Embed player (licensed-audio Reels).
    const embedCard = page.locator('.row-card[data-embed]').first();
    if (await embedCard.count()) {
      check(key, 'no Instagram request before a tap', instagram.length === 0, instagram.slice(0, 2).join(' '));
      r.embedIframeBeforeTap = await page.locator('iframe.player-embed').count();
      await embedCard.scrollIntoViewIfNeeded();
      await embedCard.click();
      await sleep(4500);
      const dlg = await page.evaluate(() => ({ open: !!document.querySelector('dialog.player[open]'), src: document.querySelector('iframe.player-embed')?.src || '', ig: document.querySelector('.player-ig')?.href }));
      r.embed = { ...dlg, requests: instagram.length };
      check(key, 'embed iframe created on tap', dlg.open && /instagram\.com\/reel\/[\w-]+\/embed\/$/.test(dlg.src), dlg.src);
      check(key, '"Open on Instagram" link in the player', /instagram\.com\/reel\//.test(dlg.ig || ''));
      await page.screenshot({ path: `${OUT}/rows-${key}-embed.jpg`, type: 'jpeg', quality: 72, timeout: 60000 }).catch(() => {});
      // Inside the frame: is there a video, does it play on a tap, and is audio actually decoded?
      const frame = page.frames().find((f) => /instagram\.com\/reel\/.+\/embed/.test(f.url()));
      if (frame) {
        const probe = () => frame.evaluate(() => {
          const v = document.querySelector('video');
          return v ? { t: v.currentTime, paused: v.paused, muted: v.muted, volume: v.volume, audioBytes: v.webkitAudioDecodedByteCount ?? null, src: !!(v.currentSrc || v.src) } : null;
        }).catch((e) => ({ error: String(e).slice(0, 120) }));
        r.embed.beforeTap = await probe();
        const box = await page.locator('iframe.player-embed').boundingBox();
        const popups = [];
        ctx.on('page', (np) => popups.push(np.url().replace(/\?.*/, '')));
        await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
        await sleep(4000);
        r.embed.afterTap = await probe();
        await sleep(1500);
        r.embed.afterTap2 = await probe();
        r.embed.frameText = (await frame.evaluate(() => document.body.innerText.slice(0, 300)).catch(() => '')).replace(/\s+/g, ' ');
        r.embed.openedTabs = popups;
        r.embed.playsInEmbed = !!(r.embed.afterTap2 && !r.embed.afterTap2.paused && r.embed.afterTap2.t > (r.embed.afterTap?.t ?? 0));
        r.embed.audioDecoded = r.embed.afterTap2?.audioBytes ?? null;
        await page.bringToFront();
        await page.screenshot({ path: `${OUT}/rows-${key}-embed-playing.jpg`, type: 'jpeg', quality: 72, timeout: 60000 }).catch(() => {});
        // Esc right after a mouse click inside the embed (focus would otherwise be stuck in the cross-origin frame).
        await page.keyboard.press('Escape');
        await sleep(600);
        r.embed.escAfterClick = !(await page.evaluate(() => !!document.querySelector('dialog.player[open]')));
        check(key, 'Esc closes the player after a click inside the embed', r.embed.escAfterClick);
        if (!r.embed.escAfterClick) await page.locator('.player-close').click();
        await embedCard.click();
        await sleep(2500);
      } else r.embed.frame = 'not found';
      // Focus stays in the dialog (the page behind is inert); from the close button, Esc closes it and focus returns
      // to the card. (A keyboard user who tabs into the cross-origin embed is inside Instagram's page until they tab out.)
      for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
      r.embed.focusInDialog = await page.evaluate(() => !!document.activeElement?.closest('dialog.player'));
      check(key, 'focus stays in the player', r.embed.focusInDialog);
      await page.locator('.player-close').focus();
      await page.keyboard.press('Escape');
      await sleep(600);
      const closed = await page.evaluate(() => ({ open: !!document.querySelector('dialog.player[open]'), iframe: document.querySelectorAll('iframe.player-embed').length, focusEmbedCard: !!document.activeElement?.matches('.row-card[data-embed]') }));
      r.embed.closed = closed;
      check(key, 'Esc closes the player, iframe removed, focus back on the card', !closed.open && !closed.iframe && closed.focusEmbedCard, JSON.stringify(closed));
    } else r.embed = 'no embed card on this page';

    check(key, 'no console errors or failed requests', errors.length === 0, errors.slice(0, 3).join(' | '));
    report[key] = r;
    console.log(`${key.padEnd(11)} rows:${r.rows.length} card:${r.card.w}x${r.card.h} full:${r.card.fullyVisible} peek:${r.card.peekOfNext} cls:${r.clsLoad} video in-view:${r.video.inView} adv:${r.video.advancing} out-adv:${r.video.outOfViewAdvancing} playing:${r.video.playingAll} stops:${r.video.firstStopsWhenScrolledOut} arrows:${r.arrows} errors:${errors.length}`);
    if (r.embed?.afterTap !== undefined) console.log(`            embed: plays inside: ${r.embed.playsInEmbed}, audio bytes: ${r.embed.audioDecoded}, video element: ${!!r.embed.beforeTap}, tap opened: ${r.embed.openedTabs.join(' ') || 'nothing'}`);
    await ctx.close();
  }
}
writeFileSync(`${OUT}/rows-report.json`, JSON.stringify({ failures, ...report }, null, 2) + '\n');
await browser.close();
server?.close();
console.log(failures.length ? `\nFAILED ${failures.length}:\n  ${failures.join('\n  ')}` : '\nAll row checks passed.');
process.exitCode = failures.length ? 1 : 0;
