// Data layer: every read and write the app makes, through supabase-js under the signed-in session.
// All rules (owner only, drafts editable, issued locked, numbering, balances) live in the database;
// this file only asks. Each function returns data or throws the Supabase error ({ code, message, hint }).
import { sb } from './auth.js';

const ok = ({ data, error }) => { if (error) throw error; return data; };
const DOC_FIELDS = ['kind', 'client_id', 'project_id', 'parent_id', 'source_id', 'currency', 'amount', 'issue_date', 'due_date',
  'valid_until', 'payment_method', 'payment_date', 'label_he', 'label_en', 'notes_he', 'notes_en'];
const ITEM_FIELDS = ['position', 'description_he', 'description_en', 'qty', 'unit_price'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k] === '' ? null : obj[k]]));

// ---- Settings ----
export const getSettings = async () => ok(await sb.from('settings').select('*').single());
export const saveSettings = async (patch) => ok(await sb.from('settings').update(patch).eq('id', true).select('*').single());
export const markBackup = async () => ok(await sb.rpc('mark_backup'));
export const backupStatus = async () => ok(await sb.from('v_backup_status').select('*').single());

// ---- Clients ----
export const listClients = async () => ok(await sb.from('clients').select('*').order('display_name'));
export const getClient = async (id) => ok(await sb.from('clients').select('*').eq('id', id).single());
export async function saveClient(c) {
  const row = pick(c, ['display_name', 'legal_name', 'identifier', 'contact', 'email', 'address', 'notes']);
  return c.id
    ? ok(await sb.from('clients').update(row).eq('id', c.id).select('*').single())
    : ok(await sb.from('clients').insert(row).select('*').single());
}
export const deleteClient = async (id) => ok(await sb.from('clients').delete().eq('id', id));

// ---- Projects ----
export const listProjects = async () => ok(await sb.from('projects').select('*').order('created_at', { ascending: false }));
export const getProject = async (id) => ok(await sb.from('projects').select('*').eq('id', id).single());
export async function saveProject(p) {
  const row = pick(p, ['client_id', 'description', 'total', 'currency', 'payment_terms']);
  return p.id
    ? ok(await sb.from('projects').update(row).eq('id', p.id).select('*').single())
    : ok(await sb.from('projects').insert(row).select('*').single());
}
export const deleteProject = async (id) => ok(await sb.from('projects').delete().eq('id', id));

// ---- Documents ----
export async function listDocuments({ kind, status, clientId, projectId, limit } = {}) {
  let q = sb.from('v_documents_recent').select('*');
  if (kind) q = q.eq('kind', kind);
  if (status) q = q.eq('status', status);
  if (clientId) q = q.eq('client_id', clientId);
  if (projectId) q = q.eq('project_id', projectId);
  if (limit) q = q.limit(limit);
  return ok(await q);
}
export const getDocument = async (id) => ok(await sb.from('documents').select('*').eq('id', id).single());
export const getItems = async (id) => ok(await sb.from('document_items').select('*').eq('document_id', id).order('position'));
export const childDocuments = async (invoiceId) =>
  ok(await sb.from('v_documents_recent').select('*').eq('parent_id', invoiceId));
export const invoiceBalance = async (id) => ok(await sb.from('v_invoice_balances').select('*').eq('id', id).maybeSingle());
export const quoteStatus = async (id) => ok(await sb.from('v_quote_status').select('*').eq('id', id).maybeSingle());

export async function createDraft(fields, items = []) {
  const doc = ok(await sb.from('documents').insert(pick(fields, DOC_FIELDS)).select('*').single());
  if (items.length) {
    ok(await sb.from('document_items').insert(items.map((it, i) => ({ ...pick(it, ITEM_FIELDS), position: i, document_id: doc.id }))));
  }
  return doc;
}

// Saves a draft and its lines: changed lines are updated, new ones inserted, removed ones deleted,
// so the audit log records what actually changed.
export async function saveDraft(id, fields, items, previousItems = []) {
  const doc = ok(await sb.from('documents').update(pick(fields, DOC_FIELDS)).eq('id', id).select('*').single());
  if (doc.kind === 'receipt') return doc;
  const keep = new Set(items.filter((it) => it.id).map((it) => it.id));
  const removed = previousItems.filter((p) => !keep.has(p.id)).map((p) => p.id);
  if (removed.length) ok(await sb.from('document_items').delete().in('id', removed));
  for (const [i, it] of items.entries()) {
    const row = { ...pick(it, ITEM_FIELDS), position: i };
    if (it.id) {
      const before = previousItems.find((p) => p.id === it.id);
      const same = before && ITEM_FIELDS.every((k) => String(before[k] ?? '') === String(row[k] ?? '')
        || (['qty', 'unit_price'].includes(k) && Number(before[k]) === Number(row[k])));
      if (!same) ok(await sb.from('document_items').update(row).eq('id', it.id));
    } else {
      ok(await sb.from('document_items').insert({ ...row, document_id: id }));
    }
  }
  return doc;
}
export const deleteDraft = async (id) => ok(await sb.from('documents').delete().eq('id', id));

export const issuePreview = async (id) => ok(await sb.rpc('issue_preview', { p_id: id }));
export const issueDocument = async (id) => ok(await sb.rpc('issue_document', { p_id: id }));
export const duplicateDocument = async (id) => ok(await sb.rpc('duplicate_document', { p_id: id }));
export const convertQuote = async (id) => ok(await sb.rpc('convert_quote_to_invoice', { p_quote_id: id }));
export const createReceipt = async (invoiceId, { amount, method, paymentDate, labelHe, labelEn }) =>
  ok(await sb.rpc('create_receipt_from_invoice', {
    p_invoice_id: invoiceId, p_amount: amount, p_method: method, p_payment_date: paymentDate,
    p_label_he: labelHe || null, p_label_en: labelEn || null,
  }));

// A credit note starts as a draft copy of the invoice's lines; edit it down to what is credited.
export async function createCreditNote(invoice) {
  const items = await getItems(invoice.id);
  return createDraft({ kind: 'credit_note', client_id: invoice.client_id, project_id: invoice.project_id,
    parent_id: invoice.id, currency: invoice.currency }, items);
}

// ---- Dashboard ----
export async function dashboard() {
  const [recent, open, monthly, yearly, backup] = await Promise.all([
    listDocuments({ limit: 8 }),
    sb.from('v_client_open_balance').select('*').order('open_balance', { ascending: false }).then(ok),
    sb.from('v_received_monthly').select('*').order('month', { ascending: false }).limit(48).then(ok),
    sb.from('v_received_yearly').select('*').order('year', { ascending: false }).then(ok),
    backupStatus(),
  ]);
  return { recent, open, monthly, yearly, backup };
}

// ---- Export ----
export async function issuedForYear(year) {
  return ok(await sb.from('v_documents_recent').select('*').eq('status', 'issued')
    .gte('issue_date', `${year}-01-01`).lte('issue_date', `${year}-12-31`));
}
// Every row of every table. Supabase returns at most 1000 rows per request, so read in pages.
export async function fullBackup() {
  const tables = ['settings', 'clients', 'projects', 'documents', 'document_items', 'audit_log'];
  const PAGE = 1000;
  const out = {};
  for (const t of tables) {
    out[t] = [];
    for (let from = 0; ; from += PAGE) {
      const rows = ok(await sb.from(t).select('*').order('id').range(from, from + PAGE - 1));
      out[t].push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}
