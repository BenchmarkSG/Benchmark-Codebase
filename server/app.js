import express from 'express';
import cors from 'cors';
import { PRODUCTS, buildBenchmarkResult } from './benchmark.js';
import * as ratesRepo from './ratesRepo.js';

// Wrap an async handler so rejected promises become clean 5xx responses.
const asyncRoute = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error('[api]', err.message);
  res.status(502).json({ error: 'Data source unavailable', detail: err.message });
});

const SG_FALLBACK = { code: 'SG', name: 'Singapore', currency: 'SGD', currency_symbol: 'S$' };

/**
 * Create the Express app. `repo` is injectable so tests can supply fixtures
 * instead of a live Supabase connection. Defaults to the real Supabase repo.
 */
export function createApp({ repo = ratesRepo } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, ratesSource: repo.ratesConfigured ? 'supabase' : 'local' }));

  // Reference data to populate the calculator: countries + product metadata.
  app.get('/api/reference', asyncRoute(async (_req, res) => {
    const countries = (await repo.getCountries()) ?? [SG_FALLBACK];
    res.json({ countries, products: PRODUCTS });
  }));

  // Instant benchmark for a product, computed from the Supabase rate data.
  app.post('/api/benchmark', asyncRoute(async (req, res) => {
    const { country = 'SG', product, currency, yourRate, amount } = req.body || {};
    if (!PRODUCTS.some((p) => p.id === product)) {
      return res.status(400).json({ error: 'Unknown product' });
    }
    const data = await repo.getProductValues(country, product, currency);
    if (!data) {
      return res.status(503).json({ error: 'Rate database not configured. See PRODUCT_DATA.md.' });
    }
    const result = buildBenchmarkResult({ product, country, currency, values: data.values, items: data.items, yourRate, amount });
    if (result.error) return res.status(404).json({ error: result.error });
    res.json(result);
  }));

  // ---- Raw rate data (also fetched from Supabase) ----------------------------
  app.get('/api/countries', asyncRoute(async (_req, res) => {
    res.json((await repo.getCountries()) ?? [SG_FALLBACK]);
  }));

  app.get('/api/banks', asyncRoute(async (req, res) => {
    res.json((await repo.getBanks(req.query.country)) ?? []);
  }));

  app.get('/api/rates/overdraft', asyncRoute(async (req, res) => {
    const data = await repo.getOverdraft(req.query.country || 'SG', req.query.currency);
    if (!data) return res.status(503).json({ error: 'Rates DB not configured. Run scripts/seed-rates.mjs.' });
    res.json(data);
  }));

  app.get('/api/rates/remittance', asyncRoute(async (req, res) => {
    const data = await repo.getRemittance(req.query.country || 'SG', req.query.direction);
    if (!data) return res.status(503).json({ error: 'Rates DB not configured. Run scripts/seed-rates.mjs.' });
    res.json(data);
  }));

  app.get('/api/rates/loans', asyncRoute(async (req, res) => {
    const data = await repo.getLoans(req.query.country || 'SG', req.query.type);
    if (!data) return res.status(503).json({ error: 'Rates DB not configured. Run scripts/seed-rates.mjs.' });
    res.json(data);
  }));

  app.get('/api/rates/thresholds', asyncRoute(async (req, res) => {
    const data = await repo.getThresholds(req.query.country || 'SG');
    if (!data) return res.status(503).json({ error: 'Rates DB not configured. Run scripts/seed-rates.mjs.' });
    res.json(data);
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
      message:
        'Request received. In production a specialist would contact you to reveal providers and discuss savings.',
    });
  });

  return app;
}

export default createApp;
