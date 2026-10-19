// The paste files themselves: install.sql is idempotent and never removes anything;
// reset_test.sql runs only where the test marker exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { freshDb, rejects, INSTALL, SEED, RESET, MARK_TEST, STUB } from './helpers/db.mjs';

test('install.sql never contains DROP and is exactly the migrations in order', () => {
  assert.doesNotMatch(INSTALL, /\bdrop\b/i);
  const dir = new URL('../../invoices/supabase/migrations/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.length >= 6);
  let at = -1;
  for (const f of files) {
    const body = readFileSync(new URL(f, dir), 'utf8').trim();
    const i = INSTALL.indexOf(body);
    assert.ok(i > at, `${f} is in install.sql, after the one before it`);
    at = i;
  }
});

test('no em dash and no Israeli registered-dealer wording in the SQL', () => {
  for (const text of [INSTALL, SEED, RESET, MARK_TEST]) {
    assert.doesNotMatch(text, /\u2014/);
    assert.doesNotMatch(text, /חשבונית מס|עוסק|מע"מ|הקצאה|ת\.ז/);
  }
  const vat = INSTALL.match(/VAT/g) ?? [];
  assert.equal(vat.length, 1, 'VAT appears only in "No Israeli VAT charged"');
  assert.match(INSTALL, /No Israeli VAT charged\./);
});

test('install.sql and the seed can be pasted again without changing data', async () => {
  const db = await freshDb();
  const c = await db.client();
  const inv = await db.issued({ client: c, issue_date: '2026-10-15' });
  await db.rows(`update public.settings set supplier_address = 'Kept'`);
  const policies = await db.with('postgres', (d) => d.one('select count(*) n from pg_policies'));

  await db.as('postgres');
  await db.exec(INSTALL);
  await db.exec(SEED);
  await db.exec(INSTALL);
  assert.deepEqual(await db.one('select count(*) n from pg_policies'), policies);
  assert.equal((await db.one('select supplier_address a from public.settings')).a, 'Kept');
  assert.equal((await db.one('select number from public.documents where id = $1', [inv.id])).number, 'INV-2026-0001');
  const migrations = await db.rows('select name from app.migrations order by name');
  assert.equal(migrations.length, 6);

  await db.as('fainshteinbar@gmail.com');
  assert.equal((await db.issued({ client: c, issue_date: '2026-10-16' })).number, 'INV-2026-0002');
  await db.close();
});

test('reset_test.sql refuses to run without the test marker and changes nothing', async () => {
  const db = await freshDb();
  const c = await db.client();
  await db.issued({ client: c, issue_date: '2026-10-15' });
  await db.as('postgres');
  await rejects(db.exec(RESET), { message: /not the test project/ });
  assert.equal(Number((await db.one('select count(*) n from public.documents')).n), 1);
  assert.equal(Number((await db.one('select count(*) n from public.clients')).n), 1);
  await db.close();
});

test('reset_test.sql in the marked test project wipes everything, reinstalls, reseeds and keeps the marker', async () => {
  const db = await freshDb();
  const c = await db.client();
  await db.issued({ client: c, issue_date: '2026-10-15' });
  await db.as('postgres');
  await db.exec(MARK_TEST);
  await db.exec(RESET);
  assert.equal(Number((await db.one('select count(*) n from public.documents')).n), 0);
  assert.equal(Number((await db.one('select count(*) n from public.audit_log')).n), 1, 'only the seed row is logged');
  assert.equal((await db.one('select supplier_name n from public.settings')).n, 'Bar Fainshtein');
  assert.equal(Number((await db.one('select count(*) n from app.test_project_marker')).n), 1);

  await db.as('fainshteinbar@gmail.com');
  const c2 = await db.client();
  assert.equal((await db.issued({ client: c2, issue_date: '2026-10-15' })).number, 'INV-2026-0001', 'numbering starts over');
  await db.close();
});

test('install.sql works on a database with nothing but the Supabase basics', async () => {
  const pg = new PGlite();
  await pg.exec(STUB);
  await pg.exec(INSTALL);
  await pg.exec(SEED);
  const { rows } = await pg.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert.deepEqual(rows, [], 'every public table has RLS on');
  await pg.close();
});
