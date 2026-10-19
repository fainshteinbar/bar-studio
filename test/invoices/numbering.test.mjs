// Numbering: one running sequence per kind and year, starting at 0001, with no gaps and no repeats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers/db.mjs';

test('each kind numbers on its own, from 0001, per year', async () => {
  const db = await freshDb();
  const c = await db.client();
  const p = await db.project(c, { total: 9000, terms: '50/50' });

  const invoices = [];
  for (const day of ['2026-10-01', '2026-10-02', '2026-10-03']) {
    invoices.push(await db.issued({ client: c, project: p, issue_date: day, lines: [[1, 3000]] }));
  }
  assert.deepEqual(invoices.map((d) => d.number), ['INV-2026-0001', 'INV-2026-0002', 'INV-2026-0003']);

  const r1 = await db.issue((await db.receipt(invoices[0].id, { amount: 1000, issue_date: '2026-10-05' })).id);
  const r2 = await db.issue((await db.receipt(invoices[0].id, { amount: 500, issue_date: '2026-10-06' })).id);
  assert.deepEqual([r1.number, r2.number], ['REC-2026-0001', 'REC-2026-0002']);

  const cn = await db.issued({ kind: 'credit_note', client: c, parent: invoices[1].id, issue_date: '2026-10-07', lines: [[1, 100]] });
  assert.equal(cn.number, 'CRN-2026-0001');

  const q = await db.issued({ kind: 'quote', client: c, issue_date: '2026-10-07', lines: [[2, 750]] });
  assert.equal(q.number, 'QUO-2026-0001');
  assert.equal(Number(q.amount), 1500);

  const next = await db.issued({ client: c, issue_date: '2027-01-04' });
  assert.equal(next.number, 'INV-2027-0001', 'a new year starts again at 0001');
  const back = await db.issued({ client: c, issue_date: '2026-12-31' });
  assert.equal(back.number, 'INV-2026-0004', 'the 2026 sequence continues where it stopped');
  await db.close();
});

test('a failed issue does not use up a number', async () => {
  const db = await freshDb();
  const c = await db.client();
  const empty = await db.draft({ client: c, issue_date: '2026-10-01', lines: [] });
  await rejects(db.issue(empty), { hint: 'validation', message: /at least one line/ });
  await rejects(db.issue(empty), { hint: 'validation' });
  const ok = await db.issued({ client: c, issue_date: '2026-10-01' });
  assert.equal(ok.number, 'INV-2026-0001');

  const counter = await db.with('postgres', (d) => d.one(`select last_no from app.counters where kind = 'invoice' and year = 2026`));
  assert.equal(counter.last_no, 1);
  await db.close();
});

test('the issue date may not go back before the last issued document of the same kind and year', async () => {
  const db = await freshDb();
  const c = await db.client();
  await db.issued({ client: c, issue_date: '2026-10-15' });
  const early = await db.draft({ client: c, issue_date: '2026-10-14' });
  await rejects(db.issue(early), { hint: 'date_order', message: /15\.10\.2026/ });

  // Same day is fine, and the rejected draft goes through once its date is moved forward.
  assert.equal((await db.issued({ client: c, issue_date: '2026-10-15' })).number, 'INV-2026-0002');
  await db.rows('update public.documents set issue_date = $2 where id = $1', [early, '2026-10-16']);
  assert.equal((await db.issue(early)).number, 'INV-2026-0003');

  // Other kinds keep their own order.
  const q = await db.issued({ kind: 'quote', client: c, issue_date: '2026-10-01' });
  assert.equal(q.number, 'QUO-2026-0001');
  await db.close();
});

test('a draft without an issue date is issued with today (Asia/Bangkok)', async () => {
  const db = await freshDb();
  const c = await db.client();
  const d = await db.issued({ client: c });
  const today = await db.one(`select to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD') as d`);
  const got = await db.one(`select to_char(issue_date, 'YYYY-MM-DD') as d from public.documents where id = $1`, [d.id]);
  assert.equal(got.d, today.d);
  assert.match(d.number, new RegExp(`^INV-${today.d.slice(0, 4)}-0001$`));
  await db.close();
});

test('issue_preview tells the app the next number and the earliest allowed date', async () => {
  const db = await freshDb();
  const c = await db.client();
  const inv = await db.issued({ client: c, issue_date: '2026-10-15' });
  const d = await db.draft({ client: c, issue_date: '2026-10-20' });
  const pv = (await db.one('select public.issue_preview($1) as p', [d])).p;
  assert.equal(pv.next_number, 'INV-2026-0002');
  assert.equal(pv.min_issue_date, '2026-10-15');
  assert.equal(Number(pv.amount), 1200);

  const r = await db.receipt(inv.id, { amount: 400, issue_date: '2026-10-20' });
  const rp = (await db.one('select public.issue_preview($1) as p', [r.id])).p;
  assert.equal(rp.next_number, 'REC-2026-0001');
  assert.equal(rp.min_issue_date, '2026-10-15');
  assert.equal(Number(rp.open_balance), 1200);

  const after = (await db.one('select public.issue_preview($1) as p', [inv.id])).p;
  assert.deepEqual(after, { issued: true, number: 'INV-2026-0001' });
  await db.close();
});

test('counters only move forward by one, even from the SQL Editor', async () => {
  const db = await freshDb();
  const c = await db.client();
  await db.issued({ client: c, issue_date: '2026-10-01' });
  await db.as('postgres');
  await rejects(db.rows(`update app.counters set last_no = 0 where kind = 'invoice'`), { hint: 'locked' });
  await rejects(db.rows(`update app.counters set last_no = 7 where kind = 'invoice'`), { hint: 'locked' });
  await rejects(db.rows(`delete from app.counters`), { hint: 'locked' });
  await rejects(db.rows(`truncate app.counters`), { hint: 'locked' });
  await rejects(db.rows(`insert into app.counters values ('receipt', 2026, 9)`), { hint: 'locked' });
  await db.close();
});
