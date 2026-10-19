// Balance and status: derived from issued receipts and credit notes, never stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers/db.mjs';

async function invoice3000(db, { issue_date = '2026-10-15', terms = '50/50', currency = 'ILS' } = {}) {
  const c = await db.client();
  const p = await db.project(c, { total: 3000, terms, currency });
  const inv = await db.issued({ client: c, project: p, currency, issue_date, lines: [[1, 3000]] });
  return { c, p, inv };
}

test('3,000 then 1,500 then 1,500: open, partially paid, paid', async () => {
  const db = await freshDb();
  const { inv } = await invoice3000(db);
  let b = await db.balance(inv.id);
  assert.deepEqual([b.invoice_status, b.balance, b.paid], ['open', 3000, 0]);

  await db.issue((await db.receipt(inv.id, { amount: 1500, issue_date: '2026-10-15' })).id);
  b = await db.balance(inv.id);
  assert.deepEqual([b.invoice_status, b.balance, b.paid], ['partially_paid', 1500, 1500]);

  await db.issue((await db.receipt(inv.id, { amount: 1500, issue_date: '2026-10-22' })).id);
  b = await db.balance(inv.id);
  assert.deepEqual([b.invoice_status, b.balance, b.paid], ['paid', 0, 3000]);
  await db.close();
});

test('a receipt above the open balance is refused, at creation and at issue', async () => {
  const db = await freshDb();
  const { inv } = await invoice3000(db);
  await db.issue((await db.receipt(inv.id, { amount: 1500, issue_date: '2026-10-15' })).id);
  await rejects(db.receipt(inv.id, { amount: 1500.01 }), { hint: 'balance' });

  // A draft written directly (not through the one-click action) is still checked when issued.
  const direct = await db.draft({ kind: 'receipt', client: inv.client_id, parent: inv.id, issue_date: '2026-10-16',
    amount: 1501, method: 'cash', payment_date: '2026-10-16' });
  await rejects(db.issue(direct), { hint: 'balance', message: /1501\.00.*1500/ });
  await db.close();
});

test('two drafts of 600 against 1,000: the second is refused at issue', async () => {
  const db = await freshDb();
  const c = await db.client();
  const inv = await db.issued({ client: c, issue_date: '2026-10-15', lines: [[1, 1000]] });
  const a = await db.receipt(inv.id, { amount: 600, issue_date: '2026-10-15' });
  const b = await db.receipt(inv.id, { amount: 600, issue_date: '2026-10-15' });
  await db.issue(a.id);
  await rejects(db.issue(b.id), { hint: 'balance' });
  const bal = await db.balance(inv.id);
  assert.deepEqual([bal.invoice_status, bal.balance], ['partially_paid', 400]);
  await db.close();
});

test('receipts need an issued invoice in the same currency and for the same client', async () => {
  const db = await freshDb();
  const c = await db.client();
  const draftInv = await db.draft({ client: c, issue_date: '2026-10-15' });
  await rejects(db.receipt(draftInv, { amount: 100 }), { hint: 'validation', message: /Issue invoice first/ });
  const direct = await db.draft({ kind: 'receipt', client: c, parent: draftInv, amount: 100, method: 'cash', payment_date: '2026-10-15' });
  await rejects(db.issue(direct), { hint: 'validation', message: /Issue invoice first/ });

  const usd = await db.issued({ client: c, currency: 'USD', issue_date: '2026-10-15' });
  const wrongCur = await db.draft({ kind: 'receipt', client: c, parent: usd.id, currency: 'ILS', amount: 100, method: 'cash', payment_date: '2026-10-15', issue_date: '2026-10-15' });
  await rejects(db.issue(wrongCur), { hint: 'validation', message: /Currency/ });

  const other = await db.client('Other');
  const wrongClient = await db.draft({ kind: 'receipt', client: other, parent: usd.id, currency: 'USD', amount: 100, method: 'cash', payment_date: '2026-10-15', issue_date: '2026-10-15' });
  await rejects(db.issue(wrongClient), { hint: 'validation', message: /client/ });

  // One click gets currency and client right by itself.
  const r = await db.receipt(usd.id, { amount: 100, issue_date: '2026-10-15' });
  assert.equal(r.currency, 'USD');
  assert.equal((await db.issue(r.id)).number, 'REC-2026-0001');

  // A receipt or credit note must point at an invoice, not at a quote or nothing.
  const q = await db.issued({ kind: 'quote', client: c, issue_date: '2026-10-15' });
  await rejects(db.draft({ kind: 'credit_note', client: c, parent: q.id }));
  await rejects(db.draft({ kind: 'receipt', client: c, amount: 1 }));
  await db.close();
});

test('a receipt or credit note may not be dated before its invoice; the payment itself may', async () => {
  const db = await freshDb();
  const { inv } = await invoice3000(db, { issue_date: '2026-10-15' });

  const early = await db.receipt(inv.id, { amount: 1500, issue_date: '2026-10-14', payment_date: '2026-10-05' });
  await rejects(db.issue(early.id), { hint: 'date_order', message: /before invoice INV-2026-0001/ });

  // Advance paid on 05.10, receipt issued on the invoice date: accepted.
  await db.rows('update public.documents set issue_date = $2 where id = $1', [early.id, '2026-10-15']);
  const ok = await db.issue(early.id);
  assert.equal(ok.number, 'REC-2026-0001');
  const dates = await db.one(`select to_char(issue_date, 'DD.MM.YYYY') i, to_char(payment_date, 'DD.MM.YYYY') p from public.documents where id = $1`, [ok.id]);
  assert.deepEqual(dates, { i: '15.10.2026', p: '05.10.2026' });

  const cn = await db.draft({ kind: 'credit_note', client: inv.client_id, parent: inv.id, issue_date: '2026-10-14', lines: [[1, 100]] });
  await rejects(db.issue(cn), { hint: 'date_order', message: /before invoice/ });
  await db.close();
});

test('credit notes: full credit cancels; partial credit plus payment settles; never more than the invoice', async () => {
  const db = await freshDb();
  const { c, inv } = await invoice3000(db);
  const full = await db.issued({ kind: 'credit_note', client: c, parent: inv.id, issue_date: '2026-10-16', lines: [[1, 3000]] });
  assert.equal(full.number, 'CRN-2026-0001');
  let b = await db.balance(inv.id);
  assert.deepEqual([b.invoice_status, b.balance], ['cancelled', 0]);
  await rejects(db.receipt(inv.id, { amount: 1 }), { hint: 'balance' });
  const more = await db.draft({ kind: 'credit_note', client: c, parent: inv.id, issue_date: '2026-10-16', lines: [[1, 1]] });
  await rejects(db.issue(more), { hint: 'balance' });

  const inv2 = await db.issued({ client: c, issue_date: '2026-10-16', lines: [[1, 1000]] });
  await db.issue((await db.receipt(inv2.id, { amount: 300, issue_date: '2026-10-16' })).id);
  await db.issued({ kind: 'credit_note', client: c, parent: inv2.id, issue_date: '2026-10-16', lines: [[1, 700]] });
  b = await db.balance(inv2.id);
  assert.deepEqual([b.invoice_status, b.balance, b.paid, b.credited], ['paid', 0, 300, 700]);
  await db.close();
});

test('payment labels are bilingual and follow the payment terms', async () => {
  const db = await freshDb();
  const { inv } = await invoice3000(db, { terms: '50/50' });
  const r1 = await db.receipt(inv.id, { amount: 1500, issue_date: '2026-10-15' });
  assert.deepEqual([r1.label_he, r1.label_en], ['מקדמה 1 מתוך 2', 'Advance payment 1 of 2']);
  await db.issue(r1.id);
  const r2 = await db.receipt(inv.id, { amount: 1500 });
  assert.deepEqual([r2.label_he, r2.label_en], ['תשלום 2 מתוך 2', 'Payment 2 of 2']);

  const three = await invoice3000(db, { terms: '30/30/40', issue_date: '2026-10-16' });
  const t1 = await db.receipt(three.inv.id, { amount: 600 });
  assert.deepEqual([t1.label_he, t1.label_en], ['מקדמה 1 מתוך 3', 'Advance payment 1 of 3']);

  const none = await invoice3000(db, { terms: null, issue_date: '2026-10-16' });
  const fullR = await db.receipt(none.inv.id, { amount: 3000 });
  assert.deepEqual([fullR.label_he, fullR.label_en], ['תשלום מלא', 'Full payment']);
  const part = await db.receipt(none.inv.id, { amount: 500 });
  assert.deepEqual([part.label_he, part.label_en], ['תשלום חלקי', 'Partial payment']);

  const own = await db.receipt(none.inv.id, { amount: 500, he: 'תשלום ראשון', en: 'First payment' });
  assert.deepEqual([own.label_he, own.label_en], ['תשלום ראשון', 'First payment']);
  await db.close();
});

test('quotes: issued, converted to an invoice, accepted', async () => {
  const db = await freshDb();
  const c = await db.client();
  const draftQuote = await db.draft({ kind: 'quote', client: c, issue_date: '2026-10-10', lines: [[1, 1800], [2, 250]] });
  await rejects(db.rows('select public.convert_quote_to_invoice($1)', [draftQuote]), { hint: 'validation' });
  const q = await db.issue(draftQuote);
  assert.equal(q.number, 'QUO-2026-0001');
  assert.equal(Number(q.amount), 2300);

  // Far-future validity keeps the test independent of today's date.
  const far = await db.issued({ kind: 'quote', client: c, issue_date: '2026-10-11', lines: [[1, 100]] });
  const status = async (id) => (await db.one('select quote_status from public.v_quote_status where id = $1', [id])).quote_status;
  const valid = await db.one(`select (valid_until >= (now() at time zone 'Asia/Bangkok')::date) as still from public.documents where id = $1`, [far.id]);
  assert.equal(await status(far.id), valid.still ? 'open' : 'expired');

  const inv = await db.one('select * from public.convert_quote_to_invoice($1)', [q.id]);
  assert.deepEqual([inv.kind, inv.status, inv.source_id, inv.client_id], ['invoice', 'draft', q.id, c]);
  const lines = await db.rows('select qty, unit_price from public.document_items where document_id = $1 order by position', [inv.id]);
  assert.deepEqual(lines.map((l) => [Number(l.qty), Number(l.unit_price)]), [[1, 1800], [2, 250]]);
  assert.notEqual(await status(q.id), 'accepted', 'a draft invoice does not accept the quote yet');

  await db.rows('update public.documents set issue_date = $2 where id = $1', [inv.id, '2026-10-13']);
  const issued = await db.issue(inv.id);
  assert.equal(issued.snapshot.source.number, 'QUO-2026-0001');
  assert.equal(await status(q.id), 'accepted');
  const row = await db.one('select invoice_number from public.v_quote_status where id = $1', [q.id]);
  assert.equal(row.invoice_number, 'INV-2026-0001');
  await db.close();
});

test('dashboard views: open balance per client, received per month and year by payment date', async () => {
  const db = await freshDb();
  const { c, inv } = await invoice3000(db);
  await db.issue((await db.receipt(inv.id, { amount: 1500, issue_date: '2026-10-15', payment_date: '2026-09-28' })).id);
  const usd = await db.issued({ client: c, currency: 'USD', issue_date: '2026-10-16', lines: [[1, 500]] });
  await db.issue((await db.receipt(usd.id, { amount: 500, issue_date: '2026-10-16', payment_date: '2026-10-16' })).id);

  const open = await db.rows('select currency, open_balance, open_invoices from public.v_client_open_balance where client_id = $1', [c]);
  assert.deepEqual(open.map((r) => [r.currency, Number(r.open_balance), Number(r.open_invoices)]), [['ILS', 1500, 1]]);

  const months = await db.rows(`select to_char(month, 'YYYY-MM') m, currency, received from public.v_received_monthly order by 1, 2`);
  assert.deepEqual(months.map((r) => [r.m, r.currency, Number(r.received)]), [['2026-09', 'ILS', 1500], ['2026-10', 'USD', 500]]);
  const years = await db.rows('select year, currency, received from public.v_received_yearly order by 2');
  assert.deepEqual(years.map((r) => [r.year, r.currency, Number(r.received)]), [[2026, 'ILS', 1500], [2026, 'USD', 500]]);

  const recent = await db.rows('select number, display_status, balance from public.v_documents_recent where kind = $1 order by number', ['invoice']);
  assert.deepEqual(recent.map((r) => [r.number, r.display_status, Number(r.balance)]),
    [['INV-2026-0001', 'partially_paid', 1500], ['INV-2026-0002', 'paid', 0]]);
  await db.close();
});
