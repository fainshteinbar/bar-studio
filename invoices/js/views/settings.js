// Settings: supplier details, the optional identifier, every legal text, defaults. No code changes needed.
import { getSettings, saveSettings } from '../api.js';
import { logout } from '../app.js';
import { e, d, options, CURRENCIES, toast, explainError, withBusy, guard } from '../ui.js';

export default async function (el) {
  const s = await getSettings();
  const text = (k, label, { dir = 'ltr', lang = 'en', hint = '', rows = 0 } = {}) => `
    <div class="field"><label for="s-${k}">${label}</label>
      ${rows ? `<textarea id="s-${k}" name="${k}" rows="${rows}" dir="${dir}" lang="${lang}">${e(s[k] || '')}</textarea>`
        : `<input id="s-${k}" name="${k}" dir="${dir}" lang="${lang}" value="${e(s[k] || '')}">`}
      ${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;

  el.innerHTML = `<div class="page page-narrow">
    <header class="page-head"><p class="eyebrow">הגדרות</p><h1 class="display page-title">הגדרות</h1>
      <p class="page-sub">שינויים כאן חלים על מסמכים שיונפקו מעכשיו. מסמך שכבר הונפק שומר את מה שהיה בו ברגע ההנפקה.</p></header>
    <form class="form" id="settings-form" novalidate>
      <section class="card">
        <h2 class="card-title">פרטי הספק <span class="muted">(באנגלית, כמו במסמך)</span></h2>
        ${text('supplier_name', 'Name')}
        ${text('trading_as', 'Trading as', { hint: 'מופיע במסמך כ-"trading as bfain.studio".' })}
        ${text('supplier_address', 'Address', { rows: 3, hint: 'הכתובת נשמרת רק כאן, ב-Supabase. היא לא בקוד ולא בריפו.' })}
        ${text('supplier_email', 'Email')}
        ${text('supplier_phone', 'Phone')}
      </section>
      <section class="card">
        <h2 class="card-title">מספר מזהה</h2>
        <label class="switch"><input type="checkbox" name="show_identifier"${s.show_identifier ? ' checked' : ''}><span>להציג מספר מזהה במסמכים</span></label>
        <p class="hint">כבוי כברירת מחדל. גם כשהוא מופעל, שדה ריק לא מוצג.</p>
        <div class="field-row">${text('identifier_label', 'Label')}${text('identifier_value', 'Value')}</div>
      </section>
      <section class="card">
        <h2 class="card-title">טקסטים משפטיים</h2>
        ${text('footer_text', 'Footer (every document)', { rows: 3, hint: 'הצהרת ספק זר. מופיעה בתחתית כל מסמך.' })}
        ${text('payment_terms_text', 'Payment terms (invoices)', { rows: 2 })}
        ${text('quote_terms_text', 'Terms (quotes)', { rows: 2 })}
        ${text('notes_default_he', 'הערה קבועה למסמכים חדשים', { dir: 'rtl', lang: 'he', rows: 2 })}
        ${text('notes_default_en', 'Default note for new documents', { rows: 2 })}
      </section>
      <section class="card">
        <h2 class="card-title">ברירות מחדל</h2>
        <div class="field-row">
          <div class="field"><label for="s-cur">מטבע</label><select id="s-cur" name="default_currency">${options(CURRENCIES.map((c) => [c, c]), s.default_currency)}</select></div>
          <div class="field"><label for="s-due">ימים לתשלום</label><input id="s-due" name="default_due_days" inputmode="numeric" dir="ltr" value="${e(s.default_due_days)}"></div>
          <div class="field"><label for="s-valid">תוקף הצעה (ימים)</label><input id="s-valid" name="default_quote_valid_days" inputmode="numeric" dir="ltr" value="${e(s.default_quote_valid_days)}"></div>
        </div>
      </section>
      <div class="actionbar"><button class="pill pill-cyan" type="submit" id="save">שמירה</button></div>
    </form>
    <section class="section">
      <div class="section-head"><h2>ייצוא וגיבוי</h2></div>
      <p class="muted">גיבוי אחרון: ${s.last_backup_at ? d(s.last_backup_at.slice(0, 10)) : 'עוד לא'}</p>
      <a class="pill pill-ghost" href="#/export">ייצוא לרואת החשבון וגיבוי</a>
    </section>
    <section class="section">
      <button class="linklike" type="button" id="signout">יציאה מהחשבון</button>
    </section>
  </div>`;

  const form = el.querySelector('#settings-form');
  form.addEventListener('input', () => { guard.dirty = true; });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const due = Number(f.get('default_due_days'));
    const valid = Number(f.get('default_quote_valid_days'));
    if (!Number.isInteger(due) || due < 0 || due > 365 || !Number.isInteger(valid) || valid < 0 || valid > 365) {
      toast('מספר הימים חייב להיות מספר שלם בין 0 ל-365.', { error: true }); return;
    }
    if (!String(f.get('supplier_name')).trim()) { toast('חסר שם הספק.', { error: true }); return; }
    const patch = { show_identifier: form.show_identifier.checked, default_currency: f.get('default_currency'), default_due_days: due, default_quote_valid_days: valid };
    for (const k of ['supplier_name', 'trading_as', 'supplier_address', 'supplier_email', 'supplier_phone', 'identifier_label', 'identifier_value',
      'footer_text', 'payment_terms_text', 'quote_terms_text', 'notes_default_he', 'notes_default_en']) {
      patch[k] = String(f.get(k) ?? '').trim() || null;
    }
    withBusy(el.querySelector('#save'), 'שומר', async () => {
      try { await saveSettings(patch); guard.dirty = false; toast('ההגדרות נשמרו.'); } catch (err) { toast(explainError(err), { error: true }); }
    });
  });
  el.querySelector('#signout').addEventListener('click', () => logout());
}
