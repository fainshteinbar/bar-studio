// The document kit: one renderer for Invoice, Payment Receipt, Credit Note and Quote.
// Same parts for every kind (header, title, parties and dates, lines, totals, notes, legal footer),
// configured per kind. Used by print.html (PDF) and by the app's preview.
//
// Input: a documents row plus its lines. Issued documents carry `snapshot` (frozen at issue);
// for drafts the app builds the same shape from live settings and client data.
// Never prints anything that suggests an Israeli registered dealer: no VAT lines, no tax-invoice
// wording, no dealer or allocation numbers. The supplier block and the foreign-supplier line are English.
import { money, date, qty, sequence, escapeHtml as e } from './format.js';

export const KINDS = {
  invoice: {
    he: 'חשבון לתשלום', en: 'Invoice',
    party: ['לכבוד', 'Billed to'],
    total: ['סה״כ לתשלום', 'Total due'],
  },
  receipt: {
    he: 'קבלה', en: 'Payment receipt',
    party: ['התקבל מאת', 'Received from'],
  },
  credit_note: {
    he: 'הודעת זיכוי', en: 'Credit note',
    party: ['לכבוד', 'Issued to'],
    total: ['סה״כ זיכוי', 'Total credit'],
  },
  quote: {
    he: 'הצעת מחיר', en: 'Quote',
    party: ['עבור', 'Prepared for'],
    total: ['סה״כ', 'Total'],
  },
};

export const METHODS = {
  bank_transfer: ['העברה בנקאית', 'Bank transfer'],
  cash: ['מזומן', 'Cash'],
  other: ['אחר', 'Other'],
};

// Bilingual label: Hebrew first, English second, smaller.
const label = (he, en, cls = '') =>
  `<span class="lbl ${cls}"><span class="lbl-he">${e(he)}</span><span class="lbl-en" lang="en" dir="ltr">${e(en)}</span></span>`;
// Numbers, dates and money: always an isolated LTR run inside the RTL page.
const n = (text, cls = '') => `<bdi class="num ${cls}" dir="ltr">${e(text)}</bdi>`;
const lines = (...xs) => xs.filter((x) => x && String(x).trim()).map((x) => `<span dir="auto">${e(x)}</span>`).join('');

function supplierBlock(s) {
  const id = s.identifier && String(s.identifier.value || '').trim()
    ? `<span>${e(s.identifier.label || 'ID')}: ${e(s.identifier.value)}</span>` : '';
  return `<address class="supplier" dir="ltr" lang="en">
    <strong>${e(s.name)}</strong>
    ${s.trading_as ? `<span>trading as ${e(s.trading_as)}</span>` : ''}
    ${lines(s.address)}
    ${s.email ? `<span>${e(s.email)}</span>` : ''}
    ${s.phone ? `<span>${e(s.phone)}</span>` : ''}
    ${id}
  </address>`;
}

function clientBlock(c, kind) {
  const name = c.legal_name || c.display_name;
  return `<div class="cell cell-party">
    ${label(...KINDS[kind].party)}
    <p class="party-name" dir="auto">${e(name)}</p>
    <p class="party-lines">${lines(
      c.identifier && `${c.identifier}`,
      c.contact, c.address, c.email)}</p>
  </div>`;
}

function metaCells(d) {
  const cell = (he, en, value) => `<div class="cell">${label(he, en)}<p class="cell-value">${value}</p></div>`;
  const issue = cell('תאריך הנפקה', 'Issue date', d.issue_date ? n(date(d.issue_date)) : '<span class="muted">בעת ההנפקה</span>');
  const currency = cell('מטבע', 'Currency', n(d.currency));
  switch (d.kind) {
    case 'invoice':
      return issue + cell('לתשלום עד', 'Due date', d.due_date ? n(date(d.due_date)) : '<span class="muted">לפי ההגדרות</span>') + currency;
    case 'quote':
      return issue + cell('בתוקף עד', 'Valid until', d.valid_until ? n(date(d.valid_until)) : '<span class="muted">לפי ההגדרות</span>') + currency;
    case 'credit_note':
      return issue + cell('בגין חשבון', 'For invoice', n(d.snapshot?.parent?.number || '')) + currency;
    case 'receipt': {
      const m = METHODS[d.payment_method] || ['', ''];
      return issue
        + cell('תאריך קבלת התשלום', 'Payment received on', n(date(d.payment_date)))
        + `<div class="cell">${label('אמצעי תשלום', 'Payment method')}<p class="cell-value">${label(m[0], m[1], 'lbl-value')}</p></div>`;
    }
  }
  return '';
}

function itemsTable(d) {
  const rows = (d.items || []).map((it, i) => `
    <tr>
      <td class="c-idx">${n(String(i + 1).padStart(2, '0'))}</td>
      <td class="c-desc">
        ${it.description_he ? `<span class="desc-he">${e(it.description_he)}</span>` : ''}
        ${it.description_en ? `<span class="desc-en" lang="en" dir="ltr">${e(it.description_en)}</span>` : ''}
      </td>
      <td class="c-num c-qty">${n(qty(it.qty))}</td>
      <td class="c-num">${n(money(it.unit_price, d.currency))}</td>
      <td class="c-num c-amount">${n(money(it.line_total ?? Number(it.qty) * Number(it.unit_price), d.currency))}</td>
    </tr>`).join('');
  return `<table class="items">
    <thead><tr>
      <th class="c-idx"></th>
      <th class="c-desc">${label('תיאור', 'Description')}</th>
      <th class="c-num c-qty">${label('כמות', 'Qty')}</th>
      <th class="c-num">${label('מחיר יחידה', 'Unit price')}</th>
      <th class="c-num">${label('סכום', 'Amount')}</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function totalBlock(d) {
  const sum = d.amount ?? (d.items || []).reduce((a, it) => a + Number(it.line_total ?? Number(it.qty) * Number(it.unit_price)), 0);
  return `<section class="total">
    ${label(...KINDS[d.kind].total, 'lbl-total')}
    <p class="total-amount display">${n(money(sum, d.currency))}</p>
  </section>`;
}

function receiptBlock(d) {
  const b = d.snapshot?.balance || {};
  const p = d.snapshot?.parent || {};
  const row = (he, en, value, cls = '') => `<div class="ledger-row ${cls}"><dt>${label(he, en)}</dt><dd>${n(money(value, d.currency))}</dd></div>`;
  const hasLabel = d.label_he || d.label_en;
  return `<section class="paid">
    <div class="paid-main">
      ${hasLabel ? `<p class="pill">${d.label_he ? `<span>${e(d.label_he)}</span>` : ''}${d.label_he && d.label_en ? '<span class="pill-sep" aria-hidden="true">·</span>' : ''}${d.label_en ? `<span lang="en" dir="ltr">${e(d.label_en)}</span>` : ''}</p>` : ''}
      ${label('התקבל', 'Received', 'lbl-total')}
      <p class="paid-amount display">${n(money(d.amount, d.currency))}</p>
      ${p.number ? `<p class="paid-ref">${label('בגין חשבון', 'For invoice', 'lbl-inline')} ${n(p.number)}${p.issue_date ? ` <span class="muted">·</span> ${n(date(p.issue_date))}` : ''}</p>` : ''}
    </div>
    <dl class="ledger">
      ${row('סכום החשבון', 'Invoice total', b.invoice_total)}
      ${Number(b.credited) > 0 ? row('זוכה', 'Credited', b.credited) : ''}
      ${row('שולם קודם', 'Paid before', b.paid_before)}
      ${row('תשלום זה', 'This payment', b.paid_now ?? d.amount)}
      ${row('יתרה לתשלום', 'Balance due', b.open_after, 'is-strong')}
    </dl>
  </section>`;
}

function notesBlock(d) {
  const s = d.snapshot || {};
  const blocks = [];
  if (s.project?.description) {
    blocks.push(`<div class="note">${label('פרויקט', 'Project')}<p dir="auto">${e(s.project.description)}</p>${s.project.payment_terms
      ? `<p class="note-sub">${label('חלוקת תשלומים', 'Payment split', 'lbl-inline')} ${n(s.project.payment_terms)}</p>` : ''}</div>`);
  }
  if (d.notes_he || d.notes_en) {
    blocks.push(`<div class="note">${label('הערות', 'Notes')}${d.notes_he ? `<p>${e(d.notes_he)}</p>` : ''}${d.notes_en ? `<p class="note-en" lang="en" dir="ltr">${e(d.notes_en)}</p>` : ''}</div>`);
  }
  if (s.terms_text) {
    const [he, en] = d.kind === 'quote' ? ['תנאים', 'Terms'] : ['תנאי תשלום', 'Payment terms'];
    blocks.push(`<div class="note">${label(he, en)}<p dir="auto">${e(s.terms_text)}</p></div>`);
  }
  return blocks.length ? `<section class="notes">${blocks.join('')}</section>` : '';
}

export function renderDocument(d, { assets = './assets/' } = {}) {
  const k = KINDS[d.kind];
  const s = d.snapshot || {};
  const draft = d.status !== 'issued';
  const seq = draft ? '' : sequence(d.number);
  return `<article class="doc doc-${d.kind}${draft ? ' is-draft' : ''}" lang="he" dir="rtl">
  ${draft ? '<div class="watermark" aria-hidden="true">DRAFT</div>' : ''}
  <header class="head">
    <img class="logo" src="${e(assets)}img/bfain-logo-light-bg.svg" alt="bfain.studio" width="164" height="81">
    ${supplierBlock(s.supplier || {})}
  </header>

  <section class="title">
    <div class="title-text">
      <p class="eyebrow" lang="en" dir="ltr">${e(k.en)}</p>
      <h1 class="h1 display">${e(k.he)}</h1>
      <p class="docno">${draft ? '<span class="draft-tag">טיוטה · DRAFT</span>' : n(d.number)}</p>
    </div>
    <p class="seq display" aria-hidden="true">${draft ? '' : e(seq)}</p>
  </section>

  <section class="meta">
    ${clientBlock(s.client || {}, d.kind)}
    ${metaCells(d)}
  </section>

  ${d.kind === 'receipt' ? receiptBlock(d) : itemsTable(d) + totalBlock(d)}

  ${notesBlock(d)}

  <footer class="foot">
    ${s.footer_text ? `<p class="foot-legal" lang="en" dir="ltr">${e(s.footer_text)}</p>` : '<span></span>'}
    <p class="foot-brand" lang="en" dir="ltr">bfain.studio<i class="dot" aria-hidden="true"></i></p>
  </footer>
</article>`;
}

export function documentTitle(d) {
  const k = KINDS[d.kind];
  return d.status === 'issued' ? `${d.number} · bfain.studio` : `${k.en} DRAFT · bfain.studio`;
}
