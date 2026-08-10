// Thin API client. Uses the Vite proxy (/api -> :3000) in dev.
const BASE = '/api';

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || 'Request failed');
  }
  return r.json();
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

// Bank directory for a country (id, name, category) — powers the provider picker.
export const getBanks = (country) =>
  fetch(`${BASE}/banks?country=${encodeURIComponent(country || '')}`)
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);

const CCY_LOCALE = { SGD: 'en-SG', USD: 'en-US', INR: 'en-IN', MYR: 'ms-MY', IDR: 'id-ID', THB: 'th-TH' };

export function formatMoney(n, currency = 'SGD') {
  if (n == null || Number.isNaN(n)) return '—';
  try {
    return new Intl.NumberFormat(CCY_LOCALE[currency] || 'en-US', {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}
