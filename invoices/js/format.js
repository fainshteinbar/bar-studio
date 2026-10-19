// Formatting for documents and the app. Pure functions, no dependencies.
// Numbers, dates and money are always returned for display inside an LTR-isolated element.

const moneyFormats = new Map();

// 9400 or "9400.00" (Postgres numeric arrives as a string) -> "₪9,400.00"
export function money(value, currency = 'ILS') {
  if (value === null || value === undefined || value === '') return '';
  let f = moneyFormats.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    moneyFormats.set(currency, f);
  }
  return f.format(Number(value));
}

// "2026-10-18" (or a Date) -> "18.10.2026". Date-only strings are read as calendar dates, never shifted by time zone.
export function date(value) {
  if (!value) return '';
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}

// 1 -> "1", 2.5 -> "2.5", "1.000" -> "1"
export function qty(value) {
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

// "INV-2026-0012" -> "0012"
export function sequence(number) {
  const m = /-(\d{4,})$/.exec(number || '');
  return m ? m[1] : '';
}

export const CURRENCY_NAMES = { ILS: 'ILS ₪', USD: 'USD $', EUR: 'EUR €', THB: 'THB ฿' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
