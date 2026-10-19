// Thin API client. Uses the Vite proxy (/api -> :3000) in dev.
const BASE = '/api';

// A fetch with no timeout never settles, so a hanging API leaves the caller's
// busy state stuck forever with no way out — which is exactly what a stalled
// pay button looks like. Always bound the wait.
const TIMEOUT_MS = 15000;

async function post(path, body, { timeout = TIMEOUT_MS, token = null } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      // Carry the machine-readable parts through: callers need to tell "already
      // bought this" (recoverable, reopen it) from "checkout is broken".
      const e = new Error(err.error || 'Request failed');
      e.status = r.status;
      e.code = err.code || null;
      e.benchmarkId = err.benchmarkId || null;
      throw e;
    }
    return await r.json();
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Reference data (countries + product schemas + questionnaires) is static per
// session and used by several components, so fetch it once and share the promise.
let referencePromise = null;
export function getReference() {
  if (!referencePromise) {
    referencePromise = fetch(`${BASE}/reference`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load reference data');
        return r.json();
      })
      .catch((err) => {
        referencePromise = null; // allow a retry on failure
        throw err;
      });
  }
  return referencePromise;
}

export const calcBenchmark = (payload) => post('/benchmark', payload);
export const scoreQuestionnaire = (id, answers) => post('/questionnaire/score', { id, answers });

// Stripe Checkout: create a session (server redirects to the hosted page) and
// verify it on return. `createCheckout` throws if payments aren't configured.
// `token` is the caller's Supabase access token. The server requires it for the
// reveal tier so it can refuse to sell a benchmark that's already unlocked.
export const createCheckout = (payload, token) => post('/checkout', payload, { token });

/* The paid reveal. The free /benchmark response deliberately withholds the
   winning bank's name; this asks for it and the server only answers when it can
   verify the purchase itself — a paid Stripe session id, or a signed-in user
   whose saved benchmark is already marked revealed. */
export const revealBestBank = (payload, token = null) => post('/reveal', payload, { token });
/* Verify a returned Stripe session. Pass the caller's access token when they
   are signed in: the server uses it to decide NOT to email them a "claim your
   purchase" magic link (they already have an account), and to hand back the
   benchmark id this purchase belongs to. Anonymous callers get neither. */
export const getCheckoutSession = (id, token = null) =>
  fetch(`${BASE}/checkout/session?id=${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
// Localized price for a tier, for display (the charge is recomputed server-side
// at checkout, so these can never be used to pay less).
// `segment` matters for the service tiers: SMEs & corporates pay more.
export const getTierPrice = (tier, currency, segment = 'individual') =>
  fetch(`${BASE}/checkout/price?tier=${encodeURIComponent(tier || 'reveal')}&currency=${encodeURIComponent(currency || 'SGD')}&segment=${segment === 'sme' ? 'sme' : 'individual'}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
export const getRevealPrice = (currency) => getTierPrice('reveal', currency);

// Bank directory for a country (id, name, category) — powers the provider picker.
/* Mid-market rate, display only (the savings scenarios are authored in SGD).
   Resolves to null rather than throwing: a missing rate must leave the page
   showing the original figures, never a blank or a wrong number. */
export const getFxRate = (from, to) =>
  fetch(`${BASE}/fx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (Number.isFinite(d?.rate) && d.rate > 0 ? d.rate : null))
    .catch(() => null);

export const getBanks = (country) =>
  fetch(`${BASE}/banks?country=${encodeURIComponent(country || '')}`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);

const CCY_LOCALE = { SGD: 'en-SG', USD: 'en-US', INR: 'en-IN', MYR: 'ms-MY', IDR: 'id-ID', THB: 'th-TH' };

export function formatMoney(n, currency = 'SGD') {
  if (n == null || Number.isNaN(n)) return '—';
  const cur = (typeof currency === 'string' && currency.trim()) ? currency.trim().toUpperCase() : 'SGD';
  try {
    return new Intl.NumberFormat(CCY_LOCALE[cur] || 'en-US', {
      style: 'currency', currency: cur, maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${cur} ${Math.round(n).toLocaleString()}`;
  }
}
