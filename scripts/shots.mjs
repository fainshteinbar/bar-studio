// Screenshots + functional checks for the production pages, in real Google Chrome
// (Playwright's bundled Chromium has no H.264, so videos would never play there).
//
//   node scripts/shots.mjs                       local build (served from the repo root)
//   node scripts/shots.mjs https://fainshteinbar.github.io/bar-studio/    the live site
//
// Output: shots-local/<target>/<lang>-<viewport>-{fold,full}.jpg and report.json (gitignored)
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { serve } from './serve.mjs';

const PORT = 4174;
const LIVE = process.argv.slice(2).find((a) => /^https?:/.test(a));
const OUT = process.env.SHOTS_OUT || `shots-local/${LIVE ? 'live' : 'local'}`;
const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const site = JSON.parse(readFileSync('i18n/site.json', 'utf8'));
const prefill = { he: JSON.parse(readFileSync('i18n/he.json', 'utf8')).wa_prefill, en: JSON.parse(readFileSync('i18n/en.json', 'utf8')).wa_prefill };

const dirs = ['site'];
const BASE = LIVE ? LIVE.replace(/\/?$/, '/') : `http://localhost:${PORT}/`;

mkdirSync(OUT, { recursive: true });
const server = LIVE ? null : await serve(PORT, process.cwd());
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reportPath = `${OUT}/report.json`;
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {};

for (const d of dirs) {
  for (const lang of ['he', 'en']) {
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      const key = `${lang}-${vpName}`;
      const ctx = await browser.newContext({ ...vp, reducedMotion: 'no-preference', locale: lang === 'he' ? 'he-IL' : 'en-US' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('requestfailed', (r) => !/\.mp4/.test(r.url()) && errors.push(`failed: ${r.url()}`));
      page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()}: ${r.url()}`));

      const url = `${BASE}${lang === 'en' ? 'en/' : ''}`;
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await sleep(1800);
      await page.screenshot({ path: `${OUT}/${key}-fold.jpg`, type: 'jpeg', quality: 72 });
      // Rule 1: videos actually playing inside the first viewport, before any scroll.
      await sleep(1200);
      const firstScreen = await page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => {
        const b = v.getBoundingClientRect();
        return !v.paused && v.currentTime > 0 && b.bottom > 0 && b.top < innerHeight && b.width > 0;
      }).length);

      const r = { url, errors, firstScreen };
      Object.assign(
        r,
        await page.evaluate(({ num, prefill, vpw }) => {
          const wa = [...document.querySelectorAll('a[href^="https://wa.me/"]')].map((a) => a.href);
          const waOk = wa.length > 0 && wa.every((h) => {
            const u = new URL(h);
            return u.pathname === `/${num}` && u.searchParams.get('text') === prefill;
          });
          const float = document.querySelector('.wa-float')?.getBoundingClientRect();
          return {
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            hreflang: document.querySelectorAll('link[rel=alternate][hreflang]').length,
            overflowX: Math.max(document.documentElement.scrollWidth, innerWidth) - vpw,
            waLinks: wa.length,
            waFromConfig: waOk,
            floatSide: float && float.width ? (float.left + float.width / 2 < innerWidth / 2 ? 'left' : 'right') : 'hidden',
            h1: document.querySelector('h1')?.textContent.trim(),
            // English pages: any Hebrew in text, attributes or meta that is not inside an element marked lang="he".
            hebrewLeaks: document.documentElement.lang !== 'en' ? [] : (() => {
              const he = /[\u0590-\u05FF]/, out = [];
              const inHe = (el) => !!el?.closest?.('[lang="he"]');
              const w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
              for (let n; (n = w.nextNode()); ) {
                const p = n.parentElement;
                if (he.test(n.nodeValue) && !inHe(p) && !['SCRIPT', 'STYLE'].includes(p?.tagName)) out.push(`text: ${n.nodeValue.trim().slice(0, 40)}`);
              }
              for (const el of document.querySelectorAll('*')) {
                for (const a of ['alt', 'title', 'aria-label', 'content', 'placeholder', 'data-pitch']) {
                  const v = el.getAttribute(a);
                  if (v && he.test(v) && !inHe(el)) out.push(`${el.tagName.toLowerCase()}[${a}]: ${v.slice(0, 40)}`);
                }
              }
              return out;
            })(),
          };
        }, { num: site.whatsapp_number, prefill: prefill[lang], vpw: vp.viewport.width })
      );

      // Walk the page so scroll-driven reveals fire and lazy media loads.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += Math.round(vp.viewport.height * 0.7)) {
        await page.evaluate((y) => scrollTo(0, y), y);
        await sleep(220);
      }

      // Video check: bring the grid into view, confirm playback advances and the cap holds.
      const gridVideo = page.locator('main video.reel-video:not([data-hero])').first();
      if (await gridVideo.count()) {
        await gridVideo.scrollIntoViewIfNeeded();
        await page.evaluate(() => scrollBy(0, -innerHeight * 0.15));
        await sleep(1800);
        const t1 = await page.evaluate(() =>
          [...document.querySelectorAll('main video.reel-video:not([data-hero])')].map((v) => (!v.paused ? v.currentTime : -1))
        );
        await sleep(1000);
        const t2 = await page.evaluate(() =>
          [...document.querySelectorAll('main video.reel-video:not([data-hero])')].map((v) => (!v.paused ? v.currentTime : -1))
        );
        const playing = t2.filter((t) => t >= 0).length;
        r.videosPlaying = playing;
        r.videosAdvancing = t2.some((t, i) => t > 0 && t1[i] >= 0 && t !== t1[i]);
        r.capOk = playing <= (vp.viewport.width <= 700 ? 2 : 4);
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await sleep(900);
        const gridIds = await page.evaluate(() => {
          const g = [...document.querySelectorAll('main video.reel-video:not([data-hero])')];
          return g.filter((v) => { const b = v.getBoundingClientRect(); return b.bottom < 0 && !v.paused; }).length;
        });
        r.offscreenStillPlaying = gridIds;
      }
      const hero = page.locator('video[data-hero]').first();
      if (await hero.count()) {
        await page.evaluate(() => scrollTo(0, 0));
        await sleep(1500);
        r.heroPlaying = await page.evaluate(() => [...document.querySelectorAll('video[data-hero]')].some((v) => !v.paused && v.currentTime > 0));
      }

      await page.evaluate(() => scrollTo(0, 0));
      // Scroll-driven reveals would render as their pre-entry state in a capture taken from the top.
      await page.addStyleTag({ content: '*, *::before, *::after { animation-timeline: auto !important; animation-range: normal !important; }' });
      await sleep(600);
      await page.screenshot({ path: `${OUT}/${key}-full.jpg`, type: 'jpeg', quality: 60, fullPage: true });
      report[key] = r;
      const flag = (b) => (b ? 'ok' : 'FAIL');
      console.log(
        `${key.padEnd(16)} fold:${r.firstScreen} overflow:${r.overflowX} dir:${r.dir} wa:${flag(r.waFromConfig)} float:${r.floatSide} ` +
          `leaks:${r.hebrewLeaks?.length ?? '-'} play:${r.videosPlaying ?? '-'} adv:${flag(r.videosAdvancing)} cap:${flag(r.capOk)} off:${r.offscreenStillPlaying ?? '-'} hero:${r.heroPlaying ?? '-'} errors:${errors.length}`
      );
      if (errors.length) console.log('   ', errors.slice(0, 5).join('\n    '));
      if (r.hebrewLeaks?.length) console.log('    hebrew:', r.hebrewLeaks.slice(0, 8).join(' | '));
      await ctx.close();
    }
  }
}

writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

await browser.close();
server?.close();
