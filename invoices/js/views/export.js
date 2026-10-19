// Export: annual CSV for the accountant, full JSON backup.
import { backupStatus, listDocuments } from '../api.js';
import { downloadYearCsv, downloadFullBackup } from '../backup.js';
import { d, n, options, toast, explainError, withBusy } from '../ui.js';

export default async function (el) {
  const [docs, b] = await Promise.all([listDocuments({ status: 'issued' }), backupStatus()]);
  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear, ...docs.map((x) => Number((x.issue_date || '').slice(0, 4))).filter(Boolean)])].sort((a, z) => z - a);

  el.innerHTML = `<div class="page page-narrow">
    <header class="page-head"><p class="eyebrow"><a href="#/settings">הגדרות</a></p><h1 class="display page-title">ייצוא וגיבוי</h1></header>
    <section class="card">
      <h2 class="card-title">CSV שנתי לרואת החשבון</h2>
      <p class="muted">כל המסמכים שהונפקו בשנה: מספר, סוג, תאריך, לקוח, סכום, מטבע, סטטוס, ובנוסף תאריך קבלת התשלום ומספר החשבון של כל קבלה. נפתח ישירות ב-Excel, בעברית.</p>
      <div class="field-row field-row-end">
        <div class="field"><label for="year">שנה</label><select id="year">${options(years.map((y) => [y, y]), thisYear)}</select></div>
        <button class="pill pill-cyan" type="button" id="csv">הורדת CSV</button>
      </div>
    </section>
    <section class="card">
      <h2 class="card-title">גיבוי מלא</h2>
      <p class="muted">קובץ JSON אחד עם כל הנתונים: הגדרות, לקוחות, פרויקטים, מסמכים, שורות ויומן הפעולות. שמור אותו בדרייב. ב-Supabase החינמי אין גיבוי אוטומטי.</p>
      <p>גיבוי אחרון: <strong>${b.last_backup_at ? d(b.last_backup_at.slice(0, 10)) : 'עוד לא'}</strong>${b.issued_since_backup > 0 ? ` · הונפקו מאז ${n(b.issued_since_backup)} מסמכים` : ''}</p>
      <button class="pill pill-cyan" type="button" id="json">גיבוי JSON מלא</button>
    </section>
  </div>`;

  el.querySelector('#csv').addEventListener('click', (ev) => withBusy(ev.currentTarget, 'מכין', async () => {
    try {
      const count = await downloadYearCsv(el.querySelector('#year').value);
      toast(count ? `ירד קובץ עם ${count} מסמכים.` : 'אין מסמכים שהונפקו בשנה הזו. ירד קובץ עם כותרות בלבד.');
    } catch (err) { toast(explainError(err), { error: true }); }
  }));
  el.querySelector('#json').addEventListener('click', (ev) => withBusy(ev.currentTarget, 'מגבה', async () => {
    try { await downloadFullBackup(); toast('הגיבוי ירד למחשב. שמור אותו בדרייב.'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
    catch (err) { toast(explainError(err), { error: true }); }
  }));
}
