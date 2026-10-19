// Projects: the list, grouped by client.
import { listProjects, listClients } from '../api.js';
import { e, m, empty } from '../ui.js';

export default async function (el) {
  const [projects, clients] = await Promise.all([listProjects(), listClients()]);
  const name = (id) => clients.find((c) => c.id === id)?.display_name || '';
  el.innerHTML = `<div class="page">
    <header class="page-head"><p class="eyebrow">פרויקטים</p><h1 class="display page-title">פרויקטים</h1>
      <div class="page-actions"><a class="pill pill-cyan" href="#/projects/new">פרויקט חדש</a></div></header>
    ${projects.length ? `<ul class="rows">${projects.map((p) => `<li><a class="row" href="#/projects/${e(p.id)}">
        <span class="row-main"><span class="row-title">${e(p.description)}</span>
        <span class="row-sub">${e(name(p.client_id))}${p.payment_terms ? ` · תנאי תשלום <bdi class="num">${e(p.payment_terms)}</bdi>` : ''}</span></span>
        <span class="row-end">${p.total != null ? m(p.total, p.currency) : ''}</span></a></li>`).join('')}</ul>`
      : empty('עוד אין פרויקטים', 'פרויקט מחבר לקוח, סכום ותנאי תשלום, ומשם יוצאים חשבונות וקבלות.', '<a class="pill pill-cyan" href="#/projects/new">פרויקט חדש</a>')}
  </div>`;
}
