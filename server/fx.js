// Live mid-market FX rates for the cross-border cost benchmark.
// Source: Frankfurter (European Central Bank reference rates) — free, no API key,
// covers SGD/INR/MYR/IDR/THB/USD. Override the host with FX_BASE_URL if you swap
// to a paid provider. ECB publishes ~daily, so we cache aggressively.

const FX_BASE_URL = process.env.FX_BASE_URL || 'https://api.frankfurter.dev/v1';
const TTL_MS = 6 * 60 * 60 * 1000; // 6h
const cache = new Map(); // 'FROM:TO' -> { at, rate }

export const fxConfigured = true; // no key required

/** Mid-market rate = units of `to` per 1 unit of `from` (null if unavailable). */
export async function getMidRate(from, to) {
  const a = String(from || '').toUpperCase();
  const b = String(to || '').toUpperCase();
  if (!a || !b) return null;
  if (a === b) return 1;

  const key = `${a}:${b}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate;

  try {
    const res = await fetch(`${FX_BASE_URL}/latest?base=${a}&symbols=${b}`);
    if (!res.ok) throw new Error(`FX ${res.status}`);
    const data = await res.json();
    const rate = Number(data?.rates?.[b]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('FX rate missing');
    cache.set(key, { at: Date.now(), rate });
    return rate;
  } catch (err) {
    if (hit) return hit.rate; // serve stale rather than fail
    console.error('[fx]', err.message);
    return null;
  }
}
