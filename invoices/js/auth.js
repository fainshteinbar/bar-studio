// Sign-in by magic link (Supabase Auth, PKCE flow), for one person only.
//
// Flow: the login screen calls sendLink(); Supabase emails a link that comes back to this app as
// .../invoices/?code=XXXX. completeSignInFromUrl() must run BEFORE the hash router reads the address:
// it trades the code for a session (the PKCE verifier saved by sendLink() lives in this browser's
// storage, which is why the link must be opened in the same browser) and then cleans the address.
// Sign-ups are off in Supabase, and shouldCreateUser: false keeps it that way from this side too.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const OWNER_EMAIL = 'fainshteinbar@gmail.com';
export const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const sb = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false, // handled by completeSignInFromUrl(), before routing
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'bfain-docs-auth',
      },
    })
  : null;

// Where the link should land: this app's own folder, whatever host it is served from
// (GitHub Pages path today, a subdomain later, localhost in development). Each must be listed
// under Supabase · Authentication · URL Configuration · Redirect URLs.
export function appUrl() {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/[^/]*$/, ''); // drop index.html if present
  return u.href;
}

const MESSAGES = {
  expired: 'הלינק פג תוקף או שכבר השתמשו בו. אפשר לבקש לינק חדש.',
  other_browser: 'הלינק נפתח בדפדפן אחר מזה שבו ביקשת אותו. פתח אותו באותו דפדפן, או בקש כאן לינק חדש.',
  rate_limit: 'נשלחו הרבה לינקים בזמן קצר. נסה שוב בעוד כמה דקות.',
  not_owner: 'הכניסה פתוחה רק לכתובת של בעל החשבון.',
  network: 'אין חיבור לשרת כרגע. בדוק את האינטרנט ונסה שוב.',
  generic: 'הכניסה לא הושלמה. אפשר לבקש לינק חדש.',
};

function explain(error) {
  const code = String(error?.code || error?.error_code || '').toLowerCase();
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (/otp_expired|flow_state_expired|flow_state_not_found|expired|access_denied/.test(code + text)) return MESSAGES.expired;
  if (/verifier/.test(code + text)) return MESSAGES.other_browser;
  if (error?.status === 429 || /rate_limit/.test(code + text)) return MESSAGES.rate_limit;
  if (/signup|not_allowed|user_not_found/.test(code + text)) return MESSAGES.not_owner;
  if (/fetch|network|load failed/.test(text)) return MESSAGES.network;
  return MESSAGES.generic;
}

// Run once at start-up, before the router. Returns { status: 'none' | 'signed_in' | 'error', message? }.
export async function completeSignInFromUrl() {
  const url = new URL(location.href);
  const q = url.searchParams;
  // Errors can arrive in the query (PKCE) or in a fragment like #error=...; never confuse #/route with it.
  const frag = url.hash && !url.hash.startsWith('#/') ? new URLSearchParams(url.hash.slice(1)) : new URLSearchParams();
  const code = q.get('code');
  const errorCode = q.get('error_code') || frag.get('error_code') || q.get('error') || frag.get('error');
  if (!code && !errorCode) return { status: 'none' };

  let result;
  if (errorCode) {
    result = { status: 'error', message: explain({ code: errorCode, message: q.get('error_description') || frag.get('error_description') }) };
  } else if (!sb) {
    result = { status: 'error', message: MESSAGES.generic };
  } else {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    result = error ? { status: 'error', message: explain(error) } : { status: 'signed_in' };
  }

  // Clean the address so a reload or a shared link never replays the code; start at the dashboard.
  for (const k of ['code', 'error', 'error_code', 'error_description', 'state']) q.delete(k);
  const rest = q.toString();
  history.replaceState(null, '', `${url.pathname}${rest ? `?${rest}` : ''}${url.hash.startsWith('#/') ? url.hash : '#/'}`);
  return result;
}

// Sends the magic link. Returns { ok: true } or { ok: false, message }.
export async function sendLink(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (clean !== OWNER_EMAIL) return { ok: false, message: MESSAGES.not_owner };
  if (!sb) return { ok: false, message: MESSAGES.generic };
  try {
    const { error } = await sb.auth.signInWithOtp({
      email: clean,
      options: { emailRedirectTo: appUrl(), shouldCreateUser: false },
    });
    return error ? { ok: false, message: explain(error) } : { ok: true };
  } catch (e) {
    return { ok: false, message: explain(e) };
  }
}

// The signed-in session, or null. A session for any other address is ended on the spot.
export async function currentSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const session = data?.session || null;
  if (session && String(session.user?.email || '').toLowerCase() !== OWNER_EMAIL) {
    await sb.auth.signOut();
    return null;
  }
  return session;
}

export async function signOut() {
  if (sb) await sb.auth.signOut();
}
