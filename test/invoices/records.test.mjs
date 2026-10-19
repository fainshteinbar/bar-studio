// Records: the frozen snapshot, the append-only audit log, the backup banner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects, OWNER } from './helpers/db.mjs';

test('the snapshot freezes supplier, client and legal text at the moment of issue', async () => {
  const db = await freshDb();
  await db.rows(`update public.settings set supplier_address = 'Address A', payment_terms_text = 'Terms A'`);
  const c = await db.client('לקוח', { address: 'Client address A', legal_name: 'Client Ltd' });
  const p = await db.project(c, { description: 'סרט', terms: '50/50' });
  const inv = await db.issued({ client: c, project: p, issue_date: '2026-10-15', lines: [[1, 3000]] });

  await db.rows(`update public.settings set supplier_address = 'Address B', footer_text = 'Changed', payment_terms_text = 'Terms B'`);
  await db.rows(`update public.clients set address = 'Client address B', display_name = 'Renamed' where id = $1`, [c]);

  const { snapshot: s } = await db.one('select snapshot from public.documents where id = $1', [inv.id]);
  assert.equal(s.supplier.name, 'Bar Fainshtein');
  assert.equal(s.supplier.trading_as, 'bfain.studio');
  assert.equal(s.supplier.address, 'Address A');
  assert.equal(s.supplier.phone, '053-622-4344');
  assert.equal(s.supplier.identifier, null, 'the identifier is off by default');
  assert.equal(s.client.display_name, 'לקוח');
  assert.equal(s.client.address, 'Client address A');
  assert.equal(s.client.legal_name, 'Client Ltd');
  assert.equal(s.project.description, 'סרט');
  assert.equal(s.project.payment_terms, '50/50');
  assert.equal(s.terms_text, 'Terms A');
  assert.equal(s.footer_text,
    'Issued by a service provider resident outside Israel. Services performed outside Israel. No Israeli VAT charged.');
  await db.close();
});

test('the identifier appears only when switched on and filled in', async () => {
  const db = await freshDb();
  const c = await db.client();
  await db.rows(`update public.settings set show_identifier = true, identifier_label = 'ID', identifier_value = '  '`);
  const a = await db.issued({ client: c, issue_date: '2026-10-15' });
  assert.equal(a.snapshot.supplier.identifier, null, 'switched on but empty: not shown');
  await db.rows(`update public.settings set identifier_value = 'X123'`);
  const b = await db.issued({ client: c, issue_date: '2026-10-15' });
  assert.deepEqual(b.snapshot.supplier.identifier, { label: 'ID', value: 'X123' });
  await db.rows(`update public.settings set show_identifier = false`);
  const d = await db.issued({ client: c, issue_date: '2026-10-15' });
  assert.equal(d.snapshot.supplier.identifier, null);
  await db.close();
});

test('a receipt freezes what was paid before, now, and what stays open', async () => {
  const db = await freshDb();
  const c = await db.client();
  const p = await db.project(c);
  const inv = await db.issued({ client: c, project: p, issue_date: '2026-10-15', lines: [[1, 3000]] });
  const r = await db.issue((await db.receipt(inv.id, { amount: 1500, issue_date: '2026-10-15' })).id);
  assert.deepEqual(r.snapshot.balance, { invoice_total: 3000, credited: 0, paid_before: 0, paid_now: 1500, open_after: 1500 });
  assert.deepEqual(r.snapshot.parent, { number: 'INV-2026-0001', issue_date: '2026-10-15', amount: 3000 });
  await db.close();
});

test('the app cannot write a snapshot on a draft', async () => {
  const db = await freshDb();
  const c = await db.client();
  const d = await db.draft({ client: c });
  await db.rows(`update public.documents set snapshot = '{"supplier":{"name":"Fake"}}' where id = $1`, [d]);
  assert.equal((await db.one('select snapshot from public.documents where id = $1', [d])).snapshot, null);
  await db.close();
});

test('every change lands in the audit log, which nobody can edit or empty', async () => {
  const db = await freshDb();
  const before = Number((await db.one('select count(*) n from public.audit_log')).n);
  const c = await db.client();
  const inv = await db.issued({ client: c, issue_date: '2026-10-15' });
  // client insert, document insert, item insert, document update (issue)
  const rows = await db.rows('select table_name, action, actor_email from public.audit_log order by id');
  assert.equal(rows.length - before, 4);
  assert.deepEqual(rows.slice(before).map((r) => `${r.table_name}:${r.action}`),
    ['clients:INSERT', 'documents:INSERT', 'document_items:INSERT', 'documents:UPDATE']);
  assert.ok(rows.slice(before).every((r) => r.actor_email === OWNER));
  const issueRow = await db.one(`select old_row->>'status' o, new_row->>'status' n, new_row->>'number' num
                                   from public.audit_log where table_name = 'documents' and action = 'UPDATE'`);
  assert.deepEqual(issueRow, { o: 'draft', n: 'issued', num: inv.number });

  await rejects(db.rows(`insert into public.audit_log (table_name, action) values ('x', 'INSERT')`), { code: '42501' });
  // No update or delete grant at all for the app's role: refused before RLS is even consulted.
  await rejects(db.rows('update public.audit_log set actor_email = null'), { code: '42501' });
  await rejects(db.rows('delete from public.audit_log'), { code: '42501' });

  await db.as('postgres');
  await rejects(db.rows('update public.audit_log set actor_email = null'), { hint: 'locked' });
  await rejects(db.rows('delete from public.audit_log'), { hint: 'locked' });
  await rejects(db.rows('truncate public.audit_log'), { hint: 'locked' });
  await db.close();
});

test('backup banner: on after an issue, off after a backup, on again after the next issue', async () => {
  const db = await freshDb();
  const status = () => db.one('select issued_since_backup n, needs_backup b, days_since d from public.v_backup_status');
  assert.deepEqual(await status(), { n: 0, b: false, d: null }, 'nothing issued, nothing to back up');

  const c = await db.client();
  await db.issued({ client: c, issue_date: '2026-10-15' });
  assert.deepEqual(await status(), { n: 1, b: true, d: null });

  const at = (await db.one('select public.mark_backup() as at')).at;
  assert.ok(at instanceof Date);
  assert.deepEqual(await status(), { n: 0, b: false, d: 0 });

  await db.issued({ client: c, issue_date: '2026-10-16' });
  assert.deepEqual(await status(), { n: 1, b: true, d: 0 });

  // 31 days without a backup turns the banner on even with nothing new.
  await db.one('select public.mark_backup()');
  await db.with('postgres', (d) => d.rows(`update public.settings set last_backup_at = now() - interval '31 days'`));
  const late = await status();
  assert.equal(late.b, true);
  assert.ok(late.d >= 30);
  await db.close();
});
