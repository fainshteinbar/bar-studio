// Local stand-in for Supabase, for developing and testing the documents app without touching production.
//   node scripts/invoices-dev-server.mjs [port]      -> http://localhost:4180/invoices/
//
// - Serves the repo like scripts/serve.mjs, but answers /invoices/config.js with this server's own address,
//   so the app talks to the stand-in, never to bfain-docs.
// - /rest/v1: the subset of PostgREST the app uses (select with plain columns, eq/neq/gt/gte/lt/lte/like/
//   ilike/is/in filters, order, limit, offset; insert, update, delete; rpc) on pglite, running the exact
//   install.sql that is pasted into Supabase. Every request runs in its own transaction as role anon or
//   authenticated with request.jwt.claims set, so RLS, grants, triggers and functions behave as in production.
// - /auth/v1: magic link with PKCE for the owner's address only. The "email" is printed here and exposed at
//   /__dev/last-link (for browser tests). Tokens are unsigned: this is a development tool, never deployed.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { staticHandler } from './serve.mjs';

const OWNER = 'fainshteinbar@gmail.com';
const IDENT = /^[a-z_][a-z0-9_]*$/;
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export async function startDevServer({ port = 4180, root = process.cwd(), quiet = false } = {}) {
  const db = new PGlite();
  await db.exec(readFileSync('test/invoices/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(readFileSync('invoices/supabase/install.sql', 'utf8'));
  await db.exec(readFileSync('invoices/supabase/seed/settings.sql', 'utf8'));

  const base = `http://localhost:${port}`;
  const flows = new Map();          // auth code -> { challenge, email }
  let lastLink = null;
  const userId = randomUUID();
  const log = (...a) => { if (!quiet) console.log(...a); };

  // One request at a time: pglite has a single connection.
  let queue = Promise.resolve();
  const exclusive = (fn) => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };

  const session = (email) => {
    const now = Math.floor(Date.now() / 1000);
    const user = { id: userId, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {} };
    const token = `${b64u({ alg: 'none', typ: 'JWT' })}.${b64u({ sub: userId, email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, session_id: randomUUID(), is_anonymous: false })}.dev`;
    return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: `refresh-${randomUUID()}`, user };
  };

  const claimsOf = (req) => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (m && m[1].split('.').length === 3) {
      try {
        const c = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString());
        if (c.role === 'authenticated') return c;
      } catch {}
    }
    return { role: 'anon' };
  };

  const send = (res, status, body, headers = {}) => {
    const h = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...headers };
    if (body === undefined) { res.writeHead(status, h).end(); return; }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...h }).end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((ok) => {
    let s = '';
    req.on('data', (c) => { s += c; });
    req.on('end', () => { try { ok(s ? JSON.parse(s) : null); } catch { ok(null); } });
  });
  const pgError = (res, e, claims) => {
    const code = e.code || 'PGRST000';
    const status = code === '42501' ? (claims.role === 'anon' ? 401 : 403)
      : code === 'PGRST116' ? 406 : /^23(505|503)$/.test(code) ? 409 : 400;
    send(res, status, { code, message: e.message, details: e.detail || null, hint: e.hint || null });
  };

  // ---- PostgREST subset ----
  function where(params, values) {
    const parts = [];
    for (const [key, raw] of params) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key)) continue;
      if (!IDENT.test(key)) throw Object.assign(new Error(`bad column ${key}`), { code: 'PGRST100' });
      const dot = raw.indexOf('.');
      let op = raw.slice(0, dot);
      let val = raw.slice(dot + 1);
      const not = op === 'not';
      if (not) { const d2 = val.indexOf('.'); op = val.slice(0, d2); val = val.slice(d2 + 1); }
      let sql;
      if (op === 'is') {
        if (!['null', 'true', 'false'].includes(val)) throw Object.assign(new Error('bad is'), { code: 'PGRST100' });
        sql = `${key} is ${val}`;
      } else if (op === 'in') {
        const list = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
        values.push(list);
        sql = `${key}::text = any($${values.length}::text[])`;
      } else if (OPS[op]) {
        values.push(op === 'like' || op === 'ilike' ? val.replace(/\*/g, '%') : val);
        sql = `${key} ${OPS[op]} $${values.length}`;
      } else throw Object.assign(new Error(`unsupported operator ${op}`), { code: 'PGRST100' });
      parts.push(not ? `not (${sql})` : sql);
    }
    return parts.length ? `where ${parts.join(' and ')}` : '';
  }
  function columns(select) {
    if (!select || select === '*') return '*';
    const cols = select.split(',').map((c) => c.trim());
    for (const c of cols) if (!IDENT.test(c)) throw Object.assign(new Error(`unsupported select ${c} (no embedding in the stand-in)`), { code: 'PGRST100' });
    return cols.join(', ');
  }
  function orderBy(order) {
    if (!order) return '';
    return 'order by ' + order.split(',').map((o) => {
      const [c, dir = 'asc', nulls] = o.split('.');
      if (!IDENT.test(c) || !/^(asc|desc)$/.test(dir) || (nulls && !/^nulls(first|last)$/.test(nulls))) throw Object.assign(new Error('bad order'), { code: 'PGRST100' });
      return `${c} ${dir}${nulls ? ` ${nulls.replace('nulls', 'nulls ')}` : ''}`;
    }).join(', ');
  }

  async function rest(req, res, path, url) {
    const claims = claimsOf(req);
    const body = ['POST', 'PATCH'].includes(req.method) ? await readBody(req) : null;
    const prefer = req.headers.prefer || '';
    const single = /vnd\.pgrst\.object/.test(req.headers.accept || '');
    try {
      const out = await exclusive(() => db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
        if (path.startsWith('rpc/')) {
          const fn = path.slice(4);
          if (!IDENT.test(fn)) throw Object.assign(new Error('bad function'), { code: 'PGRST202' });
          const meta = (await tx.query(
            `select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types, rt.typtype
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
              where n.nspname = 'public' and p.proname = $1`, [fn])).rows[0];
          if (!meta) throw Object.assign(new Error(`Could not find the function public.${fn}`), { code: 'PGRST202' });
          const args = Object.keys(body || {}).map((k) => {
            const i = (meta.names || []).indexOf(k);
            if (i < 0 || !IDENT.test(k)) throw Object.assign(new Error(`unknown argument ${k}`), { code: 'PGRST202' });
            return `${k} => ($1::jsonb->>'${k}')::${meta.types[i]}`;
          }).join(', ');
          await tx.exec(`set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}`);
          const sql = meta.typtype === 'c'
            ? `select row_to_json(f) as j from public.${fn}(${args}) f`
            : `select to_json(public.${fn}(${args})) as j`;
          const params = args ? [JSON.stringify(body || {})] : [];   // a function without arguments takes no parameter
          return { status: 200, json: (await tx.query(sql, params)).rows[0].j };
        }

        const table = path;
        if (!IDENT.test(table)) throw Object.assign(new Error('bad table'), { code: 'PGRST205' });
        await tx.exec(`set local role ${claims.role === 'authenticated' ? 'authenticated' : 'anon'}`);
        const values = [];
        const filter = where(url.searchParams, values);
        const agg = (inner) => `with r as (${inner}) select coalesce(json_agg(r), '[]'::json) as j from r`;
        let rows;
        let status = 200;
        if (req.method === 'GET' || req.method === 'HEAD') {
          const limit = url.searchParams.get('limit');
          const offset = url.searchParams.get('offset');
          rows = (await tx.query(agg(`select ${columns(url.searchParams.get('select'))} from public.${table} ${filter} ${orderBy(url.searchParams.get('order'))}`
            + `${limit ? ` limit ${Number(limit) | 0}` : ''}${offset ? ` offset ${Number(offset) | 0}` : ''}`), values)).rows[0].j;
        } else if (req.method === 'POST') {
          const list = Array.isArray(body) ? body : [body];
          const cols = [...new Set(list.flatMap((o) => Object.keys(o || {})))];
          for (const c of cols) if (!IDENT.test(c)) throw Object.assign(new Error(`bad column ${c}`), { code: 'PGRST204' });
          values.push(JSON.stringify(list));
          rows = (await tx.query(agg(`insert into public.${table} (${cols.join(', ')}) select ${cols.join(', ')} from json_populate_recordset(null::public.${table}, $${values.length}::json) returning *`), values)).rows[0].j;
          status = 201;
        } else if (req.method === 'PATCH') {
          const cols = Object.keys(body || {});
          for (const c of cols) if (!IDENT.test(c)) throw Object.assign(new Error(`bad column ${c}`), { code: 'PGRST204' });
          values.push(JSON.stringify(body));
          rows = (await tx.query(agg(`update public.${table} set (${cols.join(', ')}) = (select ${cols.join(', ')} from json_populate_record(null::public.${table}, $${values.length}::json)) ${filter} returning *`), values)).rows[0].j;
        } else if (req.method === 'DELETE') {
          rows = (await tx.query(agg(`delete from public.${table} ${filter} returning *`), values)).rows[0].j;
        } else throw Object.assign(new Error('method not allowed'), { code: 'PGRST117' });

        if (single) {
          if (rows.length !== 1) throw Object.assign(new Error('JSON object requested, multiple (or no) rows returned'), { code: 'PGRST116' });
          return { status, json: rows[0] };
        }
        if (req.method !== 'GET' && !/return=representation/.test(prefer)) return { status: req.method === 'POST' ? 201 : 204 };
        return { status, json: rows };
      }));
      send(res, out.status, out.json);
    } catch (e) {
      pgError(res, e, claims);
    }
  }

  // ---- Auth subset (magic link, PKCE) ----
  async function auth(req, res, path, url) {
    if (path === 'otp' && req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body?.email || '').toLowerCase();
      if (email !== OWNER) return send(res, 422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' });
      const code = `dev-${randomUUID().slice(0, 8)}`;
      flows.set(code, { challenge: body.code_challenge, method: body.code_challenge_method, email });
      const back = url.searchParams.get('redirect_to') || `${base}/invoices/`;
      lastLink = `${back}${back.includes('?') ? '&' : '?'}code=${code}`;
      log(`\n  magic link for ${email}:\n  ${lastLink}\n`);
      return send(res, 200, {});
    }
    if (path === 'token' && req.method === 'POST') {
      const body = await readBody(req);
      const grant = url.searchParams.get('grant_type');
      if (grant === 'pkce') {
        const flow = flows.get(body?.auth_code);
        const verified = flow && body?.code_verifier
          && createHash('sha256').update(body.code_verifier).digest('base64url') === flow.challenge;
        if (!verified) return send(res, 404, { code: 404, error_code: 'flow_state_not_found', msg: 'invalid flow state, no valid flow state found' });
        flows.delete(body.auth_code);
        return send(res, 200, session(flow.email));
      }
      if (grant === 'refresh_token') return send(res, 200, session(OWNER));
      return send(res, 400, { code: 400, error_code: 'unsupported_grant_type', msg: 'unsupported grant type' });
    }
    if (path === 'user') {
      const c = claimsOf(req);
      return c.role === 'authenticated' ? send(res, 200, session(c.email).user) : send(res, 401, { code: 401, msg: 'invalid JWT' });
    }
    if (path === 'logout') return send(res, 204);
    if (path === 'settings') return send(res, 200, { disable_signup: true, external: { email: true, anonymous_users: false } });
    return send(res, 404, { code: 404, msg: 'not found' });
  }

  const files = staticHandler(root);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, base);
    const p = url.pathname;
    if (req.method === 'OPTIONS') return send(res, 204, undefined, { 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' });
    if (p === '/invoices/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(`// Served by scripts/invoices-dev-server.mjs: local stand-in, not production.\nexport const SUPABASE_URL = '${base}';\nexport const SUPABASE_ANON_KEY = 'sb_publishable_LOCAL_DEV';\nexport const DEV_MODE = true;\n`);
    }
    if (p === '/__dev/last-link') return send(res, 200, { link: lastLink });
    if (p.startsWith('/rest/v1/')) return rest(req, res, p.slice('/rest/v1/'.length), url);
    if (p.startsWith('/auth/v1/')) return auth(req, res, p.slice('/auth/v1/'.length), url);
    return files(req, res);
  });
  await new Promise((ok) => server.listen(port, ok));
  return { server, db, base, close: () => new Promise((ok) => server.close(ok)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2]) || 4180;
  const { base } = await startDevServer({ port });
  console.log(`Local stand-in for Supabase (test data only, nothing reaches production)\n  app: ${base}/invoices/\n  sign in with ${OWNER}; the magic link is printed here.`);
}
