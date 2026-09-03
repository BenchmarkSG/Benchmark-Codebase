import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  PRODUCTS, QUESTIONNAIRES, getProduct, isProductInCountry,
  buildBenchmarkResult, crossBorderCostPct, scoreQuestionnaire,
} from './benchmark.js';
import * as ratesRepo from './ratesRepo.js';
import * as fxModule from './fx.js';
import * as payments from './payments.js';
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

// Wrap an async handler so rejected promises become clean 5xx responses.
// The raw error is logged server-side only; the client gets a generic message
// (no err.message) so internal DB/upstream details never leak.
const asyncRoute = (fn) => (req, res, next) => fn(req, res).catch((err) => {
  console.error('[api]', req.method, req.path, '-', err?.message || err);
  if (res.headersSent) return next(err);
  res.status(502).json({ error: 'Upstream data source unavailable. Please try again.' });
});

// Origins allowed to call this API from a browser. Configure ALLOWED_ORIGINS as a
// comma-separated list in production (e.g. https://feeoptima.com). In dev we
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
export function createApp({ repo = ratesRepo, fx = fxModule } = {}) {
  // Checkout needs a trusted redirect base: without PUBLIC_BASE_URL (or an
  // allow-listed Origin) every /api/checkout call fails closed with a 502.
  if (process.env.NODE_ENV === 'production' && payments.isPaymentsConfigured && !publicBase && !configuredOrigins.length) {
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
    res.json({ countries, products: PRODUCTS, questionnaires: QUESTIONNAIRES, paymentsEnabled: payments.isPaymentsConfigured });
  }));

  // ---- Stripe payments (JourneyModal tiers). No-ops without STRIPE_SECRET_KEY. --
  app.post('/api/checkout', strictLimiter, asyncRoute(async (req, res) => {
    if (!payments.isPaymentsConfigured) return res.status(503).json({ error: 'Payments not configured' });
    const { tier, advisorId, product, segment, email, currency } = req.body || {};
    if (!payments.getTier(tier)) return res.status(400).json({ error: 'Unknown tier' });
    // Only trust the Origin if it's allow-listed; never the Host header. The
    // success/cancel base otherwise comes from server-set PUBLIC_BASE_URL.
    const reqOrigin = req.headers.origin || '';
    const origin = reqOrigin && isOriginAllowed(reqOrigin) ? reqOrigin : '';
    res.json(await payments.createCheckout({
      tier, origin, email, currency,
      advisorId: cleanMeta(advisorId, 40), product: cleanMeta(product), segment: cleanMeta(segment, 20),
    }));
  }));

  // Localized price for a tier, for DISPLAY only. Needs FX but not Stripe, so it
  // works in demo mode too; the actual charge is recomputed at checkout time.
  app.get('/api/checkout/price', asyncRoute(async (req, res) => {
    const tier = String(req.query.tier || 'reveal');
    if (!payments.getTier(tier)) return res.status(400).json({ error: 'Unknown tier' });
    res.json(await payments.amountFor(tier, String(req.query.currency || 'SGD')));
  }));

  // Back-compat for the reveal button's original endpoint.
  app.get('/api/checkout/reveal-price', asyncRoute(async (req, res) => {
    res.json(await payments.amountFor('reveal', String(req.query.currency || 'SGD')));
  }));

  app.get('/api/checkout/session', asyncRoute(async (req, res) => {
    if (!payments.isPaymentsConfigured) return res.status(503).json({ error: 'Payments not configured' });
    if (!req.query.id) return res.status(400).json({ error: 'Missing session id' });
    const id = String(req.query.id);
    const result = await payments.retrieveCheckout(id);
    // On the first verified-paid read, fire the purchase confirmation email.
    // Dedupe durably via metadata.email_sent on the Stripe session (survives
    // serverless cold starts); the Set is just a same-instance fast path.
    if (result?.paid && result.email && !result.emailSent && !emailedSessions.has(id)) {
      emailedSessions.add(id);
      email.sendConfirmation({
        to: result.email, tier: result.tier, product: result.product,
        amountTotal: result.amountTotal, currency: result.currency,
      }).then((r) => { if (r?.ok) return payments.markEmailSent(id); })
        .catch(() => {});
    }
    // Never echo the payer's email back — anyone holding the session id (it
    // travels in the success-URL query string) could otherwise read it.
    const { email: _omit, ...pub } = result || {};
    res.json(pub);
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
    const { country = 'SG', product, currency, variant, yourRate, amount } = req.body || {};
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
    const result = buildBenchmarkResult({ product, country, currency, values: data.values, items: data.items, yourRate, amount });
    if (result.error) return res.status(404).json({ error: result.error });
    await attachMarketReference(repo, result, country, product);
    res.json(result);
  }));

  // Efficiency questionnaires → maturity score + expert hand-off.
  app.post('/api/questionnaire/score', (req, res) => {
    const { id, answers } = req.body || {};
    const result = scoreQuestionnaire(id, answers || {});
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // ---- Raw rate data (also fetched from Supabase) ----------------------------
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
  const { send_currency, receive_currency, sent_amount, received_amount, amount, time_taken_hours } = req.body || {};
  const data = await repo.getProductValues(country, meta.id, null);
  if (!data) return res.status(503).json({ error: 'Rate database not configured. See PRODUCT_DATA.md.' });

  let yourCostPct;
  if (sent_amount && received_amount && send_currency && receive_currency) {
    const midRate = await fx.getMidRate(send_currency, receive_currency);
    if (midRate == null) return res.status(502).json({ error: 'Could not fetch a live FX rate right now. Please try again.' });
    yourCostPct = crossBorderCostPct({ sent: sent_amount, received: received_amount, midRate });
  }

  const result = buildBenchmarkResult({
    product: meta.id, country, currency: send_currency || null,
    values: data.values, items: data.items,
    yourRate: yourCostPct, amount, // amount = annual transfer volume
    extra: { yourCostPct: yourCostPct ?? null, settlementHours: Number(time_taken_hours) || null },
  });
  if (result.error) return res.status(404).json({ error: result.error });
  await attachMarketReference(repo, result, country, meta.id);
  res.json(result);
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
