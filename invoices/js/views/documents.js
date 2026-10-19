// All documents, newest first, filtered by kind or drafts, searchable by number or client.
import { listDocuments } from '../api.js';
import { e, m, d, chip, KIND, empty } from '../ui.js';

const FILTERS = [
  ['', 'הכול'], ['draft', 'טיוטות'], ['invoice', 'חשבונות'], ['receipt', 'קבלות'], ['credit_note', 'זיכויים'], ['quote', 'הצעות'],
];

// Shared row list (dashboard, client page, project page use it too).
export function docRows(rows) {
  return `<ul class="rows">${rows.map((r) => `
    <li><a class="row" href="#/doc/${e(r.id)}">
      <span class="row-kind">${e(KIND[r.kind].short)}</span>
      <span class="row-main">
        <span class="row-title">${r.number ? `<bdi class="num">${e(r.number)}</bdi>` : '<span class="muted">טיוטה</span>'} · ${e(r.client_name)}</span>
        <span class="row-sub">${r.issue_date ? d(r.issue_date) : 'ללא תאריך'}${r.label_he ? ` · ${e(r.label_he)}` : ''}${r.parent_number ? ` · בגין <bdi class="num">${e(r.parent_number)}</bdi>` : ''}</span>
      </span>
      <span class="row-end">${m(r.display_amount, r.currency)}${chip(r.kind, r.display_status)}</span>
    </a></li>`).join('')}</ul>`;
}

export default async function (el, [filter = '']) {
  const all = await listDocuments();
  el.innerHTML = `<div class="page">
    <header class="page-head">
      <p class="eyebrow">מסמכים</p>
      <h1 class="display page-title">כל המסמכים</h1>
      <div class="page-actions"><a class="pill pill-cyan" href="#/new">מסמך חדש</a></div>
    </header>
    <div class="toolbar">
      <nav class="chips" aria-label="סינון">${FILTERS.map(([v, label]) =>
        `<a class="filter${v === filter ? ' is-on' : ''}" href="#/docs${v ? `/${v}` : ''}"${v === filter ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
      <input class="search" type="search" placeholder="חיפוש לפי מספר או לקוח" aria-label="חיפוש">
    </div>
    <div id="list"></div>
  </div>`;
  const list = el.querySelector('#list');
  const search = el.querySelector('.search');
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = all.filter((r) => (filter === 'draft' ? r.status === 'draft' : !filter || r.kind === filter))
      .filter((r) => !q || (r.number || '').toLowerCase().includes(q) || (r.client_name || '').toLowerCase().includes(q));
    list.innerHTML = rows.length ? docRows(rows) : empty(q ? 'לא נמצא מסמך' : 'אין כאן מסמכים עדיין');
  };
  search.addEventListener('input', draw);
  draw();
}
