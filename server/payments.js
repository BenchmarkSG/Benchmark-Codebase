// Stripe payments for the JourneyModal tiers (coaching call $99, expert $199).
//
// The Stripe SDK is loaded LAZILY and only when STRIPE_SECRET_KEY is set, so the
// app and its tests run without the package or a key — routes just report
// "payments not configured" (503) and the client falls back to a demo booking.
//
// Config (env):
//   STRIPE_SECRET_KEY          enables payments (sk_test_… / sk_live_…)
//   STRIPE_CURRENCY            default 'sgd'
//   STRIPE_PRICE_REVEAL_CENTS        default 100   (~S$1 reveal — FX-localized per market)
//   STRIPE_PRICE_CALL_CENTS          default 9900  ($99 coaching call)
//   STRIPE_PRICE_EXPERT_CENTS        default 19900 ($199 expert-led negotiation)
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
  call:   { amount: Number(process.env.STRIPE_PRICE_CALL_CENTS   || 9900),  name: 'Negotiation coaching call' },
  expert: { amount: Number(process.env.STRIPE_PRICE_EXPERT_CENTS || 19900), name: 'Expert-led negotiation' },
};
export const getTier = (t) => TIERS[t] || null;

// Stripe "zero-decimal" currencies take amounts in whole units, not cents.
// Exported so email.js formats amounts with the same rules (no drift).
export const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);
// Three-decimal currencies need special minor-unit handling we don't implement;
// treating them as two-decimal would underprice 10x, so we fall back to SGD.
const THREE_DECIMAL = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

// ~S$1 converted into the user's market currency using live mid-market FX
// (cached in fx.js). Returns { currency, amount (Stripe minor units), major }.
// Falls back to S$1 if the currency is unknown or a rate is unavailable, so the
// reveal never fails closed on an FX hiccup.
export async function revealAmountFor(currency) {
  const cur = String(currency || 'SGD').toUpperCase();
  const sgdMajor = REVEAL_SGD_CENTS / 100;
  const fallback = { currency: 'sgd', amount: REVEAL_SGD_CENTS, major: sgdMajor };
  if (cur === 'SGD' || !/^[A-Z]{3}$/.test(cur) || THREE_DECIMAL.has(cur.toLowerCase())) return fallback;
  const rate = await getMidRate('SGD', cur); // local units per 1 SGD
  if (!rate) return fallback;
  const localMajor = sgdMajor * rate;
  const lc = cur.toLowerCase();
  if (ZERO_DECIMAL.has(lc)) {
    const amount = Math.max(1, Math.round(localMajor));
    return { currency: lc, amount, major: amount };
  }
  const amount = Math.round(localMajor * 100);
  return { currency: lc, amount, major: amount / 100 };
}

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
// The reveal tier is priced server-side from the market currency (never trusts a
// client-supplied amount); the fixed tiers use their configured SGD price.
export async function createCheckout({ tier, origin, email, advisorId, product, segment, currency }) {
  const t = getTier(tier);
  if (!t) throw new Error('Unknown tier');
  const base = cleanBase(origin);
  const s = await stripe();
  const price = tier === 'reveal'
    ? await revealAmountFor(currency)
    : { currency: CURRENCY, amount: t.amount };
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: { currency: price.currency, unit_amount: price.amount, product_data: { name: t.name } },
    }],
    customer_email: email || undefined,
    metadata: { tier, advisorId: advisorId || '', product: product || '', segment: segment || '', currency: price.currency },
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
