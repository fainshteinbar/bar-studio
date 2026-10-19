# bfain.studio Documents: Invoice, Payment Receipt, Credit Note, Quote

תוכנית עבודה מאושרת (2026-10-18). שלב 1 (מחקר ותכנון) הסתיים; הביצוע מתחיל משלב 2 (סעיף 6). המסמך הזה יחד עם הבריף המקורי של בר מספיקים להמשך בסשן חדש.

## 0. Context

בר פאינשטיין (Bar Fainshtein), קריאייטיב דיירקטור עצמאי, מותג bfain.studio, יושב בתאילנד ומספק שירותי וידאו וגרפיקה ב-AI ללקוחות, כולל חברות ישראליות. הוא צריך להנפיק מסמכים פיננסיים מהדפדפן (מחשב וטלפון) בלי Claude Code: Invoice, Payment Receipt, Credit Note, ועכשיו גם Quote (הצעת מחיר). האפליקציה חיה ב-`/invoices/` באתר הפורטפוליו (GitHub Pages מענף `main`, שורש הריפו, build type legacy; הריפו ציבורי). כל הנתונים ב-Supabase בלבד. המסמכים של הלקוח הראשון מחכים להזנה כטיוטות.

### החלטות שסוכמו עם בר (לא לשאול שוב)

| # | נושא | החלטה |
|---|---|---|
| 1 | הצעות מחיר | לא קיימת מערכת בריפו (נבדקו קבצים, היסטוריה, ענף `phase3`, ריפואים שכנים). **נבנית עכשיו** כסוג מסמך רביעי `QUO-2026-0001` על אותה ערכת מסמך, מספור ונעילה. |
| 2 | תאריך הנפקה | ניתן לעריכה בטיוטה. המספר לפי שנת תאריך ההנפקה. ה-DB חוסם תאריך מוקדם מהמסמך המונפק האחרון מאותו סוג ושנה; האפליקציה מסבירה לפני הלחיצה. |
| 3 | קבלה/זיכוי מול Invoice | `issue_date` של קבלה או זיכוי מוקדם מ-`issue_date` של ה-Invoice האב **נדחה**. `payment_date` מוקדם מה-Invoice **מותר** (מקדמה). |
| 4 | כתובת הספק | רק במסך ההגדרות (Supabase). לא בקוד, לא ב-seed, לא ב-README. שם, אימייל וטלפון (ציבוריים באתר) כן מגיעים כברירת מחדל. |
| 5 | שפת בלוק הספק | פרטי הספק והצהרת "ספק זר" באנגלית בלבד. שאר התוויות דו-לשוניות: עברית ראשית, אנגלית קטנה. |
| 6 | תוויות תשלום | דו-לשוניות: `label_he` "מקדמה 1 מתוך 2" / `label_en` "Advance payment 1 of 2". |
| 7 | טלפון | ברירת מחדל `053-622-4344` (כמו בבריף), ניתן לשינוי בהגדרות. |
| 8 | פרויקט Supabase אחד (2026-10-19) | **ייצור בלבד: `bfain-docs`. אין פרויקט בדיקות, ובדיקת המקביליות החיה לא רצה. זו החלטה של בר; לא להחזיר.** המספור האטומי, הנעילה והיתרה נבדקים מקומית (pglite, `npm run test:invoices`), והאפליקציה נבדקת מקצה לקצה מול שרת Supabase מקומי מדומה (`scripts/invoices-dev-server.mjs`) שמריץ את אותו SQL. אסור להנפיק מסמכי בדיקה בייצור: מספר שהונפק נשאר לתמיד. `install.sql` לעולם לא מכיל DROP. `dev/reset_test.sql`, `dev/mark_test_project.sql` ו-`test/invoices/live/` נשארים בריפו ולא בשימוש. |
| 9 | גיבוי | `settings.last_backup_at` מתעדכן בכל ייצוא JSON. באנר בדשבורד אם עברו 30 יום או אם הונפקו מסמכים אחרי הגיבוי האחרון. |
| 10 | שם | "בר פאינשטיין" בעברית, "Bar Fainshtein" באנגלית. לא "פיינשטיין". |
| 11 | טקסט | בלי קו מפריד ארוך (em dash) בשום מקום, ממשק או מסמך. מפריד "·" כמו באתר. |
| 12 | כניסה (2026-10-18) | לינק כניסה (magic link) במקום קוד: ב-Supabase החינמי אי אפשר לערוך את תבנית המייל בלי SMTP משלך. `signInWithOtp` עם `emailRedirectTo` לכתובת האפליקציה ו-`shouldCreateUser: false`, ב-PKCE flow. החזרה (`?code=`) מטופלת ב-`js/auth.js` לפני שהנתב מבוסס ה-hash מתחיל, ואחריה הכתובת מנוקה ל-`#/`. הלינק נפתח באותו דפדפן שבו ביקשו אותו. מעבר לקוד בעתיד: Gmail SMTP (ב-README). |

### אילוצים משפטיים (מחייבים)
- ספק שירות זר. לעולם לא: "חשבונית מס", מספר עוסק, מע"מ, מספר הקצאה, ת.ז., או כל רכיב שמרמז על עוסק רשום בישראל.
- ספק: "Bar Fainshtein, trading as bfain.studio", כתובת (מההגדרות), אימייל, טלפון. שדה "מספר מזהה" אופציונלי, כבוי כברירת מחדל, לא מוצג כשריק.
- Footer ברירת מחדל: "Issued by a service provider resident outside Israel. Services performed outside Israel. No Israeli VAT charged."
- מסמך מונפק נעול לצמיתות. תיקון רק דרך Credit Note. טיוטות מסומנות DRAFT ובלי מספר.

## 1. שפת העיצוב של האתר (לקריאה: `assets/css/site.css`, `assets/css/base.css`, `scripts/build.mjs`, `i18n/he.json`)

- **צבעים:** void `#07071C`, surface `#0F0E2F`, navy `#1A1464`, cream `#F4F0E8`, cyan `#00C2FF`. אפורים נגזרים מ-cream בשקיפות (dim 0.68, line 0.12, faint 0.1). האתר כהה בלבד.
- **טיפוגרפיה:** כותרות Narkiss Hadash Condensed 700/800 (Adobe kit `gce3kmw`, `https://use.typekit.net/gce3kmw.css`, נטען לא חוסם, "Narkiss Fallback" מותאם רוחב); גוף Noto Sans Hebrew (variable, `assets/fonts/noto-sans-hebrew-var-hebrew.woff2`) לעברית ו-DM Sans (`dm-sans-latin-400/600.woff2`) לאנגלית לפי unicode-range. אנגלית בכותרות ב-uppercase. eyebrow: 0.75rem, 600, letter-spacing 0.2em, cyan (בעברית 0.9rem, 0.02em).
- **צורות ומרווחים:** pills ברדיוס 100px, כרטיסים 16px עד 28px, קווים 1px ב-`--line`, ריווח ב-`clamp()`. logical properties בלבד, `:dir(rtl)`, מספרים ב-`.ltr` / `<bdi dir="ltr">` עם `unicode-bidi: isolate`.
- **תנועה:** 0.3 / 0.5 / 0.7 שניות, `--ease-move: cubic-bezier(0.7,0,0.3,1)` ו-`--ease-ui: cubic-bezier(0.23,1,0.32,1)` בלבד, reduced-motion מכובד.
- **לוגו:** `assets/img/bfain-logo-dark-bg.svg` ו-`bfain-logo-light-bg.svg` (B, f, נקודה בציאן), מוטבע כ-`<symbol>` אחרי הסרת בלוק `<metadata>`.
- **קול:** עברית קודם, משפטים קצרים, "עונה באותו יום", בלי שמות לקוחות באתר.
- **טכנולוגיה:** vanilla HTML/CSS/JS, בילד בלי תלויות (`scripts/build.mjs`, template engine משלו), שרת מקומי `node scripts/serve.mjs` על 4173 שמגיש את שורש הריפו (`.claude/launch.json`, קונפיגורציה "directions"), Playwright ו-Chrome headless לצילומים. Node 25, בלי Docker, בלי psql, בלי Supabase CLI.
- **מסמך מודפס:** תקדים `bar-resume.html` (A4, `@page`, פונטים מקומיים) בכהה. למסמכים פיננסיים: נייר בהיר (לבן), טקסט void, ציאן רק כאקצנט (נקודת הלוגו, קו דק מתחת ל-header, מספר המסמך). חוסך דיו, נראה כמסמך של סטודיו, מסתדר עם הדפסה אצל רואת החשבון. הרבה רווח לבן, היררכיה טיפוגרפית ברורה, RTL מלא, מספרים ותאריכים ומטבעות ב-LTR מבודד.

## 2. מבנה תיקיות

```
invoices/                      אפליקציה סטטית, עצמאית (נתיבים יחסיים בלבד: מעבר לסאב-דומיין = העתקת התיקייה
│                              + הוספת הכתובת ב-Supabase Auth)
├── PLAN.md                    המסמך הזה
├── README.md                  עברית: הקמת Supabase, פריסה, גיבוי, סאב-דומיין, כניסה (ומעבר לקוד עם Gmail SMTP)
├── index.html                 מעטפת SPA, ניתוב hash: #/login #/ (דשבורד) #/clients #/projects #/docs #/doc/:id #/settings #/export
├── print.html                 מסמך אחד להדפסה (?id=) → window.print() → PDF וקטורי; document.title = מספר המסמך
├── config.js                  SUPABASE_URL + SUPABASE_ANON_KEY של bfain-docs (ציבוריים בכוונה; RLS הוא השומר)
├── css/tokens.css             משתני מותג (העתק מ-site.css) + light/dark לממשק
├── css/app.css                ממשק, mobile-first
├── css/document.css           A4, @page, הדפסה; משותף לארבעת סוגי המסמכים
├── js/app.js                  ניתוב ומסכים
├── js/api.js                  supabase client, שאילתות, RPC
├── js/document.js             רנדר משותף: header ספק/לקוח, טבלת פריטים, סיכומים, footer משפטי
├── js/format.js               Intl: כסף, תאריכים dd.mm.yyyy, bidi
├── js/export.js               CSV שנתי + גיבוי JSON (מעדכן last_backup_at)
├── vendor/supabase.js         supabase-js v2, גרסה נעולה, קובץ אחד (בלי CDN בזמן ריצה)
├── assets/fonts/, assets/img/ עותקים של Noto Sans Hebrew, DM Sans והלוגו (עצמאות חשובה מכפילות של ~60KB)
└── supabase/
    ├── install.sql            הכול בקובץ אחד להדבקה ב-SQL Editor. idempotent. אין DROP. נבנה מ-migrations/ (scripts/build-install-sql.mjs)
    ├── migrations/0001..0006  schema, grants, rls, triggers, functions, views (כל קובץ idempotent, create or replace / if not exists)
    ├── seed/settings.sql      שורת settings יחידה: שם, trading as, אימייל, טלפון, טקסטים משפטיים. בלי כתובת.
    └── dev/reset_test.sql     לא בשימוש (אין פרויקט בדיקות). רץ רק בפרויקט שסומן ב-mark_test_project.sql
test/invoices/                 pglite: sql/00_supabase_stub.sql, helpers/db.mjs, *.test.mjs, live/concurrency.test.mjs (opt-in)
.github/workflows/keepalive.yml  ping שבועי קריאה-בלבד לפרויקט הייצור (מונע השהיה של פרויקט חינמי)
package.json                   devDependency @electric-sql/pglite; scripts: test:invoices, test:invoices:live, build:install-sql
```

`document.css` + `document.js` הם "ערכת המסמך": Invoice, Receipt, Credit Note ו-Quote הם ארבע קונפיגורציות של אותם רכיבים (header, טבלת פריטים, סיכומים, footer), לא ארבע תבניות.

## 3. סכמה, מספור, נעילה, RLS

### 3.1 סכמות
- `public`: טבלאות, views ו-RPCs (חשופים ל-PostgREST).
- `app`: מונים ופונקציות פנימיות. `REVOKE ALL ON SCHEMA app FROM anon, authenticated`.

### 3.2 טבלאות (`public`)

| טבלה | שדות | הערות |
|---|---|---|
| `settings` | `id boolean PK default true CHECK(id)` (singleton), `supplier_name`, `trading_as`, `supplier_address`, `supplier_email`, `supplier_phone`, `identifier_label`, `identifier_value`, `show_identifier bool default false`, `footer_text`, `payment_terms_text`, `quote_terms_text`, `notes_default_he`, `notes_default_en`, `default_currency`, `default_due_days`, `default_quote_valid_days`, `last_backup_at timestamptz`, `updated_at` | כל הטקסטים המשפטיים כאן. SELECT/UPDATE בלבד מהלקוח |
| `clients` | `id uuid`, `display_name` (חובה, לא ריק), `legal_name`, `identifier`, `contact`, `email`, `address`, `notes`, `created_at`, `updated_at`, `archived_at` | |
| `projects` | `id`, `client_id`, `description`, `total numeric(14,2)`, `currency` enum (ILS/USD/EUR/THB), `payment_terms text` ("50/50"), `created_at`, `updated_at` | |
| `documents` | `id`, `kind` enum (invoice/receipt/credit_note/quote), `status` enum (draft/issued), `number text` (NULL בטיוטה), `client_id`, `project_id`, `parent_id` + `parent_kind` (קבלה/זיכוי → Invoice; FK מורכב `(parent_id, parent_kind) → documents(id, kind)` עם `CHECK (parent_kind='invoice')`), `source_id` (מקור לשכפול או להמרה quote→invoice), `currency`, `amount numeric(14,2)` (נקבע בהנפקה), `issue_date`, `due_date`, `valid_until` (quote), `issued_at`, `payment_method` enum (bank_transfer/cash/other), `payment_date`, `label_he`, `label_en`, `notes_he`, `notes_en`, `snapshot jsonb`, `created_at`, `updated_at` | `UNIQUE (kind, number)`; CHECKs: `parent_id` רק לקבלה/זיכוי; מונפק חייב `number`, `issue_date`, `issued_at`, `amount`, `snapshot`; טיוטה חייבת `number IS NULL`; קבלה מונפקת חייבת `payment_method`, `payment_date`, `amount > 0` |
| `document_items` | `id`, `document_id` (cascade), `position`, `description_he`, `description_en` (לפחות אחד), `qty numeric(12,3) > 0`, `unit_price numeric(14,2) >= 0`, `line_total` generated `round(qty*unit_price, 2)` | אין פריטים לקבלה (טריגר) |
| `audit_log` | `id identity`, `at`, `actor_email`, `table_name`, `row_id text`, `action`, `old_row jsonb`, `new_row jsonb` | כתיבה מטריגר `SECURITY DEFINER` בלבד; UPDATE/DELETE חסומים גם ל-postgres (טריגר `deny`) |

`app.counters (kind, year) PK, last_no int`: מקור יחיד למספור, בלי policies ובלי grants. `app.migrations (name, applied_at)`: יומן הדבקות.

### 3.3 מספור אטומי (`app.next_number(kind, year)`)
`INSERT INTO app.counters VALUES (kind, year, 1) ON CONFLICT (kind, year) DO UPDATE SET last_no = counters.last_no + 1 RETURNING last_no`. פקודה אחת, נעילת שורה, עובד גם ברגע הראשון של שנה חדשה. לא sequences (לא טרנזקציוניים). המונה מתקדם באותה טרנזקציה של ההנפקה, אז אימות שנכשל מגלגל גם אותו: אין חורים. קידומות: INV, REC, CRN, QUO. פורמט `INV-2026-0001`.

### 3.4 `issue_document(p_id)` (SECURITY DEFINER, `set search_path = ''`, `app.is_owner()` בשורה הראשונה, אחרת 42501)
1. `SELECT ... FOR UPDATE` על המסמך; חייב `draft`.
2. תאריך: `issue_date` של הטיוטה (האפליקציה שולחת את תאריך המכשיר כברירת מחדל). נדחה אם מוקדם מ-`max(issue_date)` של מסמכים מונפקים מאותו סוג ושנה.
3. סכום: Invoice / Credit Note / Quote = `sum(line_total)` (חייב > 0). Receipt = `amount` שהוזן; חייב `payment_method`, `payment_date`.
4. קבלה/זיכוי: `FOR UPDATE` על ה-Invoice האב (מסדר קבלות מקבילות); האב מונפק; אותו מטבע; `issue_date` של הקבלה/זיכוי ≥ `issue_date` של האב (אחרת נדחה; `payment_date` חופשי); קבלה ≤ יתרה; זיכוי ≤ סכום האב פחות זיכויים קודמים.
5. `set_config('app.issuing', 'on', true)` (לטרנזקציה בלבד), ואז UPDATE אחד: `status='issued'`, `number`, `issued_at`, `amount`, `due_date` / `valid_until` ברירת מחדל מההגדרות אם ריקים, `snapshot` (ספק כולל מזהה רק אם `show_identifier`; לקוח; footer; תנאי תשלום או תנאי הצעה; מספר האב).
6. audit נכתב מהטריגר.

RPCs נוספים (אותם כללים): `duplicate_document(p_id)` → טיוטה חדשה מאותו סוג, פריטים מועתקים, `source_id`. `create_receipt_from_invoice(p_invoice_id, p_amount, p_method, p_payment_date, p_label_he, p_label_en)` → טיוטת קבלה; אם התוויות ריקות, מוצעות "מקדמה N מתוך M" / "Advance payment N of M" לפי מספר הקבלות הקיימות ותנאי התשלום של הפרויקט, או "תשלום מלא" / "Full payment". `convert_quote_to_invoice(p_quote_id)` → טיוטת Invoice עם הפריטים ו-`source_id` לציטוט המונפק.

### 3.5 נעילה (שלוש שכבות)
- **RLS:** UPDATE/DELETE על `documents` רק `status='draft'`, `WITH CHECK (status='draft' AND number IS NULL)` כך שהלקוח לא יכול להפוך טיוטה למונפקת. `document_items`: כתיבה רק אם האב טיוטה.
- **טריגרים BEFORE UPDATE/DELETE:** מסמך `issued` → חריגה. מעבר ל-`issued` בלי `app.issuing='on'` → חריגה. פריטים: אב מונפק → חריגה; אב קבלה → חריגה. תופס גם SECURITY DEFINER וגם את ה-SQL Editor (role `postgres` עוקף RLS, לא טריגרים).
- **CHECKs** על עקביות השדות (3.2).

### 3.6 סטטוס ויתרה (views עם `security_invoker = true`; בלי זה view עוקף RLS)
- `v_invoice_balances`: `paid` (קבלות מונפקות), `credited` (זיכויים מונפקים), `balance = amount - credited - paid`, `invoice_status`: `cancelled` אם credited ≥ amount; `paid` אם paid ≥ amount - credited; `partially_paid` אם paid > 0; אחרת `open`.
- `v_quote_status`: `accepted` אם קיים Invoice מונפק עם `source_id` = הציטוט; `expired` אם `valid_until < today`; אחרת `open`. נגזר, בלי שדה שמשתנה על מסמך נעול.
- `v_documents_recent`, `v_client_open_balance`, `v_received_monthly`, `v_received_yearly` (לפי `payment_date`, לפי מטבע, בלי המרות).
- `v_backup_status`: `last_backup_at`, `days_since`, `issued_since_backup` (count של `issued_at > last_backup_at`). הדשבורד מציג באנר אם `days_since > 30` או `issued_since_backup > 0`.

### 3.7 זהות ו-RLS
- `app.is_owner()`: `auth.jwt()->>'email' = 'fainshteinbar@gmail.com' AND auth.jwt()->>'role' = 'authenticated' AND NOT coalesce(is_anonymous, false)`. בכל policy כ-`(select app.is_owner())`. ההרשמה, כניסה אנונימית ושינוי אימייל כבויים ב-Auth (סעיף 4), אז קיים בדיוק משתמש אחד.
- כל טבלה: RLS מופעל. `REVOKE ALL FROM anon` על כל הטבלאות והפונקציות; `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM public, anon, authenticated`. RPCs: `GRANT EXECUTE TO authenticated` בלבד. `app.next_number` לא ניתן להרצה מ-`authenticated`.
- מלכודות Supabase: PostgREST מחזיר `numeric` כמחרוזת, לפרסר בצד הלקוח בלי `parseFloat` להשוואות כסף. `auth.jwt()` ריק ב-SQL Editor, אז `is_owner()` שם false (צפוי; seed רץ כ-postgres). שמות הארגומנטים של RPC הם ה-API, לא לעשות overload.

### 3.8 בדיקות
**מקומי, `npm run test:invoices` (`node --test test/invoices`, pglite):** `00_supabase_stub.sql` יוצר roles `anon`/`authenticated`, סכמת `auth` עם `auth.jwt()`/`auth.uid()` מ-`request.jwt.claims`, ואותן default privileges כמו Supabase (כדי שה-REVOKEs נבדקים). הבדיקות טוענות `migrations/*.sql` לפי סדר, אותם קבצים שמהם נבנה `install.sql`.
- **מספור:** 3 Invoices + 2 Receipts + 1 Credit Note + 1 Quote ב-2026 → `INV-2026-0001..0003`, `REC-2026-0001..0002`, `CRN-2026-0001`, `QUO-2026-0001`; תאריך 2027 → `INV-2027-0001`; הנפקה שנכשלה (בלי פריטים) לא צורכת מספר; `issue_date` מוקדם מהאחרון מאותו סוג ושנה נדחה.
- **קבלה/זיכוי מול האב:** Invoice מונפק ב-15.10 → קבלה עם `issue_date` 14.10 נדחית; קבלה עם `issue_date` 15.10 ו-`payment_date` 05.10 מתקבלת; זיכוי עם `issue_date` 14.10 נדחה.
- **נעילה:** כ-`authenticated` עם האימייל: UPDATE/DELETE על מונפק משפיעים על 0 שורות; `status='issued'` ישירות נחסם ב-WITH CHECK; INSERT פריט לאב מונפק נכשל. כ-superuser: אותן פעולות מרימות חריגה מהטריגר.
- **זהות:** אימייל אחר רואה 0 שורות ומקבל 42501 ב-RPC; `anon` מקבל permission denied; `app.next_number` לא ניתן להרצה מ-`authenticated`.
- **יתרה:** 3,000 → קבלה 1,500 → `partially_paid`, יתרה 1,500 → קבלה 1,500 → `paid`; קבלה 1,501 מול יתרה 1,500 נדחית; שתי טיוטות של 600 מול 1,000: השנייה נדחית; מטבע שונה נדחה; קבלה מול Invoice טיוטה נדחית; זיכוי מלא → `cancelled`; Quote → Invoice מונפק → `v_quote_status = accepted`.
- **snapshot:** שינוי כתובת לקוח ו-footer אחרי הנפקה לא משנה את ה-snapshot; `show_identifier=false` → אין מזהה ב-snapshot.
- **audit:** כל כתיבה שורה אחת; UPDATE/DELETE על audit_log נכשלים גם כ-authenticated וגם כ-postgres.
- **גיבוי:** `v_backup_status` מחזיר `issued_since_backup > 0` אחרי הנפקה, 0 אחרי עדכון `last_backup_at`.

**מקביליות חיה: לא רצה.** אין פרויקט בדיקות (החלטה 8). הבדיקה `test/invoices/live/concurrency.test.mjs` נשארת בריפו, ולעולם לא מריצים אותה מול `bfain-docs`.

## 4. צעדים ידניים ב-Supabase (בשפה פשוטה)

1. **פרויקט אחד (הוקם 2026-10-19):** `bfain-docs` באזור Singapore, בארגון חינמי. סיסמת מסד הנתונים במנהל הסיסמאות; האפליקציה לא צריכה אותה.
2. **Authentication → Sign In / Providers → Email:** מופעל. "Allow new users to sign up" כבוי. "Allow anonymous sign-ins" כבוי. "Secure email change" מופעל. (נבדק מבחוץ 2026-10-19: `disable_signup: true`, `anonymous_users: false`.)
3. **המשתמש היחיד:** Authentication → Users → Add user: האימייל של בר, Auto Confirm. הכניסה בלינק למייל; הסיסמה לא בשימוש.
4. **אימייל הכניסה (ייצור):** התבנית הרגילה של Supabase ל-Magic Link, בלי שינוי. אין מה לערוך.
5. **כתובות (ייצור):** Authentication → URL Configuration: Site URL `https://fainshteinbar.github.io/bar-studio/invoices/`; Redirect URLs: אותה כתובת ו-`http://localhost:4173/invoices/`. סאב-דומיין בעתיד = שורה נוספת כאן.
6. **הסכמה:** SQL Editor → `invoices/supabase/install.sql` → Run, ואז `seed/settings.sql` → Run (רצו בהצלחה 2026-10-19; שורת settings אחת). `install.sql` בטוח להרצה חוזרת ולא מוחק כלום.
7. **מפתחות:** Project URL ו-Publishable key של `bfain-docs` נכתבו ל-`invoices/config.js` דרך `node scripts/invoices-config.mjs`, שדוחה מפתח סודי. ערכים ציבוריים בתכנון של Supabase; service_role / secret לא נכנס לריפו לעולם. (נבדק: המפתח הציבורי לבדו מקבל 401 על כל טבלה, view ו-RPC.)
8. **הגדרות ראשונות:** כניסה לאפליקציה → הגדרות → הכתובת בתאילנד, בדיקת הטקסטים המשפטיים. נשמר ב-Supabase בלבד.
9. **השהיה אוטומטית:** פרויקט חינמי מושהה אחרי שבוע בלי שימוש. `keepalive.yml` עושה פעם בשבוע קריאה לייצור עם המפתח הציבורי (URL ומפתח כ-Repository Variables ב-GitHub, לא secrets). אם בכל זאת הושהה: Dashboard → Restore, דקה.
10. **גיבוי:** אין גיבוי אוטומטי בחינמי. כפתור "גיבוי JSON מלא" באפליקציה מעדכן `last_backup_at`; הדשבורד מזכיר אחרי 30 יום או אחרי הנפקה. ב-README: לשמור את קובץ ה-JSON בדרייב.
11. **אימייל:** השולח המובנה של Supabase מוגבל לכמה הודעות בשעה ועלול לנחות ב"קידומי מכירות". ההתחברות נשמרת בדפדפן, אז לינק נדרש לעיתים רחוקות. SMTP משלך (Gmail) אפשרי מאוחר יותר, וגם מאפשר לעבור לקוד.

## 5. README (עברית), תוכן נדרש
- סעיף 4 צעד אחר צעד עם צילומי מסך מילוליים.
- כניסה בלינק: איך זה עובד, למה באותו דפדפן, ומה עושים כשהלינק פג. סעיף קצר: מעבר לקוד בן 6 ספרות בעתיד עם Gmail SMTP.
- פריסה: push ל-`main` מפרסם; הסינכרון השעתי של האינסטגרם לא נוגע ב-`invoices/`.
- גיבוי ושחזור: ייצוא JSON, מה כולל, איך משחזרים לפרויקט חדש (install.sql + ייבוא).
- **GitHub משבית workflows מתוזמנים אחרי 60 יום בלי פעילות (commits) בריפו.** איך מפעילים מחדש: Actions → בחירת ה-workflow → "Enable workflow", או `gh workflow enable keepalive.yml`. הסינכרון הקיים (`sync.yml`) כבר מפעיל את עצמו מחדש דרך ה-API ב-04 UTC; `keepalive.yml` יקבל את אותו מנגנון.
- מעבר לסאב-דומיין: העתקת התיקייה, הוספת הכתובת ב-Supabase Auth, עדכון `Site URL`, בלי שינויי קוד.
- מה לעשות כשפרויקט הושהה, כשלינק הכניסה לא מגיע, כשרוצים להחליף טלפון או טקסט משפטי.

## 6. שלבי הביצוע

- **שלב 2 (הושלם 2026-10-18):** `migrations/0001..0006`, `scripts/build-install-sql.mjs` → `install.sql`, `seed/settings.sql`; `test/invoices` על pglite, 39 בדיקות ירוקות. קומיט בענף `invoices`. בדיקת המקביליות החיה לא רצה ולא תרוץ (החלטה 8).
- **שלב 3 (הושלם 2026-10-18):** `document.css` + `document.js` + `print.html`, דוגמאות Invoice, Receipt ו-Quote, גרסת אפור להדפסה בשחור-לבן. אושר עם ארבעה ליטושים.
- **שלב 4 (הושלם 2026-10-19):** האפליקציה: כניסה בלינק (magic link, PKCE; מוכן ונבדק מול שרת מדומה, `scripts/invoices-auth-check.mjs`), דשבורד (מסמכים אחרונים, יתרות פתוחות לפי לקוח, סה"כ שהתקבל לפי חודש ושנה, באנר גיבוי), לקוחות, פרויקטים, מסמכים (טיוטה → הנפקה → PDF; שכפול; קבלה בלחיצה מתוך Invoice; המרת Quote ל-Invoice), הגדרות (כל הטקסטים המשפטיים), ייצוא CSV שנתי (מספר, סוג, תאריך, לקוח, סכום, מטבע, סטטוס) ו-JSON מלא. supabase-js מוטבע בגרסה נעולה. `config.js` עם placeholders עד ההדבקה. **כפתור "הנפק" ננעל מיד בלחיצה (disabled + מצב טעינה) עד שמגיעה תשובה מהשרת**, כדי שלחיצה כפולה לא תשלח שתי בקשות; אחרי שגיאה הוא נפתח שוב עם ההודעה. Supabase הוקם 2026-10-19 (פרויקט ייצור אחד) והכניסה האמיתית אושרה. בדיקות האפליקציה רצות מול `scripts/invoices-dev-server.mjs` (שרת Supabase מקומי מדומה על pglite, עם אותו `install.sql`), לעולם לא מול הייצור. נבנו: `js/api.js`, `js/ui.js`, `js/snapshot.js`, `js/preview.js`, `js/backup.js`, `js/views/*`, `print.html?id=`, `.github/workflows/invoices-keepalive.yml`. נבדק: `scripts/invoices-e2e.mjs` (22 צעדים, כולל טלפון ומחשב, בהיר וכהה).
- **שלב 5 (כוסה בשלב 4):** `scripts/invoices-e2e.mjs` מצלם ובודק טלפון 390px ומחשב 1440px, בהיר וכהה, בלי גלילה הצידה; `scripts/invoice-shots.mjs` מוודא PDF של עמוד A4 אחד, וקטורי, בלי כותרות של הדפדפן (`@page { margin: 0 }`, נבדק עם displayHeaderFooter), וגרסת שחור-לבן.
- **שלב 6 (הושלם 2026-10-19):** `invoices/README.md`: שימוש יומיומי, כניסה (ומעבר לקוד עם Gmail SMTP), הקמת Supabase מאפס, פריסה ו-migrations, גיבוי ו-CSV, השהיה ו-workflow שבועי (כולל הפעלה מחדש אחרי 60 יום), סאב-דומיין, פתרון תקלות, עבודה מקומית ובדיקות, אבטחה. **פער ידוע:** אין עדיין כלי שחזור מגיבוי JSON.
- **שלב 7:** הזנת הלקוח הראשון **דרך האפליקציה בלבד**, הכול DRAFT: לקוח, פרויקט 50/50, Invoice ו-Payment Receipt של מקדמה. **הפרטים (שם, סכומים, תיאור, תאריכים) נמצאים בבריף של בר בשיחה, ובכוונה לא כאן: הריפו ציבורי, ושום נתון של לקוח לא נכנס אליו.** ההנפקה (והמספרים 0001) רק בלחיצה של בר.

## 7. אימות לפני כל מסירה (quality check)

**כלל פריסה:** הענף `invoices` לא נדחף ל-GitHub כמו שהוא. קומיטים מוקדמים בו (שלבים 2 עד 4) הכילו את פרטי הלקוח הראשון ב-PLAN.md, לפני שהוסרו. הפריסה היא squash merge לקומיט אחד על `main`, כך שההיסטוריה הזו לא מתפרסמת.

- `npm run test:invoices` ירוק (מספור, נעילה, יתרה, זהות, audit, snapshot, גיבוי).
- grep על `invoices/` ועל טקסט ה-PDF: אין "חשבונית מס", "עוסק", "מע"מ", "VAT" חוץ מ-"No Israeli VAT charged", אין "מספר הקצאה", אין ת.ז. אין em dash.
- grep על הריפו: אין שם לקוח, סכום, כתובת אישית או מפתח סודי; `config.js` מכיל רק URL ו-anon key של הייצור; `install.sql` לא מכיל DROP.
- צילום המסמך ליד דף הבית: אותם צבעים, פונטים, לוגו, ריווח.
- מספרים, תאריכים ומטבעות ב-LTR מבודד בתוך RTL; dd.mm.yyyy; `₪9,400.00` / `$9,400.00` / `€9,400.00` / `฿9,400.00`.
