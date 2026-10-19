// Captures the sample documents as A4 screenshots and as real print-to-PDF files, in Google Chrome.
//   node scripts/invoice-shots.mjs            -> shots-local/invoices/{kind}.png, {kind}.pdf, {kind}-gray.png, compare.png
// Also screenshots the homepage and lays the documents next to it (compare.png) for a family check.
// Output is gitignored (shots-local/).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { serve } from './serve.mjs';

const PORT = 4176;
const OUT = 'shots-local/invoices';
const KINDS = (process.argv[2] || 'invoice,receipt,quote,credit_note').split(',');
const DRAFT = process.argv.includes('--draft');
mkdirSync(OUT, { recursive: true });

const server = await serve(PORT, process.cwd());
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = {};

// A4 at 96 dpi is 794 x 1123 CSS px; captured at 2x for detail.
const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2, locale: 'he-IL' });
for (const kind of KINDS) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/invoices/print.html?demo=${kind}${DRAFT ? '&draft=1' : ''}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('html[data-ready="1"]', { timeout: 20000 });
  const name = `${kind}${DRAFT ? '-draft' : ''}`;
  const sheet = page.locator('.doc');
  await sheet.screenshot({ path: `${OUT}/${name}.png` });
  const box = await sheet.boundingBox();
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`));
  const overflow = await page.evaluate(() => {
    const d = document.querySelector('.doc');
    return d.scrollHeight > d.clientHeight + 1 || d.scrollWidth > d.clientWidth + 1;
  });
  await page.emulateMedia({ media: 'print' });
  // displayHeaderFooter: true turns on Chrome's own header and footer (date, title, URL, page x/y), the
  // same as the "Headers and footers" box in the print dialog. They must not appear (see @page in document.css).
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true });
  writeFileSync(`${OUT}/${name}.pdf`, pdf);
  // What a black-and-white printer gets: the real PDF rasterised in grayscale (poppler).
  const gray = spawnSync('pdftoppm', ['-gray', '-r', '150', '-singlefile', '-png', `${OUT}/${name}.pdf`, `${OUT}/${name}-gray`]);
  if (gray.status !== 0) console.warn(`pdftoppm missing or failed: no ${name}-gray.png`);
  const text = pdf.toString('latin1');
  const pdfText = spawnSync('pdftotext', ['-layout', `${OUT}/${name}.pdf`, '-']).stdout?.toString() || '';
  const chromeChrome = [/localhost/, /print\.html/, /\d{1,2}\/\d{1,2}\/\d{2},/, /\b1\/1\b/, /· bfain\.studio/]
    .filter((re) => re.test(pdfText)).map(String);
  report[name] = {
    css_px: box && [Math.round(box.width), Math.round(box.height)],
    overflow,
    pdf_pages: (text.match(/\/Type\s*\/Page[^s]/g) || []).length,
    pdf_fonts: (text.match(/\/FontFile2?3?/g) || []).length,
    pdf_images: (text.match(/\/Subtype\s*\/Image/g) || []).length,
    browser_header_footer: chromeChrome,
    fonts_loaded: [...new Set(fonts)],
    errors,
  };
  await page.close();
}

if (!DRAFT) {
  // Homepage, first screen and the process section, for the side-by-side.
  const home = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'he-IL' });
  const hp = await home.newPage();
  await hp.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await hp.waitForTimeout(3500);
  await hp.screenshot({ path: `${OUT}/home-hero.png` });
  await hp.evaluate(() => window.scrollTo(0, document.querySelector('.process').offsetTop - 60));
  await hp.waitForTimeout(1500);
  await hp.screenshot({ path: `${OUT}/home-process.png` });
  await home.close();

  const img = (f) => `data:image/png;base64,${readFileSync(`${OUT}/${f}`).toString('base64')}`;
  const docs = ['invoice', 'receipt', 'quote'].filter((k) => KINDS.includes(k));
  const CAP = { invoice: 'חשבון לתשלום · Invoice', receipt: 'קבלה · Payment receipt', quote: 'הצעת מחיר · Quote' };
  const sheet = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><style>
    body{margin:0;background:#E7E4DD;font:600 22px/1.2 system-ui;color:#07071C;padding:48px}
    .row{display:flex;gap:40px;align-items:flex-start;justify-content:center}
    figure{margin:0;display:flex;flex-direction:column;gap:14px}
    figcaption{font-size:20px;letter-spacing:.02em}
    .home img{width:1240px;display:block;border-radius:8px;box-shadow:0 20px 50px -20px rgb(7 7 28/.4)}
    .home{gap:18px}
    .doc img{width:794px;display:block;box-shadow:0 1px 2px rgb(7 7 28/.08),0 24px 60px -24px rgb(7 7 28/.3)}
    .row+.row{margin-top:48px}
  </style><body>
  <div class="row">
    <figure class="home"><figcaption>דף הבית · bfain.studio</figcaption><img src="${img('home-hero.png')}"><img src="${img('home-process.png')}"></figure>
  </div>
  <div class="row">${docs.map((k) => `<figure class="doc"><figcaption>${CAP[k]}</figcaption><img src="${img(`${k}.png`)}"></figure>`).join('')}</div>
  <div class="row">${docs.map((k) => `<figure class="doc"><figcaption>${CAP[k]} · הדפסה בשחור-לבן</figcaption><img src="${img(`${k}-gray.png`)}"></figure>`).join('')}</div>
  </body></html>`;
  writeFileSync(`${OUT}/compare.html`, sheet);
  const cmp = await browser.newContext({ viewport: { width: 2560, height: 1000 }, deviceScaleFactor: 1 });
  const cp = await cmp.newPage();
  await cp.goto(`http://localhost:${PORT}/${OUT}/compare.html`);
  await cp.waitForTimeout(500);
  await cp.screenshot({ path: `${OUT}/compare.png`, fullPage: true });
  await cmp.close();
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
