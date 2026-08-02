// Integration tests — spin up the real Express app on an ephemeral port with a
// FIXTURE repo injected (so tests run without a live Supabase connection).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';

// Deterministic fake of the Supabase-backed rates repo.
const fixtureRepo = {
  ratesConfigured: true,
  async getCountries() {
    return [{ code: 'SG', name: 'Singapore', currency: 'SGD', currency_symbol: 'S$' }];
  },
  async getBanks() { return [{ id: 'sg-dbs', name: 'DBS', category: 'local', country_code: 'SG' }]; },
  async getProductValues(country, product) {
    if (product === 'overdraft') return { values: [6.5, 7.2, 8.0, 8.5] };
    if (product === 'short_term_local') return { values: [4.5, 5.0, 5.5] };
    return { values: [] };
  },
  async getOverdraft() { return [{ rate_min: 6.5, rate_max: 7.5, currency: 'SGD', banks: { name: 'DBS' } }]; },
  async getRemittance() { return []; },
  async getLoans() { return []; },
  async getThresholds() { return []; },
  async getRateBenchmark() { return { best: 6.5, poolSize: 4, benchmarkMasked: true }; },
};

let server, base;

before(async () => {
  const app = createApp({ repo: fixtureRepo });
  await new Promise((resolve) => {
    server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; resolve(); });
  });
});
after(() => server?.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET /api/health -> ok', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.ratesSource, 'supabase');
});

test('GET /api/reference -> countries + product metadata', async () => {
  const r = await fetch(base + '/api/reference');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.countries) && j.countries[0].code === 'SG');
  assert.ok(Array.isArray(j.products) && j.products.length > 0);
  const od = j.products.find((p) => p.id === 'overdraft');
  assert.ok(od && od.unit && od.currencyMode);
});

test('GET /api/countries -> from repo', async () => {
  const r = await fetch(base + '/api/countries');
  const j = await r.json();
  assert.equal(j[0].code, 'SG');
});

test('POST /api/benchmark -> valid masked result with saving', async () => {
  const r = await post('/api/benchmark', { country: 'SG', product: 'overdraft', currency: 'SGD', yourRate: 8.5, amount: 1000000 });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.benchmarkMasked, true);
  assert.equal(j.benchmarkRate, 6.5);
  assert.ok(j.annualSaving > 0);
});

test('POST /api/benchmark -> unknown product 400', async () => {
  const r = await post('/api/benchmark', { product: 'zzz' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Unknown product/);
});

test('POST /api/benchmark -> no data for selection 404', async () => {
  const r = await post('/api/benchmark', { country: 'SG', product: 'import_lc', amount: 1000 });
  assert.equal(r.status, 404);
});

test('GET /api/rates/overdraft -> rows', async () => {
  const r = await fetch(base + '/api/rates/overdraft?country=SG');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(await r.json()));
});

test('POST /api/reveal -> valid email accepted', async () => {
  const r = await post('/api/reveal', { email: 'sme@example.com' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, 'received');
});

test('POST /api/reveal -> invalid email 400', async () => {
  const r = await post('/api/reveal', { email: 'nope' });
  assert.equal(r.status, 400);
});

// When the repo reports "not configured", benchmark should 503 (no data.js fallback).
test('POST /api/benchmark -> 503 when rates DB unconfigured', async () => {
  const app = createApp({ repo: { ...fixtureRepo, ratesConfigured: false, async getProductValues() { return null; } } });
  const srv = app.listen(0);
  await new Promise((res) => srv.once('listening', res));
  const b = `http://localhost:${srv.address().port}`;
  const r = await fetch(b + '/api/benchmark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'overdraft', amount: 1000 }) });
  assert.equal(r.status, 503);
  srv.close();
});
