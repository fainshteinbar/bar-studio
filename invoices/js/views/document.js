// One document. A draft opens in the editor with a live A4 preview; an issued document is read-only,
// with its actions (PDF, duplicate, receipt from an invoice, credit note, quote to invoice).
import * as api from '../api.js';
import { mountPreview } from '../preview.js';
import { liveSnapshot } from '../snapshot.js';
import { money, date as fmtDate, qty as fmtQty } from '../format.js';
import {
  e, m, d, n, chip, KIND, METHOD, CURRENCIES, options, toast, explainError, withBusy, openDialog, confirmDialog,
  parseAmount, paymentParts, today, guard,
} from '../ui.js';
import { docRows } from './documents.js';

const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const printUrl = (id, print) => `print.html?id=${encodeURIComponent(id)}${print ? '&print=1' : ''}`;

export default async function (el, [id]) {
  const doc = await api.getDocument(id);
  const [items, settings, clients, projects] = await Promise.all([api.getItems(id), api.getSettings(), api.listClients(), api.listProjects()]);
  const parent = doc.parent_id ? await api.getDocument(doc.parent_id) : null;
  const parentBal = parent ? await api.invoiceBalance(parent.id) : null;
  const source = doc.source_id ? await api.getDocument(doc.source_id).catch(() => null) : null;
  const ctx = { doc, items, settings, clients, projects, parent, parentBal, source };
  return doc.status === 'issued' ? issuedView(el, ctx) : draftView(el, ctx);
}

// ================= Issued: read-only =================
async function issuedView(el, { doc, items, parent, projects }) {
  const k = KIND[doc.kind];
  const client = doc.snapshot?.client || {};
  const [bal, children, quote] = await Promise.all([
    doc.kind === 'invoice' ? api.invoiceBalance(doc.id) : null,
    doc.kind === 'invoice' ? api.childDocuments(doc.id) : [],
    doc.kind === 'quote' ? api.quoteStatus(doc.id) : null,
  ]);
  const status = bal?.invoice_status || quote?.quote_status || 'issued';
  const open = bal ? Number(bal.balance) : 0;

  el.innerHTML = `<div class="page page-wide">
    <header class="page-head">
      <p class="eyebrow">${e(k.he)} · <span lang="en">${e(k.en)}</span></p>
      <h1 class="display page-title"><bdi class="num">${e(doc.number)}</bdi></h1>
      <p class="page-sub">${e(client.legal_name || client.display_name || '')} · ${d(doc.issue_date)} · ${m(doc.amount, doc.currency)} ${chip(doc.kind, status)}</p>
    </header>
    <div class="doc-layout">
      <div class="doc-preview" id="preview"></div>
      <aside class="doc-side">
        <div class="side-actions">
          <a class="pill pill-cyan" href="${printUrl(doc.id, true)}" target="_blank" rel="noopener">הורדת PDF</a>
          ${doc.kind === 'invoice' && open > 0 && status !== 'cancelled' ? '<button class="pill pill-ink" type="button" id="receipt">קבלה על תשלום</button>' : ''}
          ${doc.kind === 'quote' ? '<button class="pill pill-ink" type="button" id="convert">המרה לחשבון</button>' : ''}
          <button class="pill pill-ghost" type="button" id="duplicate">שכפול כטיוטה חדשה</button>
          ${doc.kind === 'invoice' && status !== 'cancelled' ? '<button class="pill pill-ghost" type="button" id="credit">הודעת זיכוי</button>' : ''}
        </div>
        ${bal ? `<dl class="facts">
          <div><dt>סכום החשבון</dt><dd>${m(bal.amount, doc.currency)}</dd></div>
          <div><dt>שולם</dt><dd>${m(bal.paid, doc.currency)}</dd></div>
          ${Number(bal.credited) ? `<div><dt>זוכה</dt><dd>${m(bal.credited, doc.currency)}</dd></div>` : ''}
          <div class="is-strong"><dt>יתרה לתשלום</dt><dd>${m(bal.balance, doc.currency)}</dd></div>
          ${doc.due_date ? `<div><dt>לתשלום עד</dt><dd>${d(doc.due_date)}${bal.is_overdue ? ' <span class="warn">באיחור</span>' : ''}</dd></div>` : ''}
        </dl>` : ''}
        ${quote ? `<dl class="facts"><div><dt>בתוקף עד</dt><dd>${d(quote.valid_until)}</dd></div>
          ${quote.invoice_number ? `<div><dt>חשבון</dt><dd><bdi class="num">${e(quote.invoice_number)}</bdi></dd></div>` : ''}</dl>` : ''}
        ${parent ? `<p class="side-note">בגין <a href="#/doc/${e(parent.id)}"><bdi class="num">${e(parent.number)}</bdi></a></p>` : ''}
        <p class="side-note muted">מסמך שהונפק נעול: אי אפשר לערוך או למחוק אותו. תיקון נעשה בהודעת זיכוי.</p>
        ${doc.kind === 'invoice' ? `<div class="side-children"><h2>קבלות וזיכויים</h2>${children.length ? docRows(children) : '<p class="muted">עוד אין.</p>'}</div>` : ''}
      </aside>
    </div>
  </div>`;

  const preview = mountPreview(el.querySelector('#preview'));
  preview.update({ ...doc, items });

  const act = (sel, label, fn) => el.querySelector(sel)?.addEventListener('click', (ev) => withBusy(ev.currentTarget, label, async () => {
    try { await fn(); } catch (err) { toast(explainError(err), { error: true }); }
  }));
  act('#duplicate', 'משכפל', async () => { const c = await api.duplicateDocument(doc.id); location.hash = `#/doc/${c.id}`; });
  act('#convert', 'ממיר', async () => { const c = await api.convertQuote(doc.id); location.hash = `#/doc/${c.id}`; });
  act('#credit', 'יוצר', async () => { const c = await api.createCreditNote(doc); location.hash = `#/doc/${c.id}`; });
  el.querySelector('#receipt')?.addEventListener('click', () => receiptDialog(doc, bal, projects));
  return () => preview.destroy();
}

// One click from an invoice: amount (suggested from the payment terms), method, the date the money arrived.
async function receiptDialog(invoice, bal, projects) {
  const project = projects.find((p) => p.id === invoice.project_id);
  const parts = paymentParts(project?.payment_terms);
  const balance = Number(bal.balance);
  const suggested = parts ? Math.min(balance, Math.round((Number(invoice.amount) / parts) * 100) / 100) : balance;
  await openDialog({
    title: 'קבלה על תשלום',
    body: `<p class="muted">בגין <bdi class="num">${e(invoice.number)}</bdi> · יתרה פתוחה ${m(balance, invoice.currency)}</p>
      <div class="form">
        <div class="field"><label for="r-amount">סכום שהתקבל (${e(invoice.currency)})</label>
          <input id="r-amount" inputmode="decimal" dir="ltr" value="${suggested.toFixed(2)}"></div>
        <div class="field"><label for="r-method">אמצעי תשלום</label>
          <select id="r-method">${options(Object.entries(METHOD), 'bank_transfer')}</select></div>
        <div class="field"><label for="r-date">תאריך קבלת התשלום</label>
          <input id="r-date" type="date" value="${today()}" dir="ltr"></div>
        <div class="field-row">
          <div class="field"><label for="r-he">תווית</label><input id="r-he" placeholder="תוצע לפי תנאי התשלום"></div>
          <div class="field"><label for="r-en" lang="en">Label</label><input id="r-en" dir="ltr" lang="en" placeholder="Suggested from the terms"></div>
        </div>
        <p class="dialog-error" role="alert" hidden></p>
      </div>`,
    actions: [
      { label: 'ביטול', kind: 'ghost', value: '' },
      { label: 'יצירת טיוטת קבלה', kind: 'primary', onClick: (dlg, btn) => withBusy(btn, 'יוצר', async () => {
        const err = dlg.querySelector('.dialog-error');
        const amount = parseAmount(dlg.querySelector('#r-amount').value);
        const paymentDate = dlg.querySelector('#r-date').value;
        if (!(amount > 0)) { err.hidden = false; err.textContent = 'סכום חייב להיות גדול מאפס.'; return undefined; }
        if (!paymentDate) { err.hidden = false; err.textContent = 'חסר תאריך קבלת התשלום.'; return undefined; }
        try {
          const r = await api.createReceipt(invoice.id, { amount, method: dlg.querySelector('#r-method').value, paymentDate,
            labelHe: dlg.querySelector('#r-he').value.trim(), labelEn: dlg.querySelector('#r-en').value.trim() });
          location.hash = `#/doc/${r.id}`;
          return r.id;
        } catch (e2) { err.hidden = false; err.textContent = explainError(e2); return undefined; }
      }) },
    ],
  });
}

// ================= Draft: editor + live preview =================
function draftView(el, { doc, items, settings, clients, projects, parent, parentBal, source }) {
  const k = KIND[doc.kind];
  const hasLines = doc.kind !== 'receipt';
  const pickable = doc.kind === 'invoice' || doc.kind === 'quote';
  const state = {
    client_id: doc.client_id, project_id: doc.project_id || '', currency: doc.currency,
    issue_date: doc.issue_date || '', due_date: doc.due_date || '', valid_until: doc.valid_until || '',
    notes_he: doc.notes_he || '', notes_en: doc.notes_en || '',
    amount: doc.amount ?? '', payment_method: doc.payment_method || 'bank_transfer', payment_date: doc.payment_date || '',
    label_he: doc.label_he || '', label_en: doc.label_en || '',
    items: items.map((it) => ({ id: it.id, description_he: it.description_he || '', description_en: it.description_en || '', qty: fmtQty(it.qty), unit_price: Number(it.unit_price).toFixed(2) })),
  };
  let saved = structuredClone(items);
  if (hasLines && !state.items.length) state.items.push({ description_he: '', description_en: '', qty: '1', unit_price: '' });

  const clientName = (cid) => clients.find((c) => c.id === cid)?.display_name || '';
  const lineTotal = (it) => { const q = parseAmount(it.qty); const p = parseAmount(it.unit_price); return (q > 0 && p >= 0) ? Math.round(q * p * 100) / 100 : 0; };
  const sum = () => (hasLines ? state.items.reduce((a, it) => a + lineTotal(it), 0) : Number(parseAmount(state.amount) || 0));

  el.innerHTML = `<div class="page page-wide">
    <header class="page-head">
      <p class="eyebrow">${e(k.he)} · <span lang="en">${e(k.en)}</span></p>
      <h1 class="display page-title">טיוטה</h1>
      <p class="page-sub">${chip(doc.kind, 'draft')} עדיין בלי מספר. המספר נקבע ברגע ההנפקה.</p>
    </header>
    <div class="doc-layout">
      <form class="form doc-form" id="draft" novalidate>
        <section class="card">
          <h2 class="card-title">${doc.kind === 'receipt' ? 'התקבל מאת' : 'לקוח'}</h2>
          ${pickable ? `
            <div class="field"><label for="f-client">לקוח</label>
              <select id="f-client" data-k="client_id">${options(clients.filter((c) => !c.archived_at || c.id === state.client_id).map((c) => [c.id, c.display_name]), state.client_id)}</select></div>
            <div class="field"><label for="f-project">פרויקט <span class="muted">(לא חובה)</span></label><select id="f-project" data-k="project_id"></select></div>`
          : `<p class="fixed">${e(clientName(state.client_id))}${parent ? ` · בגין <a href="#/doc/${e(parent.id)}"><bdi class="num">${e(parent.number || 'טיוטה')}</bdi></a>` : ''}</p>`}
        </section>

        <section class="card">
          <h2 class="card-title">תאריכים${pickable ? ' ומטבע' : ''}</h2>
          <div class="field-row">
            <div class="field"><label for="f-issue">תאריך הנפקה</label>
              <input id="f-issue" type="date" data-k="issue_date" value="${e(state.issue_date)}" dir="ltr">
              <p class="hint">ריק: התאריך של יום ההנפקה.</p></div>
            ${doc.kind === 'invoice' ? `<div class="field"><label for="f-due">לתשלום עד</label>
              <input id="f-due" type="date" data-k="due_date" value="${e(state.due_date)}" dir="ltr">
              <p class="hint">ריק: ${n(settings.default_due_days)} ימים מההנפקה.</p></div>` : ''}
            ${doc.kind === 'quote' ? `<div class="field"><label for="f-valid">בתוקף עד</label>
              <input id="f-valid" type="date" data-k="valid_until" value="${e(state.valid_until)}" dir="ltr">
              <p class="hint">ריק: ${n(settings.default_quote_valid_days)} ימים מההנפקה.</p></div>` : ''}
            ${pickable ? `<div class="field"><label for="f-cur">מטבע</label>
              <select id="f-cur" data-k="currency">${options(CURRENCIES.map((c) => [c, c]), state.currency)}</select></div>` : ''}
          </div>
        </section>

        ${doc.kind === 'receipt' ? `<section class="card">
          <h2 class="card-title">התשלום</h2>
          ${parentBal ? `<p class="muted">יתרה פתוחה בחשבון: ${m(parentBal.balance, doc.currency)}</p>` : ''}
          <div class="field-row">
            <div class="field"><label for="f-amount">סכום שהתקבל (${e(doc.currency)})</label>
              <input id="f-amount" data-k="amount" inputmode="decimal" dir="ltr" value="${e(state.amount === '' ? '' : Number(state.amount).toFixed(2))}"></div>
            <div class="field"><label for="f-method">אמצעי תשלום</label>
              <select id="f-method" data-k="payment_method">${options(Object.entries(METHOD), state.payment_method)}</select></div>
            <div class="field"><label for="f-paid">תאריך קבלת התשלום</label>
              <input id="f-paid" type="date" data-k="payment_date" value="${e(state.payment_date)}" dir="ltr">
              <p class="hint">יכול להיות לפני תאריך החשבון (מקדמה).</p></div>
          </div>
          <div class="field-row">
            <div class="field"><label for="f-lhe">תווית</label><input id="f-lhe" data-k="label_he" value="${e(state.label_he)}" placeholder="מקדמה 1 מתוך 2"></div>
            <div class="field"><label for="f-len" lang="en">Label</label><input id="f-len" data-k="label_en" value="${e(state.label_en)}" dir="ltr" lang="en" placeholder="Advance payment 1 of 2"></div>
          </div>
        </section>` : ''}

        ${hasLines ? `<section class="card">
          <h2 class="card-title">שורות</h2>
          <ol class="items" id="items"></ol>
          <button class="pill pill-ghost pill-sm" type="button" id="add-line">+ שורה</button>
          <p class="sum">סה״כ <span id="sum"></span></p>
        </section>` : ''}

        <section class="card">
          <h2 class="card-title">הערות <span class="muted">(לא חובה)</span></h2>
          <div class="field"><label for="f-nhe">בעברית</label><textarea id="f-nhe" data-k="notes_he" rows="2">${e(state.notes_he)}</textarea></div>
          <div class="field"><label for="f-nen" lang="en">In English</label><textarea id="f-nen" data-k="notes_en" rows="2" dir="ltr" lang="en">${e(state.notes_en)}</textarea></div>
        </section>

        <div class="actionbar">
          <button class="pill pill-cyan" type="button" id="issue">הנפקה</button>
          <button class="pill pill-ghost" type="button" id="save">שמירה</button>
          <button class="pill pill-ghost preview-toggle" type="button" id="toggle-preview" aria-controls="preview" aria-expanded="false">תצוגה מקדימה</button>
          <span class="save-state muted" id="save-state" aria-live="polite"></span>
          <button class="linklike danger" type="button" id="delete">מחיקת הטיוטה</button>
        </div>
      </form>
      <div class="doc-preview" id="preview"></div>
    </div>
  </div>`;

  const form = el.querySelector('#draft');
  const saveState = el.querySelector('#save-state');
  const setDirty = (v) => { guard.dirty = v; saveState.textContent = v ? 'יש שינויים שלא נשמרו' : ''; };

  // Project list follows the chosen client
  const projectSel = el.querySelector('#f-project');
  const fillProjects = () => {
    if (!projectSel) return;
    const mine = projects.filter((p) => p.client_id === state.client_id);
    projectSel.innerHTML = `<option value="">ללא פרויקט</option>${options(mine.map((p) => [p.id, p.description]), state.project_id)}`;
    if (!mine.some((p) => p.id === state.project_id)) state.project_id = '';
  };
  fillProjects();

  // Lines
  const itemsEl = el.querySelector('#items');
  const drawItems = () => {
    if (!itemsEl) return;
    itemsEl.innerHTML = state.items.map((it, i) => `<li class="item" data-i="${i}">
      <span class="item-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <div class="field"><label for="d-he-${i}">תיאור</label><textarea id="d-he-${i}" data-ik="description_he" rows="2">${e(it.description_he)}</textarea></div>
      <div class="field"><label for="d-en-${i}" lang="en">Description</label><textarea id="d-en-${i}" data-ik="description_en" rows="2" dir="ltr" lang="en">${e(it.description_en)}</textarea></div>
      <div class="item-nums">
        <div class="field"><label for="d-q-${i}">כמות</label><input id="d-q-${i}" data-ik="qty" inputmode="decimal" dir="ltr" value="${e(it.qty)}"></div>
        <div class="field"><label for="d-p-${i}">מחיר יחידה</label><input id="d-p-${i}" data-ik="unit_price" inputmode="decimal" dir="ltr" value="${e(it.unit_price)}"></div>
        <p class="item-total"><span class="muted">סכום</span> <span data-total>${m(lineTotal(it), state.currency)}</span></p>
      </div>
      ${state.items.length > 1 ? `<button class="icon-btn" type="button" data-remove aria-label="מחיקת שורה ${i + 1}">×</button>` : ''}
    </li>`).join('');
  };
  const drawSum = () => { const s = el.querySelector('#sum'); if (s) s.innerHTML = m(sum(), state.currency); };
  drawItems(); drawSum();

  // Preview
  const preview = mountPreview(el.querySelector('#preview'));
  let timer = null;
  const paint = () => {
    const client = clients.find((c) => c.id === state.client_id);
    const project = projects.find((p) => p.id === state.project_id);
    const lines = hasLines ? state.items.filter((it) => it.description_he.trim() || it.description_en.trim() || parseAmount(it.unit_price))
      .map((it) => ({ ...it, qty: parseAmount(it.qty) || 0, unit_price: parseAmount(it.unit_price) || 0, line_total: lineTotal(it) })) : [];
    preview.update({
      kind: doc.kind, status: 'draft', number: null, currency: state.currency,
      issue_date: state.issue_date || null, due_date: state.due_date || null, valid_until: state.valid_until || null,
      payment_method: state.payment_method, payment_date: state.payment_date || null,
      label_he: state.label_he, label_en: state.label_en, notes_he: state.notes_he, notes_en: state.notes_en,
      amount: hasLines ? null : parseAmount(state.amount), items: lines,
      snapshot: liveSnapshot({ kind: doc.kind, settings, client, project, parent, parentBalance: parentBal, source, amount: parseAmount(state.amount) }),
    });
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(paint, 180); };
  paint();

  form.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.k) state[t.dataset.k] = t.value;
    if (t.dataset.ik) {
      const li = t.closest('.item');
      const it = state.items[Number(li.dataset.i)];
      it[t.dataset.ik] = t.value;
      li.querySelector('[data-total]').innerHTML = m(lineTotal(it), state.currency);
      drawSum();
    }
    if (t.dataset.k === 'client_id') fillProjects();
    if (t.dataset.k === 'project_id') {
      const p = projects.find((x) => x.id === state.project_id);
      if (p && p.currency !== state.currency) { state.currency = p.currency; el.querySelector('#f-cur').value = p.currency; }
    }
    if (t.dataset.k === 'currency' || t.dataset.k === 'amount') { drawItems(); drawSum(); }
    setDirty(true);
    schedule();
  });
  el.querySelector('#add-line')?.addEventListener('click', () => {
    state.items.push({ description_he: '', description_en: '', qty: '1', unit_price: '' });
    drawItems(); drawSum(); setDirty(true); schedule();
    el.querySelector(`#d-he-${state.items.length - 1}`)?.focus();
  });
  itemsEl?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-remove]');
    if (!btn) return;
    state.items.splice(Number(btn.closest('.item').dataset.i), 1);
    drawItems(); drawSum(); setDirty(true); schedule();
  });
  el.querySelector('#toggle-preview').addEventListener('click', (ev) => {
    const on = el.querySelector('.doc-layout').classList.toggle('show-preview');
    ev.currentTarget.setAttribute('aria-expanded', String(on));
    ev.currentTarget.textContent = on ? 'חזרה לעריכה' : 'תצוגה מקדימה';
    if (on) el.querySelector('#preview').scrollIntoView({ block: 'start' });
  });

  // Validation shared by save and issue (the database checks everything again).
  function collect() {
    const problems = [];
    const fields = {
      client_id: state.client_id, project_id: state.project_id || null, currency: state.currency,
      issue_date: state.issue_date || null, due_date: state.due_date || null, valid_until: state.valid_until || null,
      notes_he: state.notes_he.trim() || null, notes_en: state.notes_en.trim() || null,
    };
    if (doc.kind === 'receipt') {
      const a = parseAmount(state.amount);
      if (Number.isNaN(a)) problems.push('הסכום לא תקין.');
      Object.assign(fields, { amount: a, payment_method: state.payment_method, payment_date: state.payment_date || null,
        label_he: state.label_he.trim() || null, label_en: state.label_en.trim() || null });
    }
    const lines = [];
    if (hasLines) {
      state.items.forEach((it, i) => {
        const blank = !it.description_he.trim() && !it.description_en.trim() && !String(it.unit_price).trim();
        if (blank) return;
        const q = parseAmount(it.qty); const p = parseAmount(it.unit_price);
        if (!it.description_he.trim() && !it.description_en.trim()) problems.push(`בשורה ${i + 1} חסר תיאור.`);
        if (!(q > 0)) problems.push(`בשורה ${i + 1} הכמות לא תקינה.`);
        if (p === null || Number.isNaN(p) || p < 0) problems.push(`בשורה ${i + 1} המחיר לא תקין.`);
        lines.push({ id: it.id, description_he: it.description_he.trim() || null, description_en: it.description_en.trim() || null, qty: q, unit_price: p });
      });
    }
    return { fields, lines, problems };
  }

  async function save({ quiet = false } = {}) {
    const { fields, lines, problems } = collect();
    if (problems.length) { toast(problems[0], { error: true }); return false; }
    try {
      await api.saveDraft(doc.id, fields, lines, saved);
      saved = await api.getItems(doc.id);
      state.items = hasLines ? saved.map((it) => ({ id: it.id, description_he: it.description_he || '', description_en: it.description_en || '', qty: fmtQty(it.qty), unit_price: Number(it.unit_price).toFixed(2) })) : [];
      if (hasLines && !state.items.length) state.items.push({ description_he: '', description_en: '', qty: '1', unit_price: '' });
      drawItems(); drawSum();
      setDirty(false);
      if (!quiet) toast('הטיוטה נשמרה.');
      return true;
    } catch (err) { toast(explainError(err), { error: true }); return false; }
  }

  el.querySelector('#save').addEventListener('click', (ev) => withBusy(ev.currentTarget, 'שומר', () => save()));

  el.querySelector('#delete').addEventListener('click', async () => {
    if (!(await confirmDialog('למחוק את הטיוטה?', '<p>הטיוטה תימחק. היא עוד לא קיבלה מספר, אז שום מספור לא נפגע.</p>', 'מחיקה', { danger: true }))) return;
    try { await api.deleteDraft(doc.id); guard.dirty = false; toast('הטיוטה נמחקה.'); location.hash = '#/docs'; } catch (err) { toast(explainError(err), { error: true }); }
  });

  // Issue: the button locks on the first click; the confirm button in the dialog locks until the server answers.
  el.querySelector('#issue').addEventListener('click', (ev) => withBusy(ev.currentTarget, 'בודק', async () => {
    if (guard.dirty && !(await save({ quiet: true }))) return;
    let pv;
    try { pv = await api.issuePreview(doc.id); } catch (err) { toast(explainError(err), { error: true }); return; }
    const issueOn = pv.issue_date;
    const blocked = pv.min_issue_date && issueOn < pv.min_issue_date;
    const amount = money(pv.amount, state.currency);
    const body = blocked
      ? `<p>תאריך ההנפקה ${n(fmtDate(issueOn))} מוקדם מ-${n(fmtDate(pv.min_issue_date))}.</p>
         <p class="muted">${doc.kind === 'receipt' || doc.kind === 'credit_note' ? 'מסמך לא יכול להיות מתוארך לפני החשבון שלו, ו' : ''}המספור נשאר בסדר כרונולוגי, ולכן אפשר להנפיק מ-${n(fmtDate(pv.min_issue_date))} והלאה.</p>`
      : `<p>המסמך יקבל את המספר <strong>${n(pv.next_number)}</strong>, בתאריך <strong>${n(fmtDate(issueOn))}</strong>, על סך <strong>${n(amount)}</strong>.</p>
         <p class="muted">אחרי ההנפקה הוא ננעל: אי אפשר לערוך או למחוק אותו. תיקון נעשה בהודעת זיכוי.</p>`;
    await openDialog({
      title: `הנפקת ${k.he}`,
      body: `${body}<p class="dialog-error" role="alert" hidden></p>`,
      actions: [
        { label: 'ביטול', kind: 'ghost', value: '' },
        blocked
          ? { label: `להנפיק בתאריך ${fmtDate(pv.min_issue_date)}`, kind: 'primary', onClick: (dlg, btn) => withBusy(btn, 'מעדכן', async () => {
              state.issue_date = pv.min_issue_date;
              el.querySelector('#f-issue').value = pv.min_issue_date;
              setDirty(true);
              return (await save({ quiet: true })) ? 'date-fixed' : undefined;
            }) }
          : { label: 'הנפקה', kind: 'primary', onClick: (dlg, btn) => withBusy(btn, 'מנפיק', async () => {
              try {
                const issued = await api.issueDocument(doc.id);
                guard.dirty = false;
                toast(`הונפק ${issued.number}.`);
                return issued.number;
              } catch (err) {
                const box = dlg.querySelector('.dialog-error');
                box.hidden = false;
                box.textContent = explainError(err);
                return undefined;
              }
            }) },
      ],
    }).then((result) => {
      // Ask again with the corrected date, once this button's own lock has been released.
      if (result === 'date-fixed') setTimeout(() => el.querySelector('#issue')?.click(), 0);
      else if (result && result !== '') reload();
    });
  }));

  return () => { clearTimeout(timer); preview.destroy(); };
}

