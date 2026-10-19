// One project: client, description, total, currency, payment terms; its documents.
import { getProject, saveProject, deleteProject, listClients, listDocuments } from '../api.js';
import { e, options, CURRENCIES, toast, explainError, withBusy, confirmDialog, guard, parseAmount, empty } from '../ui.js';
import { docRows } from './documents.js';

export default async function (el, [id], query) {
  const isNew = id === 'new';
  const [p, clients] = await Promise.all([isNew ? {} : getProject(id), listClients()]);
  const docs = isNew ? [] : await listDocuments({ projectId: id });
  const active = clients.filter((c) => !c.archived_at || c.id === p.client_id);
  if (!active.length) {
    el.innerHTML = `<div class="page">${empty('קודם לקוח', 'פרויקט שייך ללקוח.', '<a class="pill pill-cyan" href="#/clients/new">לקוח חדש</a>')}</div>`;
    return;
  }
  const clientId = p.client_id || query.get('client') || active[0].id;

  el.innerHTML = `<div class="page page-narrow">
    <header class="page-head"><p class="eyebrow"><a href="#/projects">פרויקטים</a></p>
      <h1 class="display page-title">${isNew ? 'פרויקט חדש' : e(p.description)}</h1></header>
    <form class="form card" id="project-form" novalidate>
      <div class="field"><label for="p-client">לקוח</label>
        <select id="p-client" name="client_id">${options(active.map((c) => [c.id, c.display_name]), clientId)}</select></div>
      <div class="field"><label for="p-desc">תיאור</label>
        <textarea id="p-desc" name="description" rows="2" required>${e(p.description || '')}</textarea>
        <p class="hint">התיאור הופך לשורה הראשונה בחשבון או בהצעה שיוצאים מהפרויקט.</p></div>
      <div class="field-row">
        <div class="field"><label for="p-total">סכום כולל <span class="muted">(לא חובה)</span></label>
          <input id="p-total" name="total" inputmode="decimal" dir="ltr" value="${p.total != null ? Number(p.total).toFixed(2) : ''}"></div>
        <div class="field"><label for="p-cur">מטבע</label>
          <select id="p-cur" name="currency">${options(CURRENCIES.map((c) => [c, c]), p.currency || 'ILS')}</select></div>
        <div class="field"><label for="p-terms">תנאי תשלום <span class="muted">(לא חובה)</span></label>
          <input id="p-terms" name="payment_terms" dir="ltr" list="terms-list" value="${e(p.payment_terms || '')}" placeholder="50/50">
          <datalist id="terms-list"><option value="100"><option value="50/50"><option value="30/70"><option value="30/30/40"></datalist>
          <p class="hint">50/50 נותן לקבלות את התוויות "מקדמה 1 מתוך 2" ו"תשלום 2 מתוך 2".</p></div>
      </div>
      <div class="form-actions">
        <button class="pill pill-cyan" type="submit" id="save">${isNew ? 'הוספה' : 'שמירה'}</button>
        ${isNew ? '' : `<a class="pill pill-ghost" href="#/new?project=${e(id)}&kind=invoice">חשבון מהפרויקט</a>
          <a class="pill pill-ghost" href="#/new?project=${e(id)}&kind=quote">הצעת מחיר מהפרויקט</a>
          <button class="linklike danger" type="button" id="remove">מחיקה</button>`}
      </div>
    </form>
    ${isNew ? '' : `<section class="section"><div class="section-head"><h2>מסמכים בפרויקט</h2></div>${docs.length ? docRows(docs) : empty('אין עדיין מסמכים בפרויקט')}</section>`}
  </div>`;

  const form = el.querySelector('#project-form');
  form.addEventListener('input', () => { guard.dirty = true; });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const description = form.description.value.trim();
    const total = parseAmount(form.total.value);
    if (!description) { toast('חסר תיאור.', { error: true }); return; }
    if (Number.isNaN(total) || (total !== null && total < 0)) { toast('הסכום לא תקין.', { error: true }); return; }
    withBusy(el.querySelector('#save'), 'שומר', async () => {
      try {
        const saved = await saveProject({ id: isNew ? undefined : id, client_id: form.client_id.value, description, total,
          currency: form.currency.value, payment_terms: form.payment_terms.value.trim() || null });
        guard.dirty = false;
        toast(isNew ? 'הפרויקט נוסף.' : 'נשמר.');
        if (isNew) location.hash = `#/projects/${saved.id}`;
      } catch (err) { toast(explainError(err), { error: true }); }
    });
  });
  el.querySelector('#remove')?.addEventListener('click', async () => {
    if (!(await confirmDialog('למחוק את הפרויקט?', '<p>אפשר למחוק פרויקט רק אם אין בו מסמכים.</p>', 'מחיקה', { danger: true }))) return;
    try { await deleteProject(id); guard.dirty = false; toast('הפרויקט נמחק.'); location.hash = '#/projects'; } catch (err) { toast(explainError(err), { error: true }); }
  });
}
