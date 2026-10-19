// Where a not-logged-in user was when we sent them to sign in, so we can bring
// them back to the exact screen after auth — even when sign-up (email
// confirmation) or Google OAuth reloads the page. Kept in localStorage (survives
// a new tab / reload), with a freshness window so a stale intent can't reopen
// a modal on some unrelated future login.
export const AFTER_AUTH_KEY = 'bb_after_auth';
const AFTER_AUTH_TTL = 30 * 60 * 1000; // 30 min
// Back to a booking confirmation: the "Sign Up" email can sit unopened for a
// while, and what it reopens is the customer's own paid booking.
const CONFIRMED_TTL = 24 * 60 * 60 * 1000;
// A journey intent outlives its first use by this much, so EVERY tab that sees
// the sign-in can act on it: the tab the email-confirm link opened, and the
// original tab, which Supabase tells about the sign-in too. Whichever ran
// first used to consume it and leave the other on the home page.
const SHARED_GRACE = 2 * 60 * 1000;

export const readAfterAuth = () => {
  try {
    const d = JSON.parse(localStorage.getItem(AFTER_AUTH_KEY) || 'null');
    const ttl = d?.confirmed ? CONFIRMED_TTL : AFTER_AUTH_TTL;
    const stale = !d || typeof d.at !== 'number' || Date.now() - d.at > ttl
      || (typeof d.usedAt === 'number' && Date.now() - d.usedAt > SHARED_GRACE);
    if (stale) { localStorage.removeItem(AFTER_AUTH_KEY); return null; }
    return d;
  } catch { return null; }
};

/* Read an intent in order to act on it. Journey intents (reopen a screen —
   safe to do in several tabs) stay readable for SHARED_GRACE after first use;
   anything else (a checkout, a save) is cleared at once so it runs once. */
export const consumeAfterAuth = () => {
  const d = readAfterAuth();
  if (!d) return null;
  if (d.kind !== 'journey') { clearAfterAuth(); return d; }
  if (typeof d.usedAt !== 'number') {
    try { localStorage.setItem(AFTER_AUTH_KEY, JSON.stringify({ ...d, usedAt: Date.now() })); } catch { /* ignore */ }
  }
  return d;
};

export const storeAfterAuth = (intent) => {
  try { localStorage.setItem(AFTER_AUTH_KEY, JSON.stringify({ at: Date.now(), ...intent })); } catch { /* ignore */ }
};

export const clearAfterAuth = () => { try { localStorage.removeItem(AFTER_AUTH_KEY); } catch { /* ignore */ } };
