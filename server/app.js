import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  PRODUCTS, QUESTIONNAIRES, getProduct, isProductInCountry,
  buildBenchmarkResult, crossBorderCostPct, scoreQuestionnaire, pickBestItem,
} from './benchmark.js';
import * as ratesRepo from './ratesRepo.js';
import * as fxModule from './fx.js';
import * as payments from './payments.js';
import { checkRevealPurchase, bearerToken, isRevealPaid } from './purchases.js';
import { userFromToken, clientForToken, supabase, isSupabaseConfigured } from './supabase.js';
import * as email from './email.js';

// Session ids we've already emailed a confirmation for. Fast-path per-process
// guard only — the durable flag lives on the Stripe session itself
// (metadata.email_sent, see payments.markEmailSent), so serverless cold starts
// don't re-send.
const emailedSessions = new Set();

// Free-text fields the client sends along to Stripe metadata (and from there
// into transactional emails). Clamp + strip HTML-significant chars so a payer
// can't smuggle markup into an official email.
const cleanMeta = (v, max = 80) =>
  String(v ?? '').replace(/[<>"'&]/g, '').slice(0, max).trim() || '';

/* What a Stripe session may be told back to the browser.

   The session id travels in the success-URL query string, so anyone who gets
   hold of that link can call this route. The payer's email therefore never goes
   back out. The benchmark id is held to the same rule and released only to a
   signed-in caller: an anonymous buyer has no saved row, so it would tell them
   nothing, while a leaked id plus a stolen session would name a stranger's row.

   Exported for tests — it is the whole disclosure decision in one place. */
export const publicSession = (result, viewer) => {
  const { email: _omit, benchmarkId, ...pub } = result || {};
  return viewer && benchmarkId ? { ...pub, benchmarkId } : pub;
};

/* Create-or-sign-in the payer from the email Stripe collected, by sending a
   Supabase magic link. Deliberately uses the ANON key: signInWithOtp needs no
   admin privileges, so the service-role key stays out of this runtime (it
   bypasses RLS and must never be deployed to the web tier).

   Failure is silent by design. The reveal is already unlocked by the paid
   session id; this only makes the purchase portable, so a mail outage must not
   turn into a failed checkout return. */
async function sendClaimLink(to, req) {
  if (!isSupabaseConfigured || !to) return;
  const reqOrigin = req?.headers?.origin || '';
  const base = reqOrigin && isOriginAllowed(reqOrigin) ? reqOrigin : (process.env.PUBLIC_BASE_URL || '');
  try {
    await supabase.auth.signInWithOtp({
      email: to,
      options: {
        shouldCreateUser: true,
        ...(base ? { emailRedirectTo: `${base.replace(/\/$/, '')}/#dashboard` } : {}),
      },
    });
  } catch { /* see above: never block the return */ }
}

// Wrap an async handler so rejected promises become clean 5xx responses.
// The raw error is logged server-side only; the client gets a generic message
// (no err.message) so internal DB/upstream details never leak.
const asyncRoute = (fn) => (req, res, next) => fn(req, res).catch((err) => {
  console.error('[api]', req.method, req.path, '-', err?.message || err);
  if (res.headersSent) return next(err);
  res.status(502).json({ error: 'Upstream data source unavailable. Please try again.' });
});

// Origins allowed to call this API from a browser. Configure ALLOWED_ORIGINS as a
// comma-separated list in production (e.g. https://feeoptima.vercel.app). In dev we
// also accept the Vite/preview localhost origins. Non-browser callers (curl,
// server-to-server, tests) send no Origin header and are always allowed.
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];
const publicBase = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
const ALLOWED_ORIGINS = [...new Set([...configuredOrigins, ...(publicBase ? [publicBase] : []),
  ...(process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS)])];
export const isOriginAllowed = (origin) => !origin || ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ''));

const SG_FALLBACK = { code: 'SG', name: 'Singapore', currency: 'SGD', currency_symbol: 'S$' };

/**
 * Create the Express app. `repo` and `fx` are injectable so tests can supply
 * fixtures instead of live Supabase / network calls.
 */
/* `pay` is injectable for the same reason `repo` and `fx` are: /api/reveal is
   the endpoint that hands over the paid product, and it could not be exercised
   at all without a Stripe key — which is how it shipped mispricing cross-border
   reveals unnoticed. Tests pass a stub. */
export function createApp({ repo = ratesRepo, fx = fxModule, pay = payments } = {}) {
  // Checkout needs a trusted redirect base: without PUBLIC_BASE_URL (or an
  // allow-listed Origin) every /api/checkout call fails closed with a 502.
  if (process.env.NODE_ENV === 'production' && pay.isPaymentsConfigured && !publicBase && !configuredOrigins.length) {
    console.warn('[boot] PUBLIC_BASE_URL / ALLOWED_ORIGINS not set — checkout will fail. Set them in the deployment env.');
  }
  const app = express();
  // Behind Vercel's (single-hop) proxy: derive req.ip from X-Forwarded-For so
  // rate limiting keys off the real client and HTTPS is detected correctly.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST'],
  }));
  app.use(express.json({ limit: '256kb' }));

  // Abuse/DoS protection. Generous global cap; stricter on the costly endpoints
  // (Stripe session creation, lead capture). Skipped under `node --test`.
  const rl = (limit) => rateLimit({
    windowMs: 60_000, limit,
    standardHeaders: true, legacyHeaders: false,
    // Disable the dev-time proxy sanity checks: they THROW on a fresh serverless
    // instance (X-Forwarded-For present), which 500'd rate-limited routes on
    // Vercel cold starts. `trust proxy` above already gives us the correct IP.
    validate: false,
    skip: () => process.env.NODE_ENV === 'test',
    message: { error: 'Too many requests. Please slow down and try again.' },
  });
  app.use(rl(300));
  const strictLimiter = rl(15);

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, ratesSource: repo.ratesConfigured ? 'supabase' : 'local' }));

  // Reference data for the calculator: countries + product schemas + questionnaires.
  app.get('/api/reference', asyncRoute(async (_req, res) => {
    const countries = (await repo.getCountries()) ?? [SG_FALLBACK];
    // Every product ships with its `onlyCountries` allowlist attached; the
    // calculator filters on it once a market is picked.
    res.json({ countries, products: PRODUCTS, questionnaires: QUESTIONNAIRES, paymentsEnabled: pay.isPaymentsConfigured });
  }));

  // ---- Stripe payments (JourneyModal tiers). No-ops without STRIPE_SECRET_KEY. --
  app.post('/api/checkout', strictLimiter, asyncRoute(async (req, res) => {
    if (!pay.isPaymentsConfigured) return res.status(503).json({ error: 'Payments not configured' });
    const { tier, advisorId, product, segment, email, currency, benchmarkId, country, productId } = req.body || {};
    if (!pay.getTier(tier)) return res.status(400).json({ error: 'Unknown tier' });
    // The reveal is sold once per benchmark. Closing the modal and pressing the
    // button again must not charge twice, and the UI can't be what guarantees
    // that — so the repeat sale is refused here, against the row itself.
    if (tier === 'reveal') {
      const refusal = await checkRevealPurchase({
        token: bearerToken(req),
        benchmarkId: cleanMeta(benchmarkId, 64) || null,
      });
      if (refusal) return res.status(refusal.status).json(refusal.body);
    }
    // Only trust the Origin if it's allow-listed; never the Host header. The
    // success/cancel base otherwise comes from server-set PUBLIC_BASE_URL.
    const reqOrigin = req.headers.origin || '';
    const origin = reqOrigin && isOriginAllowed(reqOrigin) ? reqOrigin : '';
    res.json(await pay.createCheckout({
      tier, origin, email, currency,
      advisorId: cleanMeta(advisorId, 40), product: cleanMeta(product), segment: cleanMeta(segment, 20),
      country: cleanMeta(country, 8), productId: cleanMeta(productId, 40),
      benchmarkId: cleanMeta(benchmarkId, 64),
    }));
  }));

  /* THE PAID REVEAL.
   *
   * Returns the winning bank's name — the one thing the free benchmark withholds.
   * Entitlement is proved one of two ways, and never by the client asserting it:
   *
   *   1. `sessionId` — a Stripe Checkout session this server retrieves and finds
   *      paid, for tier 'reveal', bound to this same country + product. That is
   *      what lets someone buy without an account: the payment IS the key.
   *   2. A signed-in user whose saved benchmark is already marked revealed, read
   *      under their own RLS. That is how it keeps working on another device
   *      once the purchase has been claimed.
   */
  app.post('/api/reveal', strictLimiter, asyncRoute(async (req, res) => {
    const { sessionId, benchmarkId, country = 'SG', product, currency, variant,
            send_currency, receive_currency, sent_amount } = req.body || {};
    const meta = getProduct(product);
    if (!meta) return res.status(400).json({ error: 'Unknown product' });
    if (!isProductInCountry(meta, country)) {
      return res.status(400).json({ error: 'That product isn\u2019t offered in this market.' });
    }

    let entitled = false;

    if (sessionId && pay.isPaymentsConfigured) {
      const paid = await pay.retrieveCheckout(String(sessionId)).catch(() => null);
      // Bind the session to this exact benchmark. Without this a single paid
      // session id would unlock every product in every market, forever.
      entitled = !!paid?.paid
        && paid.tier === 'reveal'
        && (!paid.productId || paid.productId === product)
        && (!paid.country || paid.country === country);
    }

    if (!entitled && benchmarkId) {
      const token = bearerToken(req);
      const db = clientForToken(token);
      if (db) {
        const { data } = await db
          .from('saved_benchmarks').select('stage').eq('id', String(benchmarkId)).maybeSingle();
        entitled = isRevealPaid(data?.stage);
      }
    }

    if (!entitled) {
      return res.status(402).json({ error: 'This reveal hasn\u2019t been paid for.', code: 'payment_required' });
    }

    // The pool has to be rebuilt exactly as /api/benchmark built it, or the name
    // handed over is the winner of a different comparison. For cross-border that
    // means the corridor and the amount: a bank's USD spread says nothing about
    // its INR spread, and a flat S$20 fee is 2% of S$1,000 but 0.2% of S$10,000.
    // This used to call getProductValues with no options at all, which silently
    // merged every corridor and priced every fee against the row's own stored
    // notional — so a paid reveal could name the best bank for a transfer the
    // customer never asked about.
    const data = meta.family === 'crossborder'
      ? await repo.getProductValues(country, product, null, null, {
          counterparty: receive_currency || null,
          sentAmount: Number(sent_amount) || 0,
          sendCurrency: send_currency || null,
        })
      : await repo.getProductValues(country, product, currency, variant);
    if (!data) return res.status(503).json({ error: 'Rate database not configured. See PRODUCT_DATA.md.' });
    const best = pickBestItem(data.items, meta.rateType);
    if (!best?.bank) return res.status(404).json({ error: 'No benchmark data for this selection yet.' });
    res.json({ bestBank: best.bank, benchmarkRate: best.value ?? null });
  }));

  // Localized price for a tier, for DISPLAY only. Needs FX but not Stripe, so it
  // works in demo mode too; the actual charge is recomputed at checkout time.
  app.get('/api/checkout/price', asyncRoute(async (req, res) => {
    const tier = String(req.query.tier || 'reveal');
    if (!pay.getTier(tier)) return res.status(400).json({ error: 'Unknown tier' });
    res.json(await pay.amountFor(tier, String(req.query.currency || 'SGD')));
  }));

  // Back-compat for the reveal button's original endpoint.
  app.get('/api/checkout/reveal-price', asyncRoute(async (req, res) => {
    res.json(await pay.amountFor('reveal', String(req.query.currency || 'SGD')));
  }));

  app.get('/api/checkout/session', asyncRoute(async (req, res) => {
    if (!pay.isPaymentsConfigured) return res.status(503).json({ error: 'Payments not configured' });
    if (!req.query.id) return res.status(400).json({ error: 'Missing session id' });
    const id = String(req.query.id);
    const result = await pay.retrieveCheckout(id);
    // Who is asking. Drives both the claim-link decision below and whether the
    // benchmark id is safe to hand back.
    const viewer = await userFromToken(bearerToken(req));
    // On the first verified-paid read, fire the purchase confirmation email.
    // Dedupe durably via metadata.email_sent on the Stripe session (survives
    // serverless cold starts); the Set is just a same-instance fast path.
    if (result?.paid && result.email && !result.emailSent && !emailedSessions.has(id)) {
      emailedSessions.add(id);
      email.sendConfirmation({
        to: result.email, tier: result.tier, product: result.product,
        amountTotal: result.amountTotal, currency: result.currency,
      }).then((r) => { if (r?.ok) return pay.markEmailSent(id); })
        .catch(() => {});
      // Someone who paid WITHOUT an account gets one now, from the email Stripe
      // already collected: a magic link creates the user and signs them in, so
      // the purchase stops living in one browser tab. Fire-and-forget — a mail
      // failure must never break the return from checkout, and the reveal itself
      // works without it (the session id is the key).
      if (!viewer) sendClaimLink(result.email, req);
    }
    res.json(publicSession(result, viewer));
  }));

  // Internal trigger for the REMINDER (before a session) and FEEDBACK (after)
  // emails. Guarded by a shared secret — a cron job or Calendly webhook posts
  // here when a booking is due. Disabled unless INTERNAL_TASK_KEY is set.
  app.post('/api/internal/notify', asyncRoute(async (req, res) => {
    const secret = process.env.INTERNAL_TASK_KEY || '';
    if (!secret || req.headers['x-internal-key'] !== secret) return res.status(403).json({ error: 'Forbidden' });
    const { type, to, name, kind, whenText, product } = req.body || {};
    if (!to || !type) return res.status(400).json({ error: 'Missing type/to' });
    const send = type === 'reminder' ? email.sendReminder
      : type === 'feedback' ? email.sendFeedback
        : null;
    if (!send) return res.status(400).json({ error: 'Unknown notify type' });
    res.json(await send({ to, name, kind, whenText, product }));
  }));

  // Instant benchmark. Rate products compare a single rate; cross-border derives
  // the all-in cost from the mid-market FX rate.
  app.post('/api/benchmark', asyncRoute(async (req, res) => {
    const { country = 'SG', product, currency, variant, yourRate, amount, tenor } = req.body || {};
    const meta = getProduct(product);
    if (!meta) return res.status(400).json({ error: 'Unknown product' });
    // The client hides products that don't apply to the chosen market, but the
    // API is the thing that has to hold: a hand-rolled POST must not be able to
    // benchmark current-account credit interest against Indian banks.
    if (!isProductInCountry(meta, country)) {
      return res.status(400).json({ error: 'That product isn’t offered in this market.' });
    }

    if (meta.family === 'crossborder') return handleCrossBorder(req, res, { repo, fx }, meta, country);

    const data = await repo.getProductValues(country, product, currency, variant);
    if (!data) return res.status(503).json({ error: 'Rate database not configured. See PRODUCT_DATA.md.' });
    const result = buildBenchmarkResult({ product, country, currency, values: data.values, items: data.items, yourRate, amount, tenor, dataQuality: data.dataQuality });
    if (result.error) return res.status(404).json({ error: result.error });
    await attachMarketReference(repo, result, country, product);
    // The winning bank's NAME is the product sold by the ~$1 reveal. It must not
    // travel in the free response: a client-side paywall is no paywall at all,
    // and this endpoint is public. /api/reveal serves the name, and only against
    // a payment this server has verified.
    const { bestBank: _paid, ...publicResult } = result;
    res.json(publicResult);
  }));

  // Efficiency questionnaires → maturity score + expert hand-off.
  app.post('/api/questionnaire/score', (req, res) => {
    const { id, answers } = req.body || {};
    const result = scoreQuestionnaire(id, answers || {});
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // ---- Raw rate data (also fetched from Supabase) ----------------------------
  /* Mid-market FX, for DISPLAY only. The landing page's illustrative savings
     scenarios are authored in SGD; this is what lets an Indian visitor read them
     in rupees instead of doing the conversion in their head. Never used to price
     anything — a charge is always computed server-side at checkout time. */
  app.get('/api/fx', asyncRoute(async (req, res) => {
    const from = String(req.query.from || 'SGD').toUpperCase();
    const to = String(req.query.to || 'SGD').toUpperCase();
    const rate = await fx.getMidRate(from, to);
    if (rate == null) return res.status(503).json({ error: 'FX rate unavailable' });
    res.json({ from, to, rate });
  }));

  app.get('/api/countries', asyncRoute(async (_req, res) => {
    res.json((await repo.getCountries()) ?? [SG_FALLBACK]);
  }));

  app.get('/api/banks', asyncRoute(async (req, res) => {
    res.json((await repo.getBanks(req.query.country)) ?? []);
  }));

  app.get('/api/rates/benchmark', asyncRoute(async (req, res) => {
    const { country = 'SG', product = 'overdraft', currency } = req.query;
    const data = await repo.getRateBenchmark(country, product, currency);
    if (!data) return res.status(503).json({ error: 'Rates DB not configured or no matching data.' });
    res.json(data);
  }));

  // Terminal error handler — catches malformed-JSON parse errors and anything
  // thrown by sync routes. Logs server-side; never returns a stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[api]', req.method, req.path, '-', err?.message || err);
    if (res.headersSent) return next(err);
    const status = err?.type === 'entity.parse.failed' || err?.status === 400 ? 400 : 500;
    res.status(status).json({ error: status === 400 ? 'Invalid request body.' : 'Something went wrong. Please try again.' });
  });

  return app;
}

/* Cross-border: compute the customer's all-in cost from what they sent vs.
   received, priced against the live mid-market rate, then benchmark it. */
async function handleCrossBorder(req, res, { repo, fx }, meta, country) {
  const { send_currency, receive_currency, sent_amount, received_amount } = req.body || {};
  // The pool is priced for THIS transfer: same receive currency, fees sized
  // on the amount actually sent (a flat S$20 is 2% of S$1,000).
  const data = await repo.getProductValues(country, meta.id, null, null, {
    counterparty: receive_currency || null, sentAmount: Number(sent_amount) || 0, sendCurrency: send_currency || null,
  });
  if (!data) return res.status(503).json({ error: 'Rate database not configured. See PRODUCT_DATA.md.' });

  let yourCostPct;
  if (sent_amount && received_amount && send_currency && receive_currency) {
    const midRate = await fx.getMidRate(send_currency, receive_currency);
    if (midRate == null) return res.status(502).json({ error: 'Could not fetch a live FX rate right now. Please try again.' });
    yourCostPct = crossBorderCostPct({ sent: sent_amount, received: received_amount, midRate });
  }

  const result = buildBenchmarkResult({
    product: meta.id, country, currency: send_currency || null,
    values: data.values, items: data.items, dataQuality: data.dataQuality,
    // Sized on this transfer: the saving is per transfer, not per year.
    yourRate: yourCostPct, amount: sent_amount,
    extra: { yourCostPct: yourCostPct ?? null },
  });
  if (result.error) return res.status(404).json({ error: result.error });
  await attachMarketReference(repo, result, country, meta.id);
  // Same paywall as the rate path above: the winning provider's NAME is what the
  // ~$1 reveal sells, and this endpoint is public and unauthenticated. This
  // handler used to res.json(result) unchanged — the leak only stayed hidden
  // because there was no cross-border data to return, so every request 404'd
  // before reaching here. The moment real rows were loaded it began handing the
  // paid answer out for free.
  const { bestBank: _paid, ...publicResult } = result;
  res.json(publicResult);
}

/* Attach an aggregate market-reference figure (e.g. from MAS) when one exists for
   this product. Optional + guarded so injected test repos need not implement it. */
async function attachMarketReference(repo, result, country, product) {
  if (typeof repo.getMarketReference !== 'function') return;
  try {
    const refs = await repo.getMarketReference(country);
    if (refs && refs[product]) result.marketReference = refs[product];
  } catch { /* reference is best-effort */ }
}

export default createApp;
