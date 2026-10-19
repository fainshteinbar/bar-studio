// Shared UI pieces: labels, small formatters, dialogs, toasts, the busy-button lock.
import { money, date, escapeHtml as e } from './format.js';

export { e, money, date };

export const KIND = {
  invoice: { he: 'חשבון לתשלום', short: 'חשבון', en: 'Invoice' },
  receipt: { he: 'קבלה', short: 'קבלה', en: 'Payment receipt' },
  credit_note: { he: 'הודעת זיכוי', short: 'זיכוי', en: 'Credit note' },
  quote: { he: 'הצעת מחיר', short: 'הצעה', en: 'Quote' },
};

export const METHOD = { bank_transfer: 'העברה בנקאית', cash: 'מזומן', other: 'אחר' };
export const CURRENCIES = ['ILS', 'USD', 'EUR', 'THB'];

// Status of a row from v_documents_recent (display_status) or a derived invoice/quote status.
export function statusLabel(kind, status) {
  if (status === 'draft') return 'טיוטה';
  if (kind === 'quote') return { open: 'פתוחה', accepted: 'אושרה', expired: 'פג תוקף' }[status] || 'הונפקה';
  return { open: 'פתוח', partially_paid: 'שולם חלקית', paid: 'שולם', cancelled: 'בוטל', issued: 'הונפק' }[status] || status;
}
export const chip = (kind, status) => `<span class="chip chip-${e(status)}">${e(statusLabel(kind, status))}</span>`;

// Numbers, dates and money inside RTL text.
export const n = (text) => `<bdi class="num">${e(text)}</bdi>`;
export const m = (value, currency) => n(money(value, currency));
export const d = (value) => (value ? n(date(value)) : '');

// Today on this device, as YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString('en-CA');

// "2,000.50" / "2000,5" / "₪ 2000" -> 2000.5; '' -> null; garbage -> NaN
export function parseAmount(text) {
  const s = String(text ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  const normalized = /,\d{1,2}$/.test(s) && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '');
  const v = Number(normalized);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}

// "50/50" -> 2, "30/30/40" -> 3 (same rule as app.payment_parts in the database)
export function paymentParts(terms) {
  return /^\s*\d+(\.\d+)?\s*%?(\s*\/\s*\d+(\.\d+)?\s*%?)+\s*$/.test(terms || '') ? terms.split('/').length : null;
}

// ---- Toasts ----
let toastRoot;
export function toast(message, { error = false } = {}) {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toasts';
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.append(toastRoot);
  }
  const t = document.createElement('div');
  t.className = `toast${error ? ' is-error' : ''}`;
  t.setAttribute('role', error ? 'alert' : 'status');
  t.textContent = message;
  toastRoot.append(t);
  while (toastRoot.children.length > 2) toastRoot.firstElementChild.remove();   // at most two at a time
  setTimeout(() => t.classList.add('is-out'), error ? 6000 : 3200);
  setTimeout(() => t.remove(), error ? 6600 : 3800);
}

// ---- Errors from Supabase / Postgres, explained in Hebrew ----
const LEADS = {
  locked: 'המסמך נעול כי כבר הונפק.',
  date_order: 'תאריך ההנפקה מוקדם מהמותר.',
  balance: 'הסכום גבוה מהיתרה הפתוחה.',
  validation: 'חסר משהו כדי להמשיך.',
  forbidden: 'אין הרשאה. נסה להיכנס מחדש.',
};
export function explainError(err) {
  if (!err) return 'משהו השתבש.';
  if (err.code === '23503') return 'אי אפשר למחוק: יש מסמכים או פרויקטים שקשורים לזה.';
  if (err.code === '42501') return LEADS.forbidden;
  if (/fetch|network|Load failed/i.test(err.message || '')) return 'אין חיבור לשרת כרגע. בדוק את האינטרנט ונסה שוב.';
  const lead = LEADS[err.hint];
  return lead ? `${lead} ${err.message || ''}`.trim() : err.message || 'משהו השתבש.';
}

// ---- Busy lock: a button that sends a request is disabled from the first click until the answer ----
export async function withBusy(button, busyLabel, fn) {
  if (!button || button.disabled) return undefined;
  const original = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${e(busyLabel)}`;
  try {
    return await fn();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = original;
    }
  }
}

// ---- Dialog ----
// openDialog({ title, body (html), actions: [{ label, kind: 'primary'|'ghost'|'danger', value, onClick(dialog, button) }] })
// Resolves with the value of the action that closed it, or null on Escape / backdrop.
export function openDialog({ title, body, actions = [], wide = false }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `dialog${wide ? ' dialog-wide' : ''}`;
    dlg.innerHTML = `<form method="dialog" class="dialog-in">
      <h2 class="dialog-title">${e(title)}</h2>
      <div class="dialog-body">${body}</div>
      <div class="dialog-actions">${actions.map((a, i) =>
        `<button type="${a.onClick ? 'button' : 'submit'}" class="pill ${a.kind === 'primary' ? 'pill-cyan' : a.kind === 'danger' ? 'pill-danger' : 'pill-ghost'}" data-i="${i}" value="${e(a.value ?? '')}">${e(a.label)}</button>`).join('')}</div>
    </form>`;
    document.body.append(dlg);
    let result = null;
    dlg.addEventListener('click', async (ev) => {
      if (ev.target === dlg) { dlg.close(); return; }
      const btn = ev.target.closest('button[data-i]');
      if (!btn) return;
      const a = actions[Number(btn.dataset.i)];
      if (a.onClick) {
        ev.preventDefault();
        const r = await a.onClick(dlg, btn);
        if (r !== undefined) { result = r; dlg.close(); }
      } else {
        result = a.value ?? null;
      }
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    dlg.querySelector('input, select, textarea')?.focus();
  });
}

export async function confirmDialog(title, bodyHtml, okLabel = 'אישור', { danger = false } = {}) {
  const v = await openDialog({ title, body: bodyHtml, actions: [
    { label: 'ביטול', kind: 'ghost', value: '' },
    { label: okLabel, kind: danger ? 'danger' : 'primary', value: 'ok' },
  ] });
  return v === 'ok';
}

// ---- Downloads ----
export function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// Options for a <select>
export const options = (list, selected) => list.map(([v, label]) =>
  `<option value="${e(v)}"${String(v) === String(selected ?? '') ? ' selected' : ''}>${e(label)}</option>`).join('');

// Empty state block
export const empty = (title, text = '', action = '') =>
  `<div class="empty"><p class="empty-title">${e(title)}</p>${text ? `<p class="muted">${e(text)}</p>` : ''}${action}</div>`;

// Unsaved-changes guard, read by the router before leaving a screen.
export const guard = { dirty: false };
