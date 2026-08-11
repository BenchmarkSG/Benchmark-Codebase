import express from 'express';
import cors from 'cors';
import {
  PRODUCTS, QUESTIONNAIRES, getProduct,
  buildBenchmarkResult, crossBorderCostPct, scoreQuestionnaire,
} from './benchmark.js';
import * as ratesRepo from './ratesRepo.js';
import * as fxModule from './fx.js';
import * as payments from './payments.js';

// Wrap an async handler so rejected promises become clean 5xx responses.
const asyncRoute = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[api]', err.message);
  res.status(502).json({ error: 'Data source unavailable', detail: err.message });
});

const SG_FALLBACK = { code: 'SG', name: 'Singapore', currency: 'SGD', currency_symbol: 'S$' };

/**
 * Create the Express app. `repo` and `fx` are injectable so tests can supply
 * fixtures instead of live Supabase / network calls.
 */
export function createApp({ repo = ratesRepo, fx = fxModule } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, ratesSource: repo.ratesConfigured ? 'supabase' : 'local' }));

  // Reference data for the calculator: countries + product schemas + questionnaires.
  app.get('/api/reference', asyncRoute(async (_req, res) => {
    const countries = (await repo.getCountries()) ?? [SG_FALLBACK];
    res.json({ countries, products: PRODUCTS, questionnaires: QUESTIONNAIRES, paymentsEnabled: payments.isPaymentsConfigured });
  }));

  // ---- Stripe payments (JourneyModal tiers). No-ops without STRIPE_SECRET_KEY. --
  app.post('/api/checkout', asyncRoute(async (req, res) => {
    if (!payments.isPaymentsConfigured) return res.status(503).json({ error: 'Payments not configured' });
    const { tier, advisorId, product, segment, email } = req.body || {};
    if (!payments.getTier(tier)) return res.status(400).json({ error: 'Unknown tier' });
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
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
  app.post('/api/reveal', (req, res) => {
    const { email } = req.body || {};
    const ok = typeof email === 'string' && /.+@.+\..+/.test(email);
    if (!ok) return res.status(400).json({ error: 'A valid email is required to request a reveal.' });
    res.json({
      status: 'received',
      message: 'Request received. In production a specialist would contact you to reveal providers and discuss savings.',
    });
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
