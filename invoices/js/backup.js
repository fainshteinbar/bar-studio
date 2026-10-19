// Annual CSV for the accountant, and the full JSON backup.
import { issuedForYear, fullBackup, markBackup } from './api.js';
import { download, KIND, statusLabel, today } from './ui.js';

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const ddmmyyyy = (v) => (v ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : '');

// One row per issued document of the year (by issue date). UTF-8 with BOM so Excel shows Hebrew.
export async function downloadYearCsv(year) {
  const rows = (await issuedForYear(year)).sort((a, b) =>
    (a.issue_date || '').localeCompare(b.issue_date || '') || (a.number || '').localeCompare(b.number || ''));
  const header = ['מספר', 'סוג', 'תאריך', 'לקוח', 'סכום', 'מטבע', 'סטטוס', 'תאריך קבלת התשלום', 'בגין חשבון'];
  const lines = rows.map((r) => [
    r.number, KIND[r.kind].he, ddmmyyyy(r.issue_date), r.client_name, Number(r.display_amount).toFixed(2), r.currency,
    statusLabel(r.kind, r.display_status), ddmmyyyy(r.payment_date), r.parent_number || '',
  ].map(csvCell).join(','));
  download(`bfain-docs-${year}.csv`, `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`, 'text/csv;charset=utf-8');
  return rows.length;
}

// Everything, every table, in one file. Then the server records the backup time (the dashboard banner reads it).
export async function downloadFullBackup() {
  const tables = await fullBackup();
  const payload = { format: 'bfain-docs-backup', version: 1, exported_at: new Date().toISOString(), tables };
  download(`bfain-docs-backup-${today()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  await markBackup();
  return Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
}
