// Stripe payments for the JourneyModal tiers (coaching call $99, expert $199).
//
// The Stripe SDK is loaded LAZILY and only when STRIPE_SECRET_KEY is set, so the
// app and its tests run without the package or a key — routes just report
// "payments not configured" (503) and the client falls back to a demo booking.
//
// Config (env):
//   STRIPE_SECRET_KEY          enables payments (sk_test_… / sk_live_…)
//   STRIPE_CURRENCY            default 'sgd'
//   STRIPE_PRICE_CALL_CENTS    default 9900   ($99 coaching call)
//   STRIPE_PRICE_EXPERT_CENTS  default 19900  ($199 expert-led negotiation)
//   PUBLIC_BASE_URL            success/cancel origin (falls back to request origin)

const KEY = process.env.STRIPE_SECRET_KEY || '';
export const isPaymentsConfigured = !!KEY;

const CURRENCY = (process.env.STRIPE_CURRENCY || 'sgd').toLowerCase();
const TIERS = {
  call:   { amount: Number(process.env.STRIPE_PRICE_CALL_CENTS   || 9900),  name: 'Negotiation coaching call' },
  expert: { amount: Number(process.env.STRIPE_PRICE_EXPERT_CENTS || 19900), name: 'Expert-led negotiation' },
};
export const getTier = (t) => TIERS[t] || null;

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
export async function createCheckout({ tier, origin, email, advisorId, product, segment }) {
  const t = getTier(tier);
  if (!t) throw new Error('Unknown tier');
  const base = cleanBase(origin);
  const s = await stripe();
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: { currency: CURRENCY, unit_amount: t.amount, product_data: { name: t.name } },
    }],
    customer_email: email || undefined,
    metadata: { tier, advisorId: advisorId || '', product: product || '', segment: segment || '' },
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
  };
}
