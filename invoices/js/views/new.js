// New document: an invoice or a quote, for a client (and optionally a project).
// Receipts and credit notes are created from an issued invoice, on the invoice's page.
import { listClients, listProjects, createDraft, getSettings } from '../api.js';
import { options, CURRENCIES, explainError, toast, withBusy, empty } from '../ui.js';

export default async function (el, _params, query) {
  const [clients, projects, settings] = await Promise.all([listClients(), listProjects(), getSettings()]);
  const active = clients.filter((c) => !c.archived_at);
  if (!active.length) {
    el.innerHTML = `<div class="page"><header class="page-head"><p class="eyebrow">מסמך חדש</p><h1 class="display page-title">קודם לקוח</h1></header>
      ${empty('עוד אין לקוחות', 'כל מסמך שייך ללקוח. מוסיפים לקוח, וחוזרים לכאן.', '<a class="pill pill-cyan" href="#/clients/new?then=new">לקוח חדש</a>')}</div>`;
    return;
  }
  const pre = projects.find((p) => p.id === query.get('project'));
  const kind = ['invoice', 'quote'].includes(query.get('kind')) ? query.get('kind') : 'invoice';
  const clientId = pre?.client_id || query.get('client') || active[0].id;

  el.innerHTML = `<div class="page page-narrow">
    <header class="page-head"><p class="eyebrow">מסמך חדש</p><h1 class="display page-title">מה מנפיקים?</h1></header>
    <form class="form" id="new-form">
      <fieldset class="segmented" aria-label="סוג המסמך">
        <label><input type="radio" name="kind" value="invoice"${kind === 'invoice' ? ' checked' : ''}><span>חשבון לתשלום<small lang="en">Invoice</small></span></label>
        <label><input type="radio" name="kind" value="quote"${kind === 'quote' ? ' checked' : ''}><span>הצעת מחיר<small lang="en">Quote</small></span></label>
      </fieldset>
      <div class="field"><label for="client">לקוח</label>
        <select id="client" name="client" required>${options(active.map((c) => [c.id, c.display_name]), clientId)}</select></div>
      <div class="field"><label for="project">פרויקט <span class="muted">(לא חובה)</span></label>
        <select id="project" name="project"></select>
        <p class="hint">עם פרויקט, השורה הראשונה מתמלאת מתיאור הפרויקט והסכום שלו.</p></div>
      <div class="field"><label for="currency">מטבע</label>
        <select id="currency" name="currency">${options(CURRENCIES.map((c) => [c, c]), pre?.currency || settings.default_currency)}</select></div>
      <p class="hint">קבלה והודעת זיכוי נוצרות מתוך חשבון שהונפק, בדף של החשבון.</p>
      <div class="form-actions"><button class="pill pill-cyan" type="submit" id="create">יצירת טיוטה</button></div>
    </form>
  </div>`;

  const form = el.querySelector('#new-form');
  const projectSel = form.project;
  const fillProjects = (selected) => {
    const mine = projects.filter((p) => p.client_id === form.client.value);
    projectSel.innerHTML = `<option value="">ללא פרויקט</option>${options(mine.map((p) => [p.id, p.description]), selected)}`;
  };
  fillProjects(pre?.id);
  form.client.addEventListener('change', () => fillProjects(''));
  projectSel.addEventListener('change', () => {
    const p = projects.find((x) => x.id === projectSel.value);
    if (p) form.currency.value = p.currency;
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    withBusy(el.querySelector('#create'), 'יוצר', async () => {
      const p = projects.find((x) => x.id === projectSel.value);
      const fields = {
        kind: form.kind.value, client_id: form.client.value, project_id: p?.id || null, currency: form.currency.value,
        notes_he: settings.notes_default_he || null, notes_en: settings.notes_default_en || null,
      };
      const items = p ? [{ description_he: p.description, description_en: '', qty: 1, unit_price: Number(p.total || 0) }] : [];
      try {
        const doc = await createDraft(fields, items);
        location.hash = `#/doc/${doc.id}`;
      } catch (err) { toast(explainError(err), { error: true }); }
    });
  });
}
