// Sticker-placement guide: the end-card frame with Instagram's unsafe bands and the link-sticker area marked.
//   node story/sticker-preview.mjs   (after story/render.mjs)  -> story/out/bfain-launch-story-sticker-guide.jpg
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const ZONE = { x: 220, y: 1350, w: 640, h: 160 };   // keep in sync with #zoneGlow in story.html (centre 540,1430)
const server = await serve(4198, process.cwd());
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('http://localhost:4198/story/story.html'); // same origin, so the local Hebrew font loads
await page.setContent(`<!doctype html><html lang="he"><head><meta charset="utf-8"><style>
@font-face { font-family: H; font-weight: 100 900; src: url(http://localhost:4198/assets/fonts/noto-sans-hebrew-var-hebrew.woff2); }
*{margin:0;box-sizing:border-box} body{width:1080px;height:1920px;position:relative;background:url(http://localhost:4198/story/work/frames/0405.jpg) 0 0/1080px 1920px;font-family:H,sans-serif;color:#fff}
.band{position:absolute;inset-inline:0;background:repeating-linear-gradient(135deg,rgb(255 70 90 / .32) 0 18px,rgb(255 70 90 / .18) 18px 36px);border-color:#ff4a5e;border-style:dashed;display:grid;place-items:center;font:600 34px/1.3 H,sans-serif;text-align:center;direction:rtl}
.zone{position:absolute;left:${ZONE.x}px;top:${ZONE.y}px;width:${ZONE.w}px;height:${ZONE.h}px;border:6px dashed #00C2FF;border-radius:28px;background:rgb(0 194 255 / .14);display:grid;place-items:center;text-align:center;direction:rtl}
.zone b{display:block;font:800 52px/1.1 H,sans-serif}.zone small{display:block;font:500 28px/1.4 H,sans-serif;opacity:.85}
</style></head><body>
<div class="band" style="top:0;height:250px;border-width:0 0 4px">אזור ממשק של אינסטגרם (250 פיקסלים עליונים)<br>בלי טקסט וויזואל חשוב</div>
<div class="band" style="bottom:0;height:340px;border-width:4px 0 0">אזור ממשק של אינסטגרם (340 פיקסלים תחתונים)<br>שורת תגובה ושיתוף</div>
<div class="zone"><div><b>מדבקת הקישור כאן</b><small>מתחת לחץ, במרכז · בערך <bdi dir="ltr">${ZONE.w}×${ZONE.h} px</bdi></small></div></div>
</body></html>`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'story/out/bfain-launch-story-sticker-guide.jpg', type: 'jpeg', quality: 92 });
await browser.close(); server.close();
console.log('story/out/bfain-launch-story-sticker-guide.jpg');
