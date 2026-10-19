// Clients: the list.
import { listClients } from '../api.js';
import { e, empty } from '../ui.js';

export default async function (el) {
  const clients = await listClients();
  const row = (c) => `<li><a class="row" href="#/clients/${e(c.id)}">
      <span class="row-main"><span class="row-title">${e(c.display_name)}${c.archived_at ? ' <span class="chip chip-cancelled">בארכיון</span>' : ''}</span>
      <span class="row-sub">${[c.legal_name, c.contact, c.email].filter(Boolean).map((x) => `<span dir="auto">${e(x)}</span>`).join(' · ') || '&nbsp;'}</span></span>
    </a></li>`;
  el.innerHTML = `<div class="page">
    <header class="page-head"><p class="eyebrow">לקוחות</p><h1 class="display page-title">לקוחות</h1>
      <div class="page-actions"><a class="pill pill-cyan" href="#/clients/new">לקוח חדש</a></div></header>
    ${clients.length ? `<ul class="rows">${clients.map(row).join('')}</ul>` : empty('עוד אין לקוחות', 'רק שם תצוגה הוא חובה. כל השאר אפשר להשלים אחר כך.', '<a class="pill pill-cyan" href="#/clients/new">לקוח חדש</a>')}
  </div>`;
}
