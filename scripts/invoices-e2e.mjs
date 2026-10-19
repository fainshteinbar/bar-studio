// End-to-end test of the documents app in Google Chrome, against the local Supabase stand-in
// (scripts/invoices-dev-server.mjs: same install.sql on pglite). Nothing here reaches production.
//   node scripts/invoices-e2e.mjs            -> pass/fail list; screenshots in shots-local/invoices/app-*.png
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { startDevServer } from './invoices-dev-server.mjs';

const PORT = 4182;
const OUT = 'shots-local/invoices';
mkdirSync(OUT, { recursive: true });
const dev = await startDevServer({ port: PORT, quiet: true });
const APP = `${dev.base}/invoices/`;
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const ids = {};
let page;
const errors = [];
const rpcCalls = [];

async function step(name, fn) {
  try { await fn(); results.push(`PASS  ${name}`); }
  catch (err) {
    results.push(`FAIL  ${name}\n      ${String(err.message).split('\n')[0]}`);
    await page?.screenshot({ path: `${OUT}/app-fail-${results.length}.png` }).catch(() => {});
  }
}
const toast = (text) => page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 8000 });
const dialog = () => page.locator('dialog[open]');
const idFromUrl = () => page.url().match(/#\/doc\/([0-9a-f-]{36})/)[1];

async function signIn(p) {
  await p.goto(APP);
  await p.getByRole('button', { name: 'שליחת לינק כניסה' }).click();
  await p.getByText('שלחנו לינק כניסה למייל').waitFor();
  const { link } = await (await p.request.get(`${dev.base}/__dev/last-link`)).json();
  await p.goto(link);
  await p.getByRole('heading', { name: 'שלום בר' }).waitFor();
}

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL', acceptDownloads: true });
page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('request', (r) => { if (r.url().includes('/rest/v1/rpc/issue_document')) rpcCalls.push(r.url()); });

await step('sign in with the magic link, land on the dashboard with a clean address', async () => {
  await signIn(page);
  assert.equal(page.url(), `${APP}#/`);
});

await step('settings: the address is typed here and saved', async () => {
  await page.goto(`${APP}#/settings`);
  await page.fill('#s-supplier_address', '88 Sample Lane, Bangkok 10110, Thailand');
  await page.getByRole('button', { name: 'שמירה' }).click();
  await toast('ההגדרות נשמרו');
});

await step('client with a display name only', async () => {
  await page.goto(`${APP}#/clients/new`);
  await page.fill('#c-display_name', 'לקוח בדיקה');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await page.waitForURL(/#\/clients\/[0-9a-f-]{36}$/);
  ids.client = page.url().split('/').pop();
});

await step('project: ₪3,600, 50/50', async () => {
  await page.goto(`${APP}#/projects/new?client=${ids.client}`);
  await page.fill('#p-desc', 'הפקת סרטון בדיקה: תסריט, סטוריבורד, יצירת וידאו וקריינות');
  await page.fill('#p-total', '3600');
  await page.fill('#p-terms', '50/50');
  await page.getByRole('button', { name: 'הוספה' }).click();
  await page.waitForURL(/#\/projects\/[0-9a-f-]{36}$/);
  ids.project = page.url().split('/').pop();
});

await step('invoice draft from the project: the first line comes from the project', async () => {
  await page.getByRole('link', { name: 'חשבון מהפרויקט' }).click();
  await page.getByRole('button', { name: 'יצירת טיוטה' }).click();
  await page.waitForURL(/#\/doc\//);
  ids.invoice = idFromUrl();
  assert.match(await page.inputValue('#d-he-0'), /סרטון בדיקה/);
  assert.equal(await page.inputValue('#d-p-0'), '3600.00');
  await page.fill('#d-en-0', 'Test film production: script, storyboard, video generation and narration');
  await page.fill('#f-due', '2026-11-02');
  await page.getByRole('button', { name: 'שמירה', exact: true }).click();
  await toast('הטיוטה נשמרה');
  const frame = page.frameLocator('.doc-preview iframe');
  await frame.getByText('Test film production').waitFor();
  await frame.getByText('DRAFT', { exact: true }).waitFor();
});

await step('issue: the confirm button locks, a double click sends one request, the number is 0001', async () => {
  rpcCalls.length = 0;
  await page.locator('#issue').click();
  await dialog().getByText('INV-2026-0001').waitFor();
  const confirm = dialog().getByRole('button', { name: 'הנפקה' });
  await confirm.click();
  await confirm.click({ force: true, timeout: 500 }).catch(() => {});
  await page.getByRole('heading', { name: 'INV-2026-0001' }).waitFor();
  assert.equal(rpcCalls.length, 1, `issue_document called ${rpcCalls.length} times`);
  await page.screenshot({ path: `${OUT}/app-invoice-issued-desktop.png` });
});

await step('receipt in one click: 1,800 suggested from 50/50, paid 05.10, labelled "מקדמה 1 מתוך 2"', async () => {
  await page.getByRole('button', { name: 'קבלה על תשלום' }).click();
  assert.equal(await dialog().locator('#r-amount').inputValue(), '1800.00');
  await dialog().locator('#r-date').fill('2026-10-05');
  await dialog().getByRole('button', { name: 'יצירת טיוטת קבלה' }).click();
  await page.waitForURL((u) => !u.href.includes(ids.invoice));
  ids.receipt = idFromUrl();
  assert.equal(await page.inputValue('#f-lhe'), 'מקדמה 1 מתוך 2');
  assert.equal(await page.inputValue('#f-len'), 'Advance payment 1 of 2');
  await page.screenshot({ path: `${OUT}/app-receipt-draft-desktop.png` });
  await page.locator('#issue').click();
  await dialog().getByText('REC-2026-0001').waitFor();
  await dialog().getByRole('button', { name: 'הנפקה' }).click();
  await page.getByRole('heading', { name: 'REC-2026-0001' }).waitFor();
  const frame = page.frameLocator('.doc-preview iframe');
  await frame.getByText('Advance payment 1 of 2').waitFor();
});

await step('the invoice now shows partially paid with ₪1,800 open', async () => {
  await page.goto(`${APP}#/doc/${ids.invoice}`);
  await page.locator('.page-sub .chip', { hasText: 'שולם חלקית' }).waitFor();
  assert.match(await page.locator('.facts .is-strong dd').innerText(), /1,800\.00/);
});

await step('duplicate makes an editable draft; deleting it leaves numbering untouched', async () => {
  await page.getByRole('button', { name: 'שכפול כטיוטה חדשה' }).click();
  await page.waitForURL((u) => !u.href.includes(ids.invoice));
  await page.getByRole('heading', { name: 'טיוטה' }).waitFor();
  await page.getByRole('button', { name: 'מחיקת הטיוטה' }).click();
  await dialog().getByRole('button', { name: 'מחיקה' }).click();
  await page.waitForURL(/#\/docs$/);
});

await step('credit note from the invoice: 500 credited, balance 1,300', async () => {
  await page.goto(`${APP}#/doc/${ids.invoice}`);
  await page.getByRole('button', { name: 'הודעת זיכוי' }).click();
  await page.waitForURL((u) => !u.href.includes(ids.invoice));
  await page.fill('#d-p-0', '500');
  await page.locator('#issue').click();
  await dialog().getByText('CRN-2026-0001').waitFor();
  await dialog().getByRole('button', { name: 'הנפקה' }).click();
  await page.getByRole('heading', { name: 'CRN-2026-0001' }).waitFor();
  await page.goto(`${APP}#/doc/${ids.invoice}`);
  await page.locator('.facts .is-strong dd', { hasText: '1,300.00' }).waitFor();
});

await step('an issue date before the last invoice is blocked, with a one-click fix', async () => {
  await page.goto(`${APP}#/new?client=${ids.client}`);
  await page.getByRole('button', { name: 'יצירת טיוטה' }).click();
  await page.waitForURL(/#\/doc\//);
  await page.fill('#d-he-0', 'שורה');
  await page.fill('#d-p-0', '100');
  await page.fill('#f-issue', '2026-01-05');
  await page.locator('#issue').click();
  await dialog().getByText('מוקדם מ-').waitFor();
  await dialog().getByRole('button', { name: /להנפיק בתאריך/ }).click();
  await dialog().getByText('INV-2026-0002').waitFor();     // the dialog comes back with the fixed date
  await dialog().getByRole('button', { name: 'ביטול' }).click();
  await page.getByRole('button', { name: 'מחיקת הטיוטה' }).click();
  await dialog().getByRole('button', { name: 'מחיקה' }).click();
  await page.waitForURL(/#\/docs$/);
});

await step('quote: issue, convert to an invoice draft with the same lines', async () => {
  await page.goto(`${APP}#/new?client=${ids.client}&kind=quote`);
  await page.getByRole('button', { name: 'יצירת טיוטה' }).click();
  await page.waitForURL(/#\/doc\//);
  await page.fill('#d-he-0', 'סרטון השקה');
  await page.fill('#d-en-0', 'Launch film');
  await page.fill('#d-p-0', '3500');
  await page.locator('#issue').click();
  await dialog().getByRole('button', { name: 'הנפקה' }).click();
  await page.getByRole('heading', { name: 'QUO-2026-0001' }).waitFor();
  await page.getByRole('button', { name: 'המרה לחשבון' }).click();
  await page.getByRole('heading', { name: 'טיוטה' }).waitFor();
  assert.equal(await page.inputValue('#d-he-0'), 'סרטון השקה');
  assert.equal(await page.inputValue('#d-p-0'), '3500.00');
});

await step('unsaved changes ask before leaving', async () => {
  await page.fill('#d-he-0', 'סרטון השקה, גרסה 2');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'לקוחות' }).first().click();
  await page.waitForTimeout(300);
  assert.match(page.url(), /#\/doc\//, 'stayed on the draft');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('link', { name: 'לקוחות' }).first().click();
  await page.waitForURL(/#\/clients$/);
});

await step('documents list filters by kind and drafts', async () => {
  await page.goto(`${APP}#/docs/receipt`);
  await page.locator('.rows .row', { hasText: 'REC-2026-0001' }).waitFor();
  assert.equal(await page.locator('.rows .row').count(), 1);
  await page.goto(`${APP}#/docs/draft`);
  assert.equal(await page.locator('.rows .row').count(), 1, 'one draft: the converted quote');
});

await step('dashboard: received this month, open balance, backup banner, backup clears it', async () => {
  await page.goto(`${APP}#/`);
  await page.locator('.kpi', { hasText: 'פתוח לגבייה' }).getByText('₪1,300.00').waitFor();
  await page.locator('.banner').waitFor();
  await page.screenshot({ path: `${OUT}/app-dashboard-desktop.png` });
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'גיבוי עכשיו' }).click();
  const file = await dl;
  const backup = JSON.parse(readFileSync(await file.path(), 'utf8'));
  assert.equal(backup.format, 'bfain-docs-backup');
  assert.equal(backup.tables.documents.filter((x) => x.status === 'issued').length, 4);
  assert.ok(backup.tables.audit_log.length > 10);
  await toast('הגיבוי ירד');
  await page.goto(`${APP}#/`);
  assert.equal(await page.locator('.banner').count(), 0, 'banner gone after backup');
});

await step('annual CSV: Hebrew headers, BOM, one row per issued document', async () => {
  await page.goto(`${APP}#/export`);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'הורדת CSV' }).click();
  const csv = readFileSync(await (await dl).path(), 'utf8');
  assert.ok(csv.startsWith('﻿מספר,סוג,תאריך,לקוח,סכום,מטבע,סטטוס'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 5);
  assert.ok(lines.some((l) => l.startsWith('REC-2026-0001,קבלה,') && l.includes('05/10/2026') && l.includes('INV-2026-0001')));
  assert.ok(lines.some((l) => l.startsWith('INV-2026-0001,חשבון לתשלום,') && l.includes(',3600.00,ILS,שולם חלקית')));
});

await step('print by id: the issued invoice prints its frozen snapshot', async () => {
  const p2 = await ctx.newPage();
  await p2.goto(`${APP}print.html?id=${ids.invoice}`);
  await p2.waitForSelector('html[data-ready="1"]');
  await p2.getByText('INV-2026-0001').first().waitFor();
  await p2.getByText('88 Sample Lane, Bangkok 10110, Thailand').waitFor();
  await p2.getByText('No Israeli VAT charged').waitFor();
  assert.equal(await p2.title(), 'INV-2026-0001 · bfain.studio');
  await p2.close();
});

await step('no errors in the console', async () => {
  const real = errors.filter((x) => !/favicon|typekit/i.test(x));
  assert.deepEqual(real, [], real.join(' | '));
});

// ---- Screenshots: phone and desktop, light and dark ----
const shots = [
  ['dashboard', '#/'], ['docs', '#/docs'], ['invoice', `#/doc/${ids.invoice}`], ['receipt', `#/doc/${ids.receipt}`],
  ['new', '#/new'], ['settings', '#/settings'],
];
for (const [vpName, vp] of [['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop', { viewport: { width: 1440, height: 900 } }]]) {
  for (const scheme of ['light', 'dark']) {
    await step(`screens on ${vpName}, ${scheme}: no sideways scroll`, async () => {
      const c = await browser.newContext({ ...vp, colorScheme: scheme, locale: 'he-IL' });
      const p = await c.newPage();
      p.on('pageerror', (e) => errors.push(String(e)));
      await signIn(p);
      for (const [name, hash] of shots) {
        await p.goto(`${APP}${hash}`);
        await p.waitForLoadState('networkidle');
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(400);
        const sw = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(sw <= 0, `${name} scrolls sideways by ${sw}px`);
        await p.screenshot({ path: `${OUT}/app-${name}-${vpName}-${scheme}.png`, fullPage: vpName === 'mobile' });
      }
      await c.close();
    });
  }
}

console.log(results.join('\n'));
await browser.close();
await dev.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
