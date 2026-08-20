// Where a not-logged-in user was when we sent them to sign in, so we can bring
// them back to the exact screen after auth — even when sign-up (email
// confirmation) or Google OAuth reloads the page. Kept in localStorage (survives
// a new tab / reload), with a freshness window so a stale intent can't reopen
// a modal on some unrelated future login.
export const AFTER_AUTH_KEY = 'bb_after_auth';
const AFTER_AUTH_TTL = 30 * 60 * 1000; // 30 min

export const readAfterAuth = () => {
  try {
    const d = JSON.parse(localStorage.getItem(AFTER_AUTH_KEY) || 'null');
    if (!d || typeof d.at !== 'number' || Date.now() - d.at > AFTER_AUTH_TTL) { localStorage.removeItem(AFTER_AUTH_KEY); return null; }
    return d;
  } catch { return null; }
};

export const storeAfterAuth = (intent) => {
  try { localStorage.setItem(AFTER_AUTH_KEY, JSON.stringify({ at: Date.now(), ...intent })); } catch { /* ignore */ }
};

export const clearAfterAuth = () => { try { localStorage.removeItem(AFTER_AUTH_KEY); } catch { /* ignore */ } };
