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

export async function getReference() {
  const r = await fetch(`${BASE}/reference`);
  if (!r.ok) throw new Error('Failed to load reference data');
  return r.json();
}

export const calcBenchmark = (payload) => post('/benchmark', payload);
export const parseStatement = (text) => post('/parse', { text });
export const requestReveal = (email) => post('/reveal', { email });

export function formatSGD(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    maximumFractionDigits: 0,
  }).format(n);
}
