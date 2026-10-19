// Live concurrency test against the TEST project (bfain-docs-test) only. Opt-in:
//   npm run test:invoices:live
// with these environment variables set in the terminal (never in a file in the repo):
//   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_EMAIL, SUPABASE_TEST_PASSWORD
// It issues real numbered documents in the test project. Afterwards run dev/reset_test.sql there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const URL_ = process.env.SUPABASE_TEST_URL?.replace(/\/+$/, '');
const KEY = process.env.SUPABASE_TEST_ANON_KEY;
const EMAIL = process.env.SUPABASE_TEST_EMAIL;
const PASSWORD = process.env.SUPABASE_TEST_PASSWORD;
const missing = ['SUPABASE_TEST_URL', 'SUPABASE_TEST_ANON_KEY', 'SUPABASE_TEST_EMAIL', 'SUPABASE_TEST_PASSWORD']
  .filter((k) => !process.env[k]);

// Never point this at production: refuse if the URL is the one the app is configured with.
const configPath = new URL('../../../invoices/config.js', import.meta.url);
const prodUrl = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
const isProd = URL_ && prodUrl.includes(URL_);

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()); // YYYY-MM-DD
const year = today.slice(0, 4);
let token;

async function call(path, { method = 'GET', body, auth = true, prefer = 'return=representation' } = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      Prefer: prefer,
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data };
}
const rest = (path, opts) => call(`/rest/v1/${path}`, opts);
const rpc = (name, args) => call(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });
const must = (r, what) => { assert.ok(r.ok, `${what}: HTTP ${r.status} ${JSON.stringify(r.data)}`); return r.data; };

const skip = missing.length ? `set ${missing.join(', ')} to run` : isProd ? 'refusing: this URL is the production project in invoices/config.js' : false;

test('live: sign in to the test project', { skip }, async () => {
  const r = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, auth: false });
  token = must(r, 'sign in').access_token;
  assert.ok(token);
  const settings = must(await rest('settings?select=supplier_name'), 'read settings');
  assert.equal(settings.length, 1, 'run install.sql and seed/settings.sql in the test project first');
});

test('live: the anon key alone reads nothing', { skip }, async () => {
  for (const t of ['documents', 'clients', 'settings', 'audit_log']) {
    const r = await rest(`${t}?select=*`, { auth: false });
    assert.ok(!r.ok || (Array.isArray(r.data) && r.data.length === 0), `${t} must not be readable with the anon key alone`);
  }
});

test('live: 20 invoices issued at the same moment get 20 consecutive numbers', { skip }, async () => {
  const [client] = must(await rest('clients', { method: 'POST', body: { display_name: 'Concurrency test' } }), 'create client');
  const drafts = must(await rest('documents', {
    method: 'POST',
    body: Array.from({ length: 20 }, () => ({ kind: 'invoice', client_id: client.id, currency: 'ILS', issue_date: today })),
  }), 'create drafts');
  must(await rest('document_items', {
    method: 'POST',
    body: drafts.map((d, i) => ({ document_id: d.id, position: 0, description_en: `Line ${i + 1}`, qty: 1, unit_price: 100 })),
    prefer: 'return=minimal',
  }), 'create lines');

  const results = await Promise.all(drafts.map((d) => rpc('issue_document', { p_id: d.id })));
  const failures = results.filter((r) => !r.ok);
  assert.deepEqual(failures, [], 'every concurrent issue succeeds');
  const ours = results.map((r) => r.data.number).sort();
  assert.equal(new Set(ours).size, 20, 'no number is handed out twice');

  const all = must(await rest(`documents?select=number&kind=eq.invoice&status=eq.issued&number=like.INV-${year}-*`), 'list issued');
  const seqs = all.map((d) => Number(d.number.slice(-4))).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: seqs.length }, (_, i) => i + 1), `INV-${year} runs 0001..${seqs.length} with no gap`);
  const ourSeqs = ours.map((n) => Number(n.slice(-4)));
  assert.equal(Math.max(...ourSeqs) - Math.min(...ourSeqs), 19, 'our 20 numbers are consecutive');
  console.log(`issued ${ours[0]} .. ${ours[19]} concurrently`);
});

test('live: 10 receipts of 300 racing on a 1,000 invoice: exactly 3 issue, balance 100', { skip }, async () => {
  const [client] = must(await rest('clients', { method: 'POST', body: { display_name: 'Receipt race test' } }), 'create client');
  const [inv] = must(await rest('documents', { method: 'POST', body: { kind: 'invoice', client_id: client.id, currency: 'ILS', issue_date: today } }), 'create invoice');
  must(await rest('document_items', { method: 'POST', body: { document_id: inv.id, description_en: 'Race', qty: 1, unit_price: 1000 }, prefer: 'return=minimal' }), 'line');
  must(await rpc('issue_document', { p_id: inv.id }), 'issue invoice');

  const receipts = [];
  for (let i = 0; i < 10; i++) {
    receipts.push(must(await rpc('create_receipt_from_invoice', {
      p_invoice_id: inv.id, p_amount: 300, p_method: 'bank_transfer', p_payment_date: today,
    }), 'draft receipt'));
  }

  const results = await Promise.all(receipts.map((r) => rpc('issue_document', { p_id: r.id })));
  const ok = results.filter((r) => r.ok);
  const refused = results.filter((r) => !r.ok);
  assert.equal(ok.length, 3, 'only three receipts of 300 fit into 1,000');
  assert.ok(refused.every((r) => r.data?.hint === 'balance'), `refusals are balance refusals: ${JSON.stringify(refused[0]?.data)}`);

  const [bal] = must(await rest(`v_invoice_balances?id=eq.${inv.id}&select=balance,invoice_status`), 'balance');
  assert.equal(Number(bal.balance), 100);
  assert.equal(bal.invoice_status, 'partially_paid');

  const recs = must(await rest(`documents?select=number&kind=eq.receipt&status=eq.issued&number=like.REC-${year}-*`), 'list receipts');
  const seqs = recs.map((d) => Number(d.number.slice(-4))).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: seqs.length }, (_, i) => i + 1), 'refused receipts left no gap in REC numbers');
});

test('live: an issued document cannot be changed or deleted through the API', { skip }, async () => {
  const [inv] = must(await rest(`documents?select=id,number&kind=eq.invoice&status=eq.issued&limit=1`), 'pick one');
  const upd = await rest(`documents?id=eq.${inv.id}`, { method: 'PATCH', body: { notes_he: 'x' } });
  assert.ok(!upd.ok || upd.data.length === 0, 'update touches nothing');
  const del = await rest(`documents?id=eq.${inv.id}`, { method: 'DELETE' });
  assert.ok(!del.ok || del.data.length === 0, 'delete touches nothing');
  const [still] = must(await rest(`documents?id=eq.${inv.id}&select=number,notes_he`), 'reread');
  assert.deepEqual(still, { number: inv.number, notes_he: null });
});
