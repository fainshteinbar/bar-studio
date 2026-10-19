// Sample documents for the design review (print.html?demo=invoice|receipt|quote|credit_note).
// Every value here is invented: the client "דוגמה בע״מ", the amounts, the supplier address.
// The real supplier address is typed in the app's Settings and lives only in Supabase.

const supplier = {
  name: 'Bar Fainshtein',
  trading_as: 'bfain.studio',
  address: '88 Sample Lane, Bangkok 10110, Thailand',
  email: 'fainshteinbar@gmail.com',
  phone: '053-622-4344',
  identifier: null,
};
const client = {
  display_name: 'דוגמה',
  legal_name: 'דוגמה בע״מ',
  identifier: null,
  contact: 'ישראל ישראלי',
  address: 'רחוב הדוגמה 12, תל אביב',
  email: 'office@example.com',
};
const project = { description: 'סרטון השקה למוצר חדש', payment_terms: '50/50', total: 9400 };
const footer_text = 'Issued by a service provider resident outside Israel. Services performed outside Israel. No Israeli VAT charged.';

const items = [
  { description_he: 'קונספט ותסריט לסרטון ההשקה', description_en: 'Launch film concept and script', qty: 1, unit_price: 2500, line_total: 2500 },
  { description_he: 'הפקת סרטון AI באורך 30 שניות, אנכי ורוחבי, כולל קריינות ומוזיקה', description_en: 'AI video production, 30 seconds, vertical and horizontal, with voice-over and music', qty: 1, unit_price: 6000, line_total: 6000 },
  { description_he: 'סבב תיקונים נוסף', description_en: 'Additional revision round', qty: 2, unit_price: 450, line_total: 900 },
];

export const DEMO = {
  invoice: {
    kind: 'invoice', status: 'issued', number: 'INV-2026-0012', currency: 'ILS', amount: 9400,
    issue_date: '2026-10-18', due_date: '2026-11-01',
    notes_he: 'תודה על שיתוף הפעולה.', notes_en: 'Thank you for working with us.',
    items,
    snapshot: { supplier, client, project, footer_text, terms_text: 'Payment by bank transfer. Bank details are sent separately on request.' },
  },
  receipt: {
    kind: 'receipt', status: 'issued', number: 'REC-2026-0005', currency: 'ILS', amount: 4700,
    issue_date: '2026-10-18', payment_date: '2026-10-16', payment_method: 'bank_transfer',
    label_he: 'מקדמה 1 מתוך 2', label_en: 'Advance payment 1 of 2',
    items: [],
    snapshot: {
      supplier, client, project, footer_text,
      parent: { number: 'INV-2026-0012', issue_date: '2026-10-18', amount: 9400 },
      balance: { invoice_total: 9400, credited: 0, paid_before: 0, paid_now: 4700, open_after: 4700 },
    },
  },
  quote: {
    kind: 'quote', status: 'issued', number: 'QUO-2026-0003', currency: 'ILS', amount: 9400,
    issue_date: '2026-10-10', valid_until: '2026-11-09',
    notes_he: 'כולל שני סבבי תיקונים. סבב נוסף לפי הצורך.', notes_en: 'Includes two revision rounds. Further rounds as needed.',
    items,
    snapshot: { supplier, client, project, footer_text, terms_text: 'Valid for 30 days. 50% on approval, 50% on delivery.' },
  },
  credit_note: {
    kind: 'credit_note', status: 'issued', number: 'CRN-2026-0001', currency: 'ILS', amount: 900,
    issue_date: '2026-10-20',
    notes_he: 'ביטול סבב התיקונים הנוסף.', notes_en: 'Additional revision round cancelled.',
    items: [items[2]],
    snapshot: { supplier, client, project, footer_text, parent: { number: 'INV-2026-0012', issue_date: '2026-10-18', amount: 9400 } },
  },
};
