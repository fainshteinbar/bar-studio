// App entry. Order matters: finish a magic-link sign-in (?code=...) BEFORE the hash router reads the address.
import * as config from '../config.js';
import { configured, OWNER_EMAIL, completeSignInFromUrl, currentSession, sendLink, signOut, sb } from './auth.js';
import { e, guard } from './ui.js';

const root = document.getElementById('app');
const RESEND_SECONDS = 60;

const logos = (cls = 'login-logo') => `
  <img class="${cls} logo-on-light" src="assets/img/bfain-logo-light-bg.svg" alt="bfain.studio" width="70" height="34">
  <img class="${cls} logo-on-dark" src="assets/img/bfain-logo-dark-bg.svg" alt="" width="70" height="34">`;

// ---------------- Sign-in ----------------
function loginView({ error = '', sentTo = '' } = {}) {
  root.innerHTML = `<section class="login" aria-labelledby="login-title">
    <div class="login-card">
      ${logos()}
      <p class="eyebrow">מסמכים · bfain.studio</p>
      <h1 id="login-title" class="display">כניסה</h1>
      ${devChip()}
      ${sentTo ? `
        <div class="sent">
          <div class="notice" role="status"><strong>שלחנו לינק כניסה למייל. פתח אותו באותו דפדפן.</strong>
            <span class="muted">נשלח אל <bdi>${e(sentTo)}</bdi></span></div>
          <button class="linklike" type="button" id="resend" disabled>שליחה חוזרת בעוד <bdi id="countdown">${RESEND_SECONDS}</bdi> שניות</button>
        </div>` : `
        <p class="lead">נשלח לינק כניסה לכתובת שלך. פותחים אותו באותו דפדפן, וזהו.</p>
        ${error ? `<div class="notice is-error" role="alert">${e(error)}</div>` : ''}
        <form id="login-form" novalidate>
          <div class="field">
            <label for="email">אימייל</label>
            <input id="email" name="email" type="email" dir="ltr" autocomplete="email" inputmode="email" required value="${e(OWNER_EMAIL)}">
          </div>
          <button class="pill pill-cyan" type="submit" id="send">שליחת לינק כניסה</button>
        </form>`}
    </div>
  </section>`;

  if (sentTo) {
    const btn = document.getElementById('resend');
    const count = document.getElementById('countdown');
    let left = RESEND_SECONDS;
    const timer = setInterval(() => {
      left -= 1;
      if (left > 0) { count.textContent = String(left); return; }
      clearInterval(timer);
      btn.disabled = false;
      btn.textContent = 'לא הגיע? שליחה חוזרת';
    }, 1000);
    btn.addEventListener('click', () => { clearInterval(timer); loginView(); });
    return;
  }

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = document.getElementById('send');
    if (btn.disabled) return;               // one request per click, never two
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>שולח';
    const email = form.email.value;
    const res = await sendLink(email);
    if (res.ok) loginView({ sentTo: email.trim().toLowerCase() });
    else loginView({ error: res.message });
  });
}

function notConfiguredView() {
  root.innerHTML = `<section class="login"><div class="login-card">
    ${logos()}
    <h1 class="display">כניסה</h1>
    <div class="notice is-error" role="alert"><strong>חסרים פרטי החיבור ל-Supabase.</strong>
      הרץ <bdi>node scripts/invoices-config.mjs</bdi> כדי למלא את <bdi>invoices/config.js</bdi>.</div>
  </div></section>`;
}

const devChip = () => (config.DEV_MODE
  ? '<p class="dev-chip" title="scripts/invoices-dev-server.mjs">שרת מקומי · נתוני בדיקה בלבד</p>' : '');

// ---------------- Signed in: layout and router ----------------
const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  docs: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 0v5h5M9 13h6M9 17h6"/>',
  clients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-2.5-5.1"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const NAV = [
  ['#/', 'ראשי', 'home', /^#\/?$/],
  ['#/docs', 'מסמכים', 'docs', /^#\/(docs|doc|new)/],
  ['#/clients', 'לקוחות', 'clients', /^#\/clients/],
  ['#/projects', 'פרויקטים', 'projects', /^#\/projects/],
  ['#/settings', 'הגדרות', 'settings', /^#\/(settings|export)/],
];
const icon = (name) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

const ROUTES = [
  [/^#\/?$/, () => import('./views/dashboard.js')],
  [/^#\/docs(?:\/([a-z_]+))?$/, () => import('./views/documents.js')],
  [/^#\/doc\/([0-9a-f-]{36})$/, () => import('./views/document.js')],
  [/^#\/new$/, () => import('./views/new.js')],
  [/^#\/clients$/, () => import('./views/clients.js')],
  [/^#\/clients\/(new|[0-9a-f-]{36})$/, () => import('./views/client.js')],
  [/^#\/projects$/, () => import('./views/projects.js')],
  [/^#\/projects\/(new|[0-9a-f-]{36})$/, () => import('./views/project.js')],
  [/^#\/settings$/, () => import('./views/settings.js')],
  [/^#\/export$/, () => import('./views/export.js')],
];

let cleanup = null;
let currentHash = '';
let renderToken = 0;

function shell() {
  root.innerHTML = `<div class="layout">
    <header class="topbar">
      <a class="brand" href="#/" aria-label="ראשי · bfain.studio">${logos('brand-logo')}<span class="brand-name">מסמכים</span></a>
      ${devChip()}
      <nav class="mainnav" aria-label="ניווט ראשי">${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav>
      <a class="pill pill-cyan pill-sm topbar-new" href="#/new"><span aria-hidden="true">+</span> מסמך חדש</a>
    </header>
    <main id="view" class="view" tabindex="-1"></main>
    <nav class="tabbar" aria-label="ניווט">${NAV.map(([href, label, ic]) => `<a href="${href}">${icon(ic)}<span>${label}</span></a>`).join('')}</nav>
  </div>`;
}

function markNav(hash) {
  for (const a of root.querySelectorAll('.mainnav a, .tabbar a')) {
    const item = NAV.find(([href]) => href === a.getAttribute('href'));
    if (item && item[3].test(hash)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
}

async function route() {
  const full = location.hash || '#/';
  if (guard.dirty && full !== currentHash) {
    if (!window.confirm('יש שינויים שלא נשמרו. לעזוב בלי לשמור?')) {
      history.replaceState(null, '', currentHash);
      return;
    }
    guard.dirty = false;
  }
  currentHash = full;
  const [hash, qs] = full.split('?');
  const query = new URLSearchParams(qs || '');
  const match = ROUTES.find(([re]) => re.test(hash));
  const view = document.getElementById('view');
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  markNav(hash);
  const token = ++renderToken;
  if (!match) { view.innerHTML = '<div class="page"><p class="muted">הדף לא נמצא.</p><a class="linklike" href="#/">לדף הראשי</a></div>'; return; }
  view.innerHTML = '<div class="page"><div class="loading" aria-label="טוען"></div></div>';
  try {
    const mod = await match[1]();
    if (token !== renderToken) return;
    const params = hash.match(match[0]).slice(1);
    const result = await mod.default(view, params, query);
    if (token !== renderToken) { if (typeof result === 'function') result(); return; }
    cleanup = typeof result === 'function' ? result : null;
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    view.innerHTML = `<div class="page"><div class="notice is-error" role="alert"><strong>משהו השתבש בטעינה.</strong> ${e(err?.message || '')}</div></div>`;
  }
}

function startApp() {
  shell();
  addEventListener('hashchange', route);
  addEventListener('beforeunload', (ev) => { if (guard.dirty) { ev.preventDefault(); ev.returnValue = ''; } });
  route();
}

async function boot() {
  if (!configured) return notConfiguredView();
  const back = await completeSignInFromUrl();      // must come before any routing
  const session = await currentSession();
  if (!session) return loginView({ error: back.status === 'error' ? back.message : '' });
  startApp();
  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { guard.dirty = false; removeEventListener('hashchange', route); loginView(); }
  });
}

export async function logout() { guard.dirty = false; await signOut(); }

boot();
