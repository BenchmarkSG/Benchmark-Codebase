// Live mid-market FX rates for the cross-border cost benchmark.
// Source: Frankfurter (European Central Bank reference rates) — free, no API key,
// covers SGD/INR/MYR/IDR/THB/USD. Override the host with FX_BASE_URL if you swap
// to a paid provider. ECB publishes ~daily, so we cache aggressively.

const FX_BASE_URL = process.env.FX_BASE_URL || 'https://api.frankfurter.dev/v1';
const TTL_MS = 6 * 60 * 60 * 1000; // 6h
// A bare fetch has no timeout. This one is on the critical path of /api/checkout
// (paid tiers are priced in the user's currency), so a slow or unresponsive ECB
// proxy used to hang the whole request — leaving the client's pay button stuck
// on "Redirecting to secure checkout…" indefinitely. Fail fast instead: the
// cache below serves the last known rate, and pricing errors cleanly if empty.
const FETCH_TIMEOUT_MS = 4000;
const cache = new Map(); // 'FROM:TO' -> { at, rate }

export const fxConfigured = true; // no key required

// Only real ISO-4217 currency codes may be interpolated into the outbound FX
// URL — blocks query/parameter injection from client-supplied currency fields.
const isCurrencyCode = (c) => /^[A-Z]{3}$/.test(c);

/** Mid-market rate = units of `to` per 1 unit of `from` (null if unavailable). */
export async function getMidRate(from, to) {
  const a = String(from || '').toUpperCase();
  const b = String(to || '').toUpperCase();
  if (!isCurrencyCode(a) || !isCurrencyCode(b)) return null;
  if (a === b) return 1;

  const key = `${a}:${b}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate;

  // AbortController rather than AbortSignal.timeout — same effect, no floor on
  // the Node version the API is deployed to.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${FX_BASE_URL}/latest?base=${encodeURIComponent(a)}&symbols=${encodeURIComponent(b)}`,
      { signal: ctrl.signal },
    );
    if (!res.ok) throw new Error(`FX ${res.status}`);
    const data = await res.json();
    const rate = Number(data?.rates?.[b]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('FX rate missing');
    cache.set(key, { at: Date.now(), rate });
    return rate;
  } catch (err) {
    if (hit) return hit.rate; // serve stale rather than fail
    console.error('[fx]', err.name === 'AbortError' ? `timeout after ${FETCH_TIMEOUT_MS}ms` : err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
