// Identity: only the owner's verified email reaches anything. The anon key reaches nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, rejects, OWNER, STRANGER } from './helpers/db.mjs';

const TABLES = ['settings', 'clients', 'projects', 'documents', 'document_items', 'audit_log'];
const VIEWS = ['v_invoice_balances', 'v_quote_status', 'v_documents_recent', 'v_client_open_balance',
  'v_received_monthly', 'v_received_yearly', 'v_backup_status'];
const RPCS = [
  ['issue_document', 'select public.issue_document($1)'],
  ['issue_preview', 'select public.issue_preview($1)'],
  ['duplicate_document', 'select public.duplicate_document($1)'],
  ['create_receipt_from_invoice', `select public.create_receipt_from_invoice($1, 1, 'cash', '2026-10-05')`],
  ['convert_quote_to_invoice', 'select public.convert_quote_to_invoice($1)'],
];

async function setup() {
  const db = await freshDb();
  const c = await db.client();
  const inv = await db.issued({ client: c, issue_date: '2026-10-15' });
  return { db, c, inv };
}

test('another signed-in email sees nothing, writes nothing, and every action is refused', async () => {
  const { db, c, inv } = await setup();
  await db.as(STRANGER);
  for (const t of [...TABLES, ...VIEWS]) {
    assert.equal((await db.rows(`select * from public.${t}`)).length, 0, `${t} must look empty to a stranger`);
  }
  await rejects(db.rows(`insert into public.clients (display_name) values ('x')`), { code: '42501' });
  await rejects(db.rows(`insert into public.documents (kind, client_id) values ('invoice', $1)`, [c]), { code: '42501' });
  assert.equal(await db.affected(`update public.settings set footer_text = 'x'`), 0);
  assert.equal(await db.affected(`delete from public.clients`), 0);
  for (const [name, sql] of RPCS) {
    await rejects(db.rows(sql, [inv.id]), { code: '42501', hint: 'forbidden' }).catch((e) => { throw new Error(`${name}: ${e.message}`); });
  }
  await rejects(db.rows('select public.mark_backup()'), { code: '42501', hint: 'forbidden' });
  await db.close();
});

test('an anonymous or unverified-anonymous session is not the owner', async () => {
  const { db } = await setup();
  await db.pg.exec('reset role');
  await db.pg.query(`select set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ role: 'authenticated', email: OWNER, is_anonymous: true })]);
  await db.pg.exec('set role authenticated');
  assert.equal((await db.rows('select * from public.documents')).length, 0);
  await db.close();
});

test('the anon role is denied at the privilege level, before RLS', async () => {
  const { db, inv } = await setup();
  await db.as('anon');
  for (const t of [...TABLES, ...VIEWS]) {
    await rejects(db.rows(`select * from public.${t}`), { code: '42501' });
  }
  for (const [, sql] of RPCS) await rejects(db.rows(sql, [inv.id]), { code: '42501' });
  await rejects(db.rows('select public.mark_backup()'), { code: '42501' });
  await db.close();
});

test('internals are out of reach: counters, numbering and helpers', async () => {
  const { db } = await setup();
  await rejects(db.rows(`select app.next_number('invoice', 2026)`), { code: '42501' });
  await rejects(db.rows('select * from app.counters'), { code: '42501' });
  await rejects(db.rows(`select app.ensure_policy('public.clients', 'x', 'for select using (true)')`), { code: '42501' });
  await rejects(db.rows('select * from app.migrations'), { code: '42501' });
  // The owner may call the two helpers policies and views rely on, and nothing else in app.
  assert.equal((await db.one('select app.is_owner() as ok')).ok, true);
  await db.close();
});

test('settings: the owner reads and edits the single row but cannot add or remove one', async () => {
  const { db } = await setup();
  const s = await db.one('select * from public.settings');
  assert.equal(s.supplier_name, 'Bar Fainshtein');
  assert.equal(s.trading_as, 'bfain.studio');
  assert.equal(s.supplier_email, 'fainshteinbar@gmail.com');
  assert.equal(s.supplier_phone, '053-622-4344');
  assert.equal(s.supplier_address, null, 'the address is never seeded; it is typed in the app');
  assert.equal(s.show_identifier, false);
  assert.equal(s.footer_text,
    'Issued by a service provider resident outside Israel. Services performed outside Israel. No Israeli VAT charged.');
  assert.equal(await db.affected(`update public.settings set supplier_address = 'Somewhere'`), 1);
  await rejects(db.rows('insert into public.settings (id) values (true)'), { code: '42501' });
  await rejects(db.rows('delete from public.settings'), { code: '42501' });
  await db.close();
});
