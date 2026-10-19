// Browser check of the magic-link sign-in, with Supabase Auth stood in by Playwright routes
// (no real project needed). Runs in Google Chrome against the local server.
//   node scripts/invoices-auth-check.mjs     -> prints a pass/fail list; screenshots in shots-local/invoices/auth-*.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const PORT = 4178;
const BASE = `http://localhost:${PORT}/invoices/`;
const SB = 'https://abcd1234.supabase.co';
const OUT = 'shots-local/invoices';
mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'fainshteinbar@gmail.com' };
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...user, sub: user.id, exp: now + 3600, iat: now, session_id: 's1' })}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1', user };

const server = await serve(PORT, process.cwd());
const browser = await chromium.launch({ channel: 'chrome' });
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(`PASS  ${name}`); } catch (err) { results.push(`FAIL  ${name}\n      ${err.message.split('\n')[0]}`); }
};

async function newPage({ configured = true, scheme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: 'he-IL' });
  const page = await ctx.newPage();
  const calls = { otp: [], token: [] };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Never the real config.js: either the fake project below, or an empty config.
  await page.route('**/invoices/config.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: configured ? `export const SUPABASE_URL = '${SB}'; export const SUPABASE_ANON_KEY = 'sb_publishable_TEST';`
      : `export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = '';` }));
  await page.route(`${SB}/auth/v1/otp**`, async (r) => {
    calls.otp.push({ url: r.request().url(), body: r.request().postDataJSON() });
    await new Promise((res) => setTimeout(res, 400));   // a slow server, to test the button lock
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route(`${SB}/auth/v1/token**`, (r) => {
    calls.token.push({ url: r.request().url(), body: r.request().postDataJSON() });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) });
  });
  await page.route(`${SB}/auth/v1/user**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }));
  await page.route(`${SB}/auth/v1/logout**`, (r) => r.fulfill({ status: 204, body: '' }));
  return { ctx, page, calls, errors };
}

await check('without config.js values the app says so instead of failing', async () => {
  const { ctx, page } = await newPage({ configured: false });
  await page.goto(BASE);
  await page.getByText('חסרים פרטי החיבור ל-Supabase').waitFor();
  await ctx.close();
});

let shared;
await check('the login screen sends one magic link, PKCE, back to this app, without creating users', async () => {
  shared = await newPage();
  const { page, calls } = shared;
  await page.goto(BASE);
  await page.getByRole('button', { name: 'שליחת לינק כניסה' }).waitFor();
  await page.screenshot({ path: `${OUT}/auth-login-light.png` });
  const btn = page.locator('#send');
  await btn.click();
  await btn.click({ force: true, timeout: 1000 }).catch(() => {});   // a second tap while waiting
  await page.getByText('שלחנו לינק כניסה למייל. פתח אותו באותו דפדפן.').waitFor();
  assert.equal(calls.otp.length, 1, 'exactly one request');
  const { url, body } = calls.otp[0];
  assert.equal(new URL(url).searchParams.get('redirect_to'), BASE);
  assert.equal(body.email, 'fainshteinbar@gmail.com');
  assert.equal(body.create_user, false);
  assert.ok(body.code_challenge && body.code_challenge_method, 'PKCE challenge sent');
  await page.screenshot({ path: `${OUT}/auth-sent-light.png` });
});

await check('coming back with ?code= signs in, then the address is clean (#/)', async () => {
  const { page, calls } = shared;
  await page.goto(`${BASE}?code=test-code-123`);
  await page.locator('.topbar').waitFor();        // signed-in shell (data calls are not mocked here; see invoices-e2e.mjs)
  assert.equal(calls.token.length, 1);
  assert.match(calls.token[0].url, /grant_type=pkce/);
  assert.equal(calls.token[0].body.auth_code, 'test-code-123');
  assert.ok(calls.token[0].body.code_verifier, 'verifier from this browser');
  assert.equal(page.url(), `${BASE}#/`);
  await page.reload();
  await page.locator('.topbar').waitFor();        // session kept, no code replayed
  assert.equal(calls.token.length, 1);
  await shared.ctx.close();
});

await check('a link opened in another browser explains what to do', async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(`${BASE}?code=from-another-browser`);
  await page.getByText('הלינק נפתח בדפדפן אחר').waitFor();
  assert.equal(calls.token.length, 0, 'no verifier here, so no exchange is attempted');
  assert.equal(page.url(), `${BASE}#/`);
  await ctx.close();
});

await check('an expired link (?error=...) shows a clear message and a clean address', async () => {
  const { ctx, page } = await newPage({ scheme: 'dark' });
  await page.goto(`${BASE}?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await page.getByText('הלינק פג תוקף').waitFor();
  assert.equal(page.url(), `${BASE}#/`);
  await page.screenshot({ path: `${OUT}/auth-expired-dark.png` });
  await ctx.close();
});

await check('the same error in the fragment (#error=...) is handled too', async () => {
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}#error=access_denied&error_code=otp_expired&error_description=expired`);
  await page.getByText('הלינק פג תוקף').waitFor();
  assert.equal(page.url(), `${BASE}#/`);
  await ctx.close();
});

await check('another address is refused before any email is sent', async () => {
  const { ctx, page, calls } = await newPage();
  await page.goto(BASE);
  await page.fill('#email', 'someone@example.com');
  await page.click('#send');
  await page.getByText('הכניסה פתוחה רק לכתובת של בעל החשבון').waitFor();
  assert.equal(calls.otp.length, 0);
  await ctx.close();
});

await check('dark theme and no horizontal scroll on a phone', async () => {
  const { ctx, page, errors } = await newPage({ scheme: 'dark' });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'שליחת לינק כניסה' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, bg: getComputedStyle(document.body).backgroundColor }));
  assert.equal(m.sw, m.w);
  assert.equal(m.bg, 'rgb(7, 7, 28)');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${OUT}/auth-login-dark.png` });
  await ctx.close();
});

console.log(results.join('\n'));
await browser.close();
server.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
