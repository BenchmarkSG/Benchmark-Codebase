import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {
  PRODUCTS, QUESTIONNAIRES, getProduct,
  buildBenchmarkResult, crossBorderCostPct, scoreQuestionnaire,
} from './benchmark.js';
import * as ratesRepo from './ratesRepo.js';
import * as fxModule from './fx.js';
import * as payments from './payments.js';

// Wrap an async handler so rejected promises become clean 5xx responses.
// The raw error is logged server-side only; the client gets a generic message
// (no err.message) so internal DB/upstream details never leak.
const asyncRoute = (fn) => (req, res, next) => fn(req, res).catch((err) => {
  console.error('[api]', req.method, req.path, '-', err?.message || err);
  if (res.headersSent) return next(err);
  res.status(502).json({ error: 'Upstream data source unavailable. Please try again.' });
});

// Origins allowed to call this API from a browser. Configure ALLOWED_ORIGINS as a
// comma-separated list in production (e.g. https://bankbenchmark.sg). In dev we
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
  const app = express();
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
    res.json({ countries, products: PRODUCTS, questionnaires: QUESTIONNAIRES, paymentsEnabled: payments.isPaymentsConfigured });
  }));

  // ---- Stripe payments (JourneyModal tiers). No-ops without STRIPE_SECRET_KEY. --
  app.post('/api/checkout', strictLimiter, asyncRoute(async (req, res) => {
    if (!payments.isPaymentsConfigured) return res.status(503).json({ error: 'Payments not configured' });
    const { tier, advisorId, product, segment, email } = req.body || {};
    if (!payments.getTier(tier)) return res.status(400).json({ error: 'Unknown tier' });
    // Only trust the Origin if it's allow-listed; never the Host header. The
    // success/cancel base otherwise comes from server-set PUBLIC_BASE_URL.
    const reqOrigin = req.headers.origin || '';
    const origin = reqOrigin && isOriginAllowed(reqOrigin) ? reqOrigin : '';
    res.json(await payments.createCheckout({ tier, origin, email, advisorId, product, segment }));
  }));

  app.get('/api/checkout/session', asyncRoute(async (req, res) => {
    if (!payments.isPaymentsConfigured) return res.status(503).json({ error: 'Payments not configured' });
    if (!req.query.id) return res.status(400).json({ error: 'Missing session id' });
    res.json(await payments.retrieveCheckout(String(req.query.id)));
  }));

  // Instant benchmark. Rate products compare a single rate; cross-border derives
  // the all-in cost from the mid-market FX rate.
  app.post('/api/benchmark', asyncRoute(async (req, res) => {
    const { country = 'SG', product, currency, variant, yourRate, amount } = req.body || {};
    const meta = getProduct(product);
    if (!meta) return res.status(400).json({ error: 'Unknown product' });

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

  // Reveal endpoint — gated in the real product behind lead capture / plan.
  app.post('/api/reveal', strictLimiter, (req, res) => {
    const { email } = req.body || {};
    const ok = typeof email === 'string' && /.+@.+\..+/.test(email);
    if (!ok) return res.status(400).json({ error: 'A valid email is required to request a reveal.' });
    res.json({
      status: 'received',
      message: 'Request received. In production a specialist would contact you to reveal providers and discuss savings.',
    });
  });

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
