// Renders the branded Open Graph images (1200×630) for both languages with real Chrome:
//   assets/img/og-he.jpg, assets/img/og-en.jpg
// Uses the logo, the headline in Narkiss Hadash Condensed (Adobe kit) and four Reel covers.
// Run locally after a sync:  node scripts/og.mjs  (posters load from the media CDN)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { serve } from './serve.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const manifest = read(process.env.MANIFEST === 'local' && existsSync('data/instagram.local.json') ? 'data/instagram.local.json' : 'data/instagram.json');
const overrides = existsSync('data/overrides.json') ? read('data/overrides.json') : {};
const byId = Object.fromEntries(manifest.items.map((i) => [i.id, i]));
const picks = [...(overrides.rail || []).map((id) => byId[id]).filter(Boolean), ...manifest.items].filter((x, i, a) => x.poster_url && a.indexOf(x) === i).slice(0, 4);
const logo = readFileSync('assets/img/bfain-logo-dark-bg.svg', 'utf8').replace(/<metadata>[\s\S]*?<\/metadata>/, '');
const posterSrc = (p) => (/^https?:/.test(p) ? p : `/${p}`);

const page = (lang) => {
  const t = read(`i18n/${lang}.json`);
  const views = new Intl.NumberFormat(lang === 'he' ? 'he-IL' : 'en-US', { notation: 'compact', maximumFractionDigits: 0 }).format(manifest.stats.total_views || 0);
  return `<!doctype html><html lang="${lang}" dir="${t.dir}"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://use.typekit.net/gce3kmw.css">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#07071C;color:#F4F0E8}
body{position:relative;font-family:"narkiss-hadash-condensed",sans-serif}
.rail{position:absolute;inset-block:0;inset-inline-end:0;width:600px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.rail img{width:100%;height:100%;object-fit:cover;display:block}
.rail::after{content:"";position:absolute;inset:0;background:linear-gradient(to ${t.dir === 'rtl' ? 'right' : 'left'},rgba(7,7,28,0) 40%,#07071C 100%)}
.copy{position:absolute;inset-block:56px;inset-inline-start:64px;width:640px;display:flex;flex-direction:column;justify-content:space-between}
.logo svg{height:64px;width:auto;display:block}
h1{font-weight:800;font-size:104px;line-height:.92;${lang === 'en' ? 'text-transform:uppercase;' : ''}}
h1 span{display:block}.c{color:#00C2FF}
.meta{font:600 24px/1.3 system-ui,sans-serif;color:rgba(244,240,232,.75);display:flex;gap:18px;align-items:center}
.dot{width:10px;height:10px;border-radius:50%;background:#00C2FF}
</style></head><body>
<div class="rail">${picks.map((p) => `<img src="${posterSrc(p.poster_url)}" alt="">`).join('')}</div>
<div class="copy">
  <div class="logo">${logo}</div>
  <h1><span>${t.hero.title_a}</span><span class="c">${t.hero.title_b}!</span></h1>
  <p class="meta"><span class="dot"></span><span><bdi>bfain.studio</bdi> · <bdi>${manifest.stats.total_videos}</bdi> ${t.d6.reels_word} · <bdi>${views}</bdi> ${t.d6.views_word}</span></p>
</div></body></html>`;
};

mkdirSync('.og-tmp', { recursive: true });
const server = await serve(4191, process.cwd());
const browser = await chromium.launch({ channel: 'chrome' });
for (const lang of ['he', 'en']) {
  writeFileSync(`.og-tmp/${lang}.html`, page(lang));
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.goto(`http://localhost:4191/.og-tmp/${lang}.html`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `assets/img/og-${lang}.jpg`, type: 'jpeg', quality: 84 });
  await p.close();
  console.log(`assets/img/og-${lang}.jpg`);
}
await browser.close();
server.close();
rmSync('.og-tmp', { recursive: true, force: true });
