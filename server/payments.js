// Stripe payments for the JourneyModal tiers, FX-localized into the user's
// market currency. The reveal is priced in SGD (~S$1). The two service tiers
// are priced in USD, by segment:
//   coaching call   US$19 individual · US$49 SME/corporate
//   expert-led      US$49 individual · US$99 SME/corporate
//
// The Stripe SDK is loaded LAZILY and only when STRIPE_SECRET_KEY is set, so the
// app and its tests run without the package or a key — routes just report
// "payments not configured" (503) and the client falls back to a demo booking.
//
// Config (env):
//   STRIPE_SECRET_KEY          enables payments (sk_test_… / sk_live_…)
//   STRIPE_CURRENCY            default 'sgd'
//   STRIPE_PRICE_REVEAL_CENTS        default 100   (~S$1 reveal — FX-localized per market)
//   STRIPE_PRICE_CALL_CENTS          default 1900  (US$19 coaching call, individuals)
//   STRIPE_PRICE_CALL_SME_CENTS      default 4900  (US$49 coaching call, SMEs & corporates)
//   STRIPE_PRICE_EXPERT_CENTS        default 4900  (US$49 expert-led, individuals)
//   STRIPE_PRICE_EXPERT_SME_CENTS    default 9900  (US$99 expert-led, SMEs & corporates)
//   PUBLIC_BASE_URL            success/cancel origin (falls back to request origin)

import { getMidRate } from './fx.js';

const KEY = process.env.STRIPE_SECRET_KEY || '';
export const isPaymentsConfigured = !!KEY;

const CURRENCY = (process.env.STRIPE_CURRENCY || 'sgd').toLowerCase();
// The reveal unlocks the best bank + certificate and is the gate to the three
// follow-on options. Priced at ~S$1, charged in the user's market currency.
const REVEAL_SGD_CENTS = Number(process.env.STRIPE_PRICE_REVEAL_CENTS || 100);
const TIERS = {
  reveal: { amount: REVEAL_SGD_CENTS, name: 'Reveal best bank & price' },
  call: {
    base: 'USD',
    amount: Number(process.env.STRIPE_PRICE_CALL_CENTS || 1900),
    smeAmount: Number(process.env.STRIPE_PRICE_CALL_SME_CENTS || 4900),
    name: 'Negotiation coaching call',
  },
  expert: {
    base: 'USD',
    amount: Number(process.env.STRIPE_PRICE_EXPERT_CENTS || 4900),
    smeAmount: Number(process.env.STRIPE_PRICE_EXPERT_SME_CENTS || 9900),
    name: 'Expert-led negotiation',
  },
};
export const getTier = (t) => TIERS[t] || null;

// A tier's list price in cents of its base currency (t.base, default SGD) for a
// segment ('sme' or anything else = individual). Tiers without an SME price
// charge everyone the same.
const listCentsFor = (t, segment) => (segment === 'sme' && t.smeAmount ? t.smeAmount : t.amount);

// Stripe "zero-decimal" currencies take amounts in whole units, not cents.
// Exported so email.js formats amounts with the same rules (no drift).
export const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
// Three-decimal currencies need special minor-unit handling we don't implement;
// treating them as two-decimal would underprice 10x, so we fall back to SGD.
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

// A raw FX conversion gives prices like ₹6,247 — which reads as an accident.
// Snap the paid service tiers to a deliberate-looking price point instead: round
// to a step that scales with magnitude, then end mid-range prices on a 9.
function nicePrice(raw) {
  const step = raw < 100 ? 5 : raw < 1000 ? 10 : raw < 10_000 ? 100 : raw < 100_000 ? 500 : 5_000;
  const rounded = Math.round(raw / step) * step;
  return rounded >= 100 && rounded < 10_000 ? rounded - 1 : rounded;
}

// A tier's price in the user's market currency, from live mid-market FX (cached
// in fx.js). Returns { currency, amount (Stripe minor units), major }.
// Falls back to the list price in its base currency (SGD for the reveal, USD
// for the service tiers) when the currency is unknown, unsupported or a rate
// is unavailable, so checkout never fails closed on an FX hiccup.
//
// The ~S$1 reveal converts EXACTLY (it's a token amount, and "about a dollar" is
// the promise); the service tiers get the nice-price treatment.
export async function amountFor(tier, currency, segment = 'individual') {
  const t = getTier(tier);
  if (!t) throw new Error('Unknown tier');
  const base = t.base || 'SGD';
  const cents = listCentsFor(t, segment);
  const baseMajor = cents / 100;
  // No usable conversion: charge the list price in its own currency.
  const fallback = { currency: base === 'SGD' ? CURRENCY : base.toLowerCase(), amount: cents, major: baseMajor };
  const cur = String(currency || 'SGD').toUpperCase();
  if (cur === base || (base === 'SGD' && cur === CURRENCY.toUpperCase())
      || !/^[A-Z]{3}$/.test(cur) || THREE_DECIMAL.has(cur.toLowerCase())) return fallback;
  const rate = await getMidRate(base, cur); // local units per 1 unit of the base currency
  if (!rate) return fallback;
  const lc = cur.toLowerCase();
  const localMajor = tier === 'reveal' ? baseMajor * rate : nicePrice(baseMajor * rate);
  if (ZERO_DECIMAL.has(lc)) {
    const amount = Math.max(1, Math.round(localMajor));
    return { currency: lc, amount, major: amount };
  }
  const amount = Math.round(localMajor * 100);
  return { currency: lc, amount, major: amount / 100 };
}

// Back-compat alias — the reveal price is the same calculation.
export const revealAmountFor = (currency) => amountFor('reveal', currency);

let _stripe = null;
async function stripe() {
  if (!isPaymentsConfigured) throw new Error('Payments not configured');
  if (!_stripe) { const { default: Stripe } = await import('stripe'); _stripe = new Stripe(KEY); }
  return _stripe;
}

// Prefer the server-configured PUBLIC_BASE_URL; only fall back to a (route-
// validated, allow-listed) request origin. Must resolve to an absolute http(s)
// URL — otherwise we fail closed rather than emit an attacker-controllable
// redirect target for Stripe's success/cancel pages.
const cleanBase = (origin) => {
  const base = (process.env.PUBLIC_BASE_URL || origin || '').trim().replace(/\/$/, '');
  if (!/^https?:\/\//i.test(base)) {
    throw new Error('Checkout base URL not configured. Set PUBLIC_BASE_URL.');
  }
  return base;
};

// Create a hosted Checkout Session for a tier; returns { url, id }.
// Every tier is priced server-side from the market currency — a client-supplied
// amount is never trusted, only the currency code it asks to be billed in.
export async function createCheckout({ tier, origin, email, advisorId, product, segment, currency, country, productId, benchmarkId }) {
  const t = getTier(tier);
  if (!t) throw new Error('Unknown tier');
  const base = cleanBase(origin);
  const s = await stripe();
  // Priced by the segment the benchmark was run for (individual vs SME).
  const price = await amountFor(tier, currency, segment);
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: { currency: price.currency, unit_amount: price.amount, product_data: { name: t.name } },
    }],
    customer_email: email || undefined,
    // country + productId bind a reveal session to ONE benchmark, so a paid
    // session id can't be replayed against a different product or market.
    metadata: {
      tier, advisorId: advisorId || '', product: product || '', segment: segment || '',
      currency: price.currency, country: country || '', productId: productId || '',
      // Which saved row this purchase belongs to. Stripe returns everyone to the
      // bare origin and a mobile 3DS hop can land them in a FRESH tab, where the
      // sessionStorage stash is gone - this is what lets a signed-in buyer's
      // benchmark be found again from the server instead of dead-ending.
      // Only ever set for a signed-in buyer (an anonymous one has no row yet).
      benchmarkId: benchmarkId || '',
    },
    success_url: `${base}/?checkout=success&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?checkout=cancel&tier=${tier}`,
  });
  return { url: session.url, id: session.id };
}

// Verify a returned session (so the client trusts payment, not just the redirect).
export async function retrieveCheckout(id) {
  const s = await stripe();
  const session = await s.checkout.sessions.retrieve(id);
  return {
    paid: session.payment_status === 'paid',
    status: session.payment_status,
    tier: session.metadata?.tier || null,
    advisorId: session.metadata?.advisorId || null,
    product: session.metadata?.product || null,
    country: session.metadata?.country || null,
    productId: session.metadata?.productId || null,
    benchmarkId: session.metadata?.benchmarkId || null,
    amountTotal: session.amount_total,
    currency: session.currency,
    email: session.customer_details?.email || session.customer_email || null,
    emailSent: session.metadata?.email_sent === '1',
  };
}

// Durable "confirmation email sent" flag, stored on the Stripe session itself so
// the dedupe survives serverless cold starts (an in-memory Set does not).
export async function markEmailSent(id) {
  const s = await stripe();
  await s.checkout.sessions.update(id, { metadata: { email_sent: '1' } });
}
