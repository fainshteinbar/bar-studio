// Writes invoices/config.js with the production project's URL and public key.
//   node scripts/invoices-config.mjs
// Asks for the two values in the terminal, checks them, and refuses anything that looks like a
// secret key (sb_secret_..., or a JWT whose role is service_role).
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, terminal: false });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q) => { process.stdout.write(q); const { value } = await lines.next(); return String(value ?? '').trim(); };
const url = (await ask('Project URL (https://xxxx.supabase.co): ')).replace(/\/+$/, '');
const key = await ask('Publishable key (sb_publishable_...) or legacy anon public key (eyJ...): ');
rl.close();

const fail = (msg) => { console.error(`\n${msg}\nNothing was written.`); process.exit(1); };
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) fail('That does not look like a Supabase project URL.');
if (/^sb_secret_/.test(key)) fail('This is a SECRET key. Use the publishable key instead, and never share the secret one.');
if (key.startsWith('eyJ')) {
  let role = '';
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { fail('That key could not be read.'); }
  if (role !== 'anon') fail(`This key has role "${role}". Use the anon public key, never service_role.`);
} else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
  fail('That does not look like a publishable or anon key.');
}

writeFileSync('invoices/config.js', `// Production project (bfain-docs). Both values are public by design: the database is protected by
// Row Level Security, not by hiding this key. Never put a secret or service_role key here.
// Written by: node scripts/invoices-config.mjs
export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(key)};
`);
console.log('\ninvoices/config.js written.');
