// Dashboard: backup reminder, what is open, what came in, the latest documents.
import { dashboard } from '../api.js';
import { downloadFullBackup } from '../backup.js';
import { e, m, n, empty, toast, explainError, withBusy } from '../ui.js';
import { docRows } from './documents.js';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export default async function (el) {
  const data = await dashboard();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthRows = data.monthly.filter((r) => r.month === thisMonth);
  const yearRows = data.yearly.filter((r) => r.year === now.getFullYear());
  const openByCurrency = Object.entries(data.open.reduce((acc, r) => { acc[r.currency] = (acc[r.currency] || 0) + Number(r.open_balance); return acc; }, {}));

  // One line per currency; never converted or added across currencies.
  const sums = (list) => (list.length ? list : [{ currency: 'ILS', value: 0 }])
    .map((r) => `<span class="kpi-value">${m(r.value, r.currency)}</span>`).join('');
  const b = data.backup;
  const banner = b?.needs_backup ? `<div class="banner" role="status">
      <div><strong>${b.last_backup_at ? 'כדאי לגבות' : 'עוד לא גיבית'}</strong>
      <p>${b.issued_since_backup > 0 ? `הונפקו ${n(b.issued_since_backup)} מסמכים מאז הגיבוי האחרון.` : `עברו ${n(b.days_since)} ימים מאז הגיבוי האחרון.`} הגיבוי נשמר אצלך כקובץ.</p></div>
      <button class="pill pill-ink pill-sm" type="button" id="backup-now">גיבוי עכשיו</button>
    </div>` : '';

  // Received per month, last 12 months, one bar group per month (per currency, no conversion).
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`);
  }
  const currencies = [...new Set(data.monthly.map((r) => r.currency))];
  const max = Math.max(1, ...data.monthly.map((r) => Number(r.received)));
  const chart = currencies.length ? currencies.map((cur) => `
    <div class="bars" role="list" aria-label="התקבל לפי חודש, ${e(cur)}">
      ${months.map((mo) => {
        const r = data.monthly.find((x) => x.month === mo && x.currency === cur);
        const v = r ? Number(r.received) : 0;
        const label = `${MONTHS[Number(mo.slice(5, 7)) - 1]} ${mo.slice(0, 4)}`;
        return `<div class="bar" role="listitem" title="${e(label)}"><span class="bar-fill" style="--h:${(v / max) * 100}%"></span>
          <span class="bar-label">${e(MONTHS[Number(mo.slice(5, 7)) - 1].slice(0, 3))}</span>
          <span class="sr-only">${e(label)}: ${v}</span></div>`;
      }).join('')}
    </div><p class="muted bars-cur">${e(cur)}</p>`).join('') : '';

  el.innerHTML = `<div class="page">
    <header class="page-head">
      <p class="eyebrow">סקירה</p>
      <h1 class="display page-title">שלום בר</h1>
    </header>
    ${banner}
    <section class="kpis" aria-label="סיכום">
      <div class="kpi"><p class="kpi-label">התקבל החודש</p>${sums(monthRows.map((r) => ({ currency: r.currency, value: r.received })))}</div>
      <div class="kpi"><p class="kpi-label">התקבל השנה</p>${sums(yearRows.map((r) => ({ currency: r.currency, value: r.received })))}</div>
      <div class="kpi"><p class="kpi-label">פתוח לגבייה</p>${sums(openByCurrency.map(([currency, value]) => ({ currency, value })))}</div>
    </section>

    <section class="section" aria-labelledby="open-title">
      <div class="section-head"><h2 id="open-title">יתרות פתוחות לפי לקוח</h2></div>
      ${data.open.length ? `<ul class="rows">${data.open.map((r) => `
        <li><a class="row" href="#/clients/${e(r.client_id)}">
          <span class="row-main"><span class="row-title">${e(r.client_name)}</span>
            <span class="row-sub">${n(r.open_invoices)} חשבונות פתוחים${Number(r.overdue_invoices) ? ` · <span class="warn">${n(r.overdue_invoices)} באיחור</span>` : ''}</span></span>
          <span class="row-end">${m(r.open_balance, r.currency)}</span>
        </a></li>`).join('')}</ul>` : empty('אין יתרות פתוחות', 'כל החשבונות שהונפקו שולמו.')}
    </section>

    <section class="section" aria-labelledby="recv-title">
      <div class="section-head"><h2 id="recv-title">התקבל לפי חודש</h2><a class="linklike" href="#/export">ייצוא לרואת החשבון</a></div>
      ${chart || empty('עוד לא התקבלו תשלומים', 'קבלות שהונפקו יופיעו כאן לפי תאריך קבלת התשלום.')}
      ${data.yearly.length ? `<ul class="rows rows-compact">${data.yearly.map((r) => `<li class="row"><span class="row-title">${n(r.year)}</span><span class="row-sub">${n(r.receipts)} קבלות</span><span class="row-end">${m(r.received, r.currency)}</span></li>`).join('')}</ul>` : ''}
    </section>

    <section class="section" aria-labelledby="recent-title">
      <div class="section-head"><h2 id="recent-title">מסמכים אחרונים</h2><a class="linklike" href="#/docs">כל המסמכים</a></div>
      ${data.recent.length ? docRows(data.recent) : empty('עוד אין מסמכים', 'מתחילים בלקוח, ואז מסמך חדש.', '<a class="pill pill-cyan pill-sm" href="#/new">מסמך חדש</a>')}
    </section>
  </div>`;

  el.querySelector('#backup-now')?.addEventListener('click', (ev) => withBusy(ev.currentTarget, 'מגבה', async () => {
    try {
      await downloadFullBackup();
      toast('הגיבוי ירד למחשב. שמור אותו בדרייב.');
      el.querySelector('.banner')?.remove();
    } catch (err) { toast(explainError(err), { error: true }); }
  }));
}

