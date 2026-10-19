// pglite harness for the invoices database tests.
// Each call to freshDb() boots an in-memory Postgres, applies the Supabase stub, then the exact
// install.sql that gets pasted into Supabase (built from the migrations), then the seed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
export const STUB = read('../sql/00_supabase_stub.sql');
export const INSTALL = read('../../../invoices/supabase/install.sql');
export const SEED = read('../../../invoices/supabase/seed/settings.sql');
export const RESET = read('../../../invoices/supabase/dev/reset_test.sql');
export const MARK_TEST = read('../../../invoices/supabase/dev/mark_test_project.sql');

export const OWNER = 'fainshteinbar@gmail.com';
export const STRANGER = 'someone.else@example.com';

export async function freshDb({ seed = true } = {}) {
  const pg = new PGlite();
  await pg.exec(STUB);
  await pg.exec(INSTALL);
  if (seed) await pg.exec(SEED);
  const db = new Db(pg);
  await db.as(OWNER);
  return db;
}

export class Db {
  constructor(pg) { this.pg = pg; this.actor = 'postgres'; }

  // actor: an email (signed in as authenticated), 'anon', or 'postgres' (the SQL Editor, superuser here).
  async as(actor) {
    await this.pg.exec('reset role');
    const claims = actor === 'postgres' ? '' : actor === 'anon'
      ? JSON.stringify({ role: 'anon' })
      : JSON.stringify({ role: 'authenticated', email: actor, sub: '00000000-0000-4000-8000-000000000001', is_anonymous: false });
    await this.pg.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    if (actor !== 'postgres') await this.pg.exec(`set role ${actor === 'anon' ? 'anon' : 'authenticated'}`);
    this.actor = actor;
    return this;
  }

  async rows(sql, params = []) { return (await this.pg.query(sql, params)).rows; }
  async one(sql, params = []) { return (await this.rows(sql, params))[0]; }
  async affected(sql, params = []) { return (await this.pg.query(sql, params)).affectedRows ?? 0; }
  async exec(sql) { return this.pg.exec(sql); }

  // Run something as another actor and come back.
  async with(actor, fn) {
    const prev = this.actor;
    await this.as(actor);
    try { return await fn(this); } finally { await this.as(prev); }
  }

  // ---- data, created the way the app will create it (plain inserts under RLS, then RPCs) ----
  async client(name = 'Test client', extra = {}) {
    const r = await this.one(
      `insert into public.clients (display_name, legal_name, identifier, contact, email, address)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [name, extra.legal_name ?? null, extra.identifier ?? null, extra.contact ?? null, extra.email ?? null, extra.address ?? null]);
    return r.id;
  }

  async project(clientId, { description = 'Test project', total = 3000, currency = 'ILS', terms = '50/50' } = {}) {
    const r = await this.one(
      `insert into public.projects (client_id, description, total, currency, payment_terms)
       values ($1, $2, $3, $4, $5) returning id`, [clientId, description, total, currency, terms]);
    return r.id;
  }

  // Draft invoice / quote / credit note with lines; draft receipt with an amount.
  async draft({ kind = 'invoice', client, project = null, parent = null, currency = 'ILS', issue_date = null,
                due_date = null, lines = [[1, 1200]], amount = null, method = null, payment_date = null } = {}) {
    const d = await this.one(
      `insert into public.documents (kind, client_id, project_id, parent_id, currency, issue_date, due_date,
                                     amount, payment_method, payment_date)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [kind, client, project, parent, currency, issue_date, due_date, amount, method, payment_date]);
    if (kind !== 'receipt') {
      let pos = 0;
      for (const [qty, price] of lines) {
        await this.rows(
          `insert into public.document_items (document_id, position, description_he, description_en, qty, unit_price)
           values ($1, $2, $3, $4, $5, $6)`, [d.id, pos++, 'שורה לבדיקה', 'Test line', qty, price]);
      }
    }
    return d.id;
  }

  async issue(id) { return this.one('select * from public.issue_document($1)', [id]); }

  async issued(opts) { return this.issue(await this.draft(opts)); }

  async receipt(invoiceId, { amount, issue_date = null, payment_date = '2026-10-05', method = 'bank_transfer', he = null, en = null } = {}) {
    const r = await this.one('select * from public.create_receipt_from_invoice($1, $2, $3, $4, $5, $6)',
      [invoiceId, amount, method, payment_date, he, en]);
    if (issue_date) await this.rows('update public.documents set issue_date = $2 where id = $1', [r.id, issue_date]);
    return r;
  }

  async balance(invoiceId) {
    const b = await this.one('select * from public.v_invoice_balances where id = $1', [invoiceId]);
    return b && { ...b, amount: Number(b.amount), paid: Number(b.paid), credited: Number(b.credited), balance: Number(b.balance) };
  }

  async close() { await this.pg.close(); }
}

// Asserts that a promise rejects, and that the Postgres error matches.
export async function rejects(promise, { code, hint, message } = {}) {
  let err;
  try { await promise; } catch (e) { err = e; }
  assert.ok(err, 'expected the statement to fail, but it succeeded');
  if (code) assert.equal(err.code, code, `expected SQLSTATE ${code}, got ${err.code}: ${err.message}`);
  if (hint) assert.equal(err.hint, hint, `expected hint ${hint}, got ${err.hint}: ${err.message}`);
  if (message) assert.match(err.message, message);
  return err;
}
