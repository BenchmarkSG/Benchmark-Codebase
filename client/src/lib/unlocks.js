/* What this browser session has already paid for.

   A reveal is sold once per saved benchmark, but the modal that shows it is
   ephemeral: closing it — deliberately, or with a stray click on the ✕ — left
   the result card still offering "Reveal the Best Bank →" at full price, so the
   obvious next click started a second checkout for something already owned.

   This is the UI half of the fix: it stops the app OFFERING to sell the same
   reveal twice. It is NOT the guarantee — a sessionStorage entry is trivially
   cleared and a second tab knows nothing about it — so /api/checkout refuses
   the repeat sale server-side against the row itself (server/purchases.js).

   sessionStorage rather than localStorage on purpose: the purchase itself is
   durable in Supabase (saved_benchmarks.stage), so this is only a fast local
   hint and shouldn't outlive the tab. */

const KEY = 'bb_unlocks';

// Ascending, so a later 'expert' purchase can't be downgraded to 'reveal' by a
// stale write arriving afterwards.
const RANK = { reveal: 1, call: 2, expert: 3 };

function read() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {}; // private mode, or storage disabled — the server check still holds
  }
}

function write(map) {
  try { sessionStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/* Every key a context can be filed under. The saved-benchmark id is the real
   one, but a result restored after the Stripe round-trip doesn't always carry
   it (the insert can fail, and the calculator's own restore doesn't keep it),
   so a signature of the figures on screen is recorded alongside. Writing both
   and checking both means the unlock survives the redirect either way. */
function keysFor(ctx) {
  if (!ctx) return [];
  const keys = [];
  if (ctx.benchmarkId) keys.push(`id:${ctx.benchmarkId}`);
  const sig = [ctx.segment, ctx.product, ctx.currency, ctx.yourRate, ctx.benchmarkRate]
    .map((v) => (v === null || v === undefined ? '' : String(v)))
    .join('|');
  if (sig.replace(/\|/g, '').trim()) keys.push(`sig:${sig}`);
  return keys;
}

/** Record a CONFIRMED purchase. Safe to call repeatedly. */
export function markUnlocked(ctx, tier) {
  if (!RANK[tier]) return;
  const keys = keysFor(ctx);
  if (!keys.length) return;
  const map = read();
  for (const k of keys) {
    if (RANK[map[k]] >= RANK[tier]) continue;
    map[k] = tier;
  }
  write(map);
}

/** The highest tier already paid for this benchmark in this session, or null. */
export function unlockedTierFor(ctx) {
  const map = read();
  let best = null;
  for (const k of keysFor(ctx)) {
    const t = map[k];
    if (RANK[t] && (!best || RANK[t] > RANK[best])) best = t;
  }
  return best;
}

/** Sign-out: one account's purchases must not be visible to the next. */
export function clearUnlocks() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
