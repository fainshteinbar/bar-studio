// One client: details form, their projects and documents.
import { getClient, saveClient, deleteClient, listProjects, listDocuments } from '../api.js';
import { e, m, toast, explainError, withBusy, confirmDialog, guard, empty } from '../ui.js';
import { docRows } from './documents.js';

export default async function (el, [id], query) {
  const isNew = id === 'new';
  const c = isNew ? {} : await getClient(id);
  const [projects, docs] = isNew ? [[], []] : await Promise.all([listProjects(), listDocuments({ clientId: id })]);
  const mine = projects.filter((p) => p.client_id === id);
  const field = (k, label, { dir = 'auto', textarea = false, hint = '', required = false, type = 'text' } = {}) => `
    <div class="field"><label for="c-${k}">${label}${required ? '' : ' <span class="muted">(לא חובה)</span>'}</label>
      ${textarea ? `<textarea id="c-${k}" name="${k}" rows="3" dir="${dir}">${e(c[k] || '')}</textarea>`
        : `<input id="c-${k}" name="${k}" type="${type}" dir="${dir}" value="${e(c[k] || '')}"${required ? ' required' : ''}>`}
      ${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;

  el.innerHTML = `<div class="page page-narrow">
    <header class="page-head"><p class="eyebrow"><a href="#/clients">לקוחות</a></p>
      <h1 class="display page-title">${isNew ? 'לקוח חדש' : e(c.display_name)}</h1></header>
    <form class="form card" id="client-form" novalidate>
      ${field('display_name', 'שם תצוגה', { required: true, hint: 'איך הלקוח מופיע ברשימות שלך.' })}
      ${field('legal_name', 'שם משפטי', { hint: 'אם מולא, הוא השם שמופיע על המסמך.' })}
      ${field('identifier', 'מספר מזהה', { dir: 'ltr' })}
      ${field('contact', 'איש קשר')}
      ${field('email', 'אימייל', { dir: 'ltr', type: 'email' })}
      ${field('address', 'כתובת', { textarea: true })}
      ${field('notes', 'הערות פנימיות', { textarea: true, hint: 'לא מופיעות על המסמכים.' })}
      <div class="form-actions">
        <button class="pill pill-cyan" type="submit" id="save">${isNew ? 'הוספה' : 'שמירה'}</button>
        ${isNew ? '' : `<a class="pill pill-ghost" href="#/new?client=${e(id)}">מסמך חדש ללקוח</a>`}
        ${isNew ? '' : '<button class="linklike danger" type="button" id="remove">מחיקה</button>'}
      </div>
    </form>
    ${isNew ? '' : `
      <section class="section"><div class="section-head"><h2>פרויקטים</h2><a class="linklike" href="#/projects/new?client=${e(id)}">פרויקט חדש</a></div>
        ${mine.length ? `<ul class="rows">${mine.map((p) => `<li><a class="row" href="#/projects/${e(p.id)}"><span class="row-main"><span class="row-title">${e(p.description)}</span><span class="row-sub">${e(p.payment_terms || '')}</span></span><span class="row-end">${p.total != null ? m(p.total, p.currency) : ''}</span></a></li>`).join('')}</ul>` : '<p class="muted">אין פרויקטים.</p>'}</section>
      <section class="section"><div class="section-head"><h2>מסמכים</h2></div>
        ${docs.length ? docRows(docs) : empty('אין מסמכים ללקוח הזה')}</section>`}
  </div>`;

  const form = el.querySelector('#client-form');
  form.addEventListener('input', () => { guard.dirty = true; });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    if (!data.display_name.trim()) { toast('חסר שם תצוגה.', { error: true }); form.display_name.focus(); return; }
    for (const k of Object.keys(data)) data[k] = data[k].trim();
    withBusy(el.querySelector('#save'), 'שומר', async () => {
      try {
        const saved = await saveClient({ ...data, id: isNew ? undefined : id });
        guard.dirty = false;
        toast(isNew ? 'הלקוח נוסף.' : 'נשמר.');
        if (isNew) location.hash = query.get('then') === 'new' ? `#/new?client=${saved.id}` : `#/clients/${saved.id}`;
      } catch (err) { toast(explainError(err), { error: true }); }
    });
  });
  el.querySelector('#remove')?.addEventListener('click', async () => {
    if (!(await confirmDialog('למחוק את הלקוח?', '<p>אפשר למחוק לקוח רק אם אין לו מסמכים או פרויקטים.</p>', 'מחיקה', { danger: true }))) return;
    try { await deleteClient(id); guard.dirty = false; toast('הלקוח נמחק.'); location.hash = '#/clients'; } catch (err) { toast(explainError(err), { error: true }); }
  });
}
