// Locking: an issued document and its lines never change and never go away.
// Layer 1 is RLS (the app's role sees zero affected rows); layer 2 is the triggers (every role gets an error).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects } from './helpers/db.mjs';

async function setup() {
  const db = await freshDb();
  const c = await db.client();
  const inv = await db.issued({ client: c, issue_date: '2026-10-15', lines: [[1, 3000]] });
  const line = await db.one('select id from public.document_items where document_id = $1', [inv.id]);
  return { db, c, inv, line: line.id };
}

test('RLS: the signed-in owner cannot edit or delete an issued document or its lines', async () => {
  const { db, inv, line } = await setup();
  assert.equal(await db.affected('update public.documents set notes_he = $2 where id = $1', [inv.id, 'שינוי']), 0);
  assert.equal(await db.affected('update public.documents set amount = 1 where id = $1', [inv.id]), 0);
  assert.equal(await db.affected('delete from public.documents where id = $1', [inv.id]), 0);
  assert.equal(await db.affected('update public.document_items set unit_price = 1 where id = $1', [line]), 0);
  assert.equal(await db.affected('delete from public.document_items where id = $1', [line]), 0);
  await rejects(db.rows(
    `insert into public.document_items (document_id, description_en, qty, unit_price) values ($1, 'Extra', 1, 10)`, [inv.id]));

  const still = await db.one('select amount, notes_he, status from public.documents where id = $1', [inv.id]);
  assert.deepEqual({ ...still, amount: Number(still.amount) }, { amount: 3000, notes_he: null, status: 'issued' });
  assert.equal((await db.rows('select 1 from public.document_items where document_id = $1', [inv.id])).length, 1);
  await db.close();
});

test('the app cannot create an issued document or issue a draft by hand', async () => {
  const { db, c } = await setup();
  // On insert the trigger runs before the RLS check, so the trigger is what answers here.
  await rejects(db.rows(
    `insert into public.documents (kind, status, number, client_id, issue_date, issued_at, amount, snapshot)
     values ('invoice', 'issued', 'INV-2026-0099', $1, '2026-10-15', now(), 5, '{}')`, [c]), { hint: 'locked' });
  const draft = await db.draft({ client: c, issue_date: '2026-10-16' });
  await rejects(db.rows(
    `update public.documents set status = 'issued', number = 'INV-2026-0099', issued_at = now(), amount = 1000, snapshot = '{}' where id = $1`,
    [draft]), { hint: 'locked' });
  // Giving a draft a number by hand is caught by RLS (WITH CHECK number is null).
  await rejects(db.rows(`update public.documents set number = 'INV-2026-0099' where id = $1`, [draft]), { code: '42501' });
  await db.close();
});

test('triggers: postgres (SQL Editor) is refused the same changes', async () => {
  const { db, inv, line } = await setup();
  await db.as('postgres');
  await rejects(db.rows('update public.documents set notes_he = $2 where id = $1', [inv.id, 'x']), { hint: 'locked' });
  await rejects(db.rows('delete from public.documents where id = $1', [inv.id]), { hint: 'locked' });
  await rejects(db.rows('update public.document_items set unit_price = 1 where id = $1', [line]), { hint: 'locked' });
  await rejects(db.rows('delete from public.document_items where id = $1', [line]), { hint: 'locked' });
  await rejects(db.rows(
    `insert into public.document_items (document_id, description_en, qty, unit_price) values ($1, 'Extra', 1, 10)`, [inv.id]),
    { hint: 'locked' });

  const draft = await db.draft({ client: inv.client_id, issue_date: '2026-10-16' });
  await rejects(db.rows(
    `update public.documents set status = 'issued', number = 'INV-2026-0099', issued_at = now(), amount = 1, snapshot = '{}' where id = $1`,
    [draft]), { hint: 'locked', message: /issue_document/ });
  await rejects(db.rows(
    `insert into public.documents (kind, status, number, client_id, issue_date, issued_at, amount, snapshot)
     values ('invoice', 'issued', 'INV-2026-0099', $1, '2026-10-15', now(), 5, '{}')`, [inv.client_id]), { hint: 'locked' });
  // A client with issued documents cannot be removed either.
  await rejects(db.rows('delete from public.clients where id = $1', [inv.client_id]));
  await db.close();
});

test('issuing twice is refused', async () => {
  const { db, inv } = await setup();
  await rejects(db.issue(inv.id), { hint: 'locked', message: /already issued/ });
  await db.close();
});

test('drafts stay fully editable and deletable, and carry no number', async () => {
  const { db, c } = await setup();
  const d = await db.draft({ client: c, issue_date: '2026-10-16' });
  assert.equal(await db.affected('update public.documents set notes_he = $2 where id = $1', [d, 'הערה']), 1);
  assert.equal(await db.affected('update public.document_items set unit_price = 1500 where document_id = $1', [d]), 1);
  const row = await db.one('select number, status, snapshot from public.documents where id = $1', [d]);
  assert.deepEqual(row, { number: null, status: 'draft', snapshot: null });
  assert.equal(await db.affected('delete from public.documents where id = $1', [d]), 1);
  assert.equal((await db.rows('select 1 from public.document_items where document_id = $1', [d])).length, 0);
  await db.close();
});

test('the kind of a draft cannot change, and receipts carry no lines', async () => {
  const { db, c, inv } = await setup();
  const q = await db.draft({ kind: 'quote', client: c });
  await rejects(db.rows(`update public.documents set kind = 'invoice' where id = $1`, [q]));
  const r = await db.receipt(inv.id, { amount: 100 });
  await rejects(db.rows(
    `insert into public.document_items (document_id, description_en, qty, unit_price) values ($1, 'x', 1, 1)`, [r.id]),
    { message: /no line items/ });
  await db.close();
});

test('duplicate_document makes an editable draft copy of an issued document', async () => {
  const { db, inv } = await setup();
  const copy = await db.one('select * from public.duplicate_document($1)', [inv.id]);
  assert.equal(copy.status, 'draft');
  assert.equal(copy.number, null);
  assert.equal(copy.source_id, inv.id);
  assert.equal(copy.issue_date, null);
  const lines = await db.rows('select qty, unit_price, description_he, description_en from public.document_items where document_id = $1', [copy.id]);
  assert.equal(lines.length, 1);
  assert.equal(Number(lines[0].unit_price), 3000);
  assert.equal(await db.affected('update public.document_items set unit_price = 2500 where document_id = $1', [copy.id]), 1);
  await db.close();
});
