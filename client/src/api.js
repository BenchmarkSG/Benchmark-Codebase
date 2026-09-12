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
export const getCheckoutSession = (id) =>
  fetch(`${BASE}/checkout/session?id=${encodeURIComponent(id)}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
// Localized price for a tier, for display (the charge is recomputed server-side
// at checkout, so these can never be used to pay less).
export const getTierPrice = (tier, currency) =>
  fetch(`${BASE}/checkout/price?tier=${encodeURIComponent(tier || 'reveal')}&currency=${encodeURIComponent(currency || 'SGD')}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
export const getRevealPrice = (currency) => getTierPrice('reveal', currency);

// Bank directory for a country (id, name, category) — powers the provider picker.
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
