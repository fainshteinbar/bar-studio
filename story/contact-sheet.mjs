// Contact sheet of the rendered Story: one frame every 0.5 s with its timestamp.
//   node story/contact-sheet.mjs   (after story/render.mjs)  -> story/out/bfain-launch-story-contact-sheet.jpg
import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const n = readdirSync('story/work/frames').length, step = 15;    // 30 fps -> every 0.5 s
const picks = []; for (let i = 0; i < n; i += step) picks.push(i);
const cols = 8, w = 220, h = 391, rows = Math.ceil(picks.length / cols);
const server = await serve(4197, process.cwd());
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: cols * (w + 10) + 10, height: rows * (h + 44) + 10 } });
await page.goto('http://localhost:4197/story/story.html');
await page.setContent(`<!doctype html><style>body{margin:0;padding:5px;background:#111;display:grid;grid-template-columns:repeat(${cols},${w + 10}px);font:600 22px system-ui;color:#eee}
figure{margin:5px}img{width:${w}px;height:${h}px;display:block;border-radius:6px}figcaption{padding-top:6px;text-align:center}</style>
${picks.map((i) => `<figure><img src="http://localhost:4197/story/work/frames/${String(i).padStart(4, '0')}.jpg"><figcaption>${(i / 30).toFixed(1)} s</figcaption></figure>`).join('')}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'story/out/bfain-launch-story-contact-sheet.jpg', type: 'jpeg', quality: 88, fullPage: true });
await browser.close(); server.close();
console.log(`story/out/bfain-launch-story-contact-sheet.jpg (${picks.length} frames)`);
