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

/* ---------------------------------------------------------------------------
   Anonymous reveals.

   A reveal can now be bought without an account, which means the browser holds
   the only proof of purchase until the payer uses the magic link emailed to
   them. That proof is the Stripe session id, and /api/reveal re-verifies it
   with Stripe on every use — so this is a capability, not a claim the client
   gets to make for itself.

   localStorage, unlike the sessionStorage above: the whole point is to outlive
   the tab, so someone who pays and comes back tomorrow is not charged twice.
   --------------------------------------------------------------------------- */
const SESSION_KEY = 'bb_reveal_sessions';

function readSessions() {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

/** File a paid reveal session under every key this benchmark answers to. */
export function rememberRevealSession(ctx, sessionId) {
  if (!sessionId) return;
  const keys = keysFor(ctx);
  if (!keys.length) return;
  const map = readSessions();
  for (const k of keys) map[k] = sessionId;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/** The paid session id for this benchmark in this browser, or null. */
export function revealSessionFor(ctx) {
  const map = readSessions();
  for (const k of keysFor(ctx)) if (map[k]) return map[k];
  return null;
}

/* Drop every remembered reveal session.

   Called on sign-out. The store exists so an ANONYMOUS buyer who comes back
   tomorrow isn't charged twice - and an anonymous buyer never signs out, so
   clearing here leaves that case untouched. What it does clear is the case that
   leaked: a signed-in purchase also files its session id here, and without this
   the capability outlived the account. Sign out, recalculate, and the paid
   reveal came back for free - to whoever was using the browser next.

   The purchase itself is not lost: for a signed-in buyer the durable record is
   saved_benchmarks.stage, which /api/reveal honours on any device. */
export function clearRevealSessions() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Consume one after it has been attached to an account - the saved benchmark's
    own `stage` is the durable record from then on. */
export function forgetRevealSession(sessionId) {
  const map = readSessions();
  let changed = false;
  for (const [k, v] of Object.entries(map)) if (v === sessionId) { delete map[k]; changed = true; }
  if (changed) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(map)); } catch { /* ignore */ } }
}

/* What /api/reveal has to be asked.

   The reveal recomputes the benchmark server-side and hands back only the name,
   so it must be asked the SAME question the free benchmark was — otherwise it
   answers about a different comparison. For cross-border that means the corridor
   and the amount sent: pricing is per receive-currency, and a flat fee is 2% of
   S$1,000 but 0.2% of S$10,000. Both ride in the context's `inputs` (the raw
   form values), which the saved row stores too, so they survive the Stripe hop
   and a reopen from the dashboard. */
export const revealPayload = (ctx) => ({
  country: ctx?.country || 'SG',
  product: ctx?.productId || undefined,
  currency: ctx?.currency || undefined,
  send_currency: ctx?.inputs?.send_currency || undefined,
  receive_currency: ctx?.inputs?.receive_currency || undefined,
  sent_amount: ctx?.inputs?.sent_amount || undefined,
});
