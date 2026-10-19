// Integration tests — real Express app on an ephemeral port, with FIXTURE repo +
// FX injected (so tests run without a live Supabase connection or network).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';

const fixtureRepo = {
  ratesConfigured: true,
  async getCountries() { return [{ code: 'SG', name: 'Singapore', currency: 'SGD', currency_symbol: 'S$' }]; },
  async getBanks() { return [{ id: 'sg-dbs', name: 'DBS', category: 'local', country_code: 'SG' }]; },
  async getProductValues(country, product) {
    if (product === 'overdraft') return { items: [{ bank: 'DBS', value: 6.5 }, { bank: 'X', value: 8 }], values: [6.5, 8] };
    if (product === 'housing_loan') return { items: [{ bank: 'DBS', value: 3.4 }, { bank: 'Y', value: 4.2 }], values: [3.4, 4.2] };
    if (product === 'cross_border') return { items: [{ bank: 'DBS', value: 0.9 }, { bank: 'Z', value: 1.8 }], values: [0.9, 1.8] };
    return { items: [], values: [] };
  },
  async getRateBenchmark() { return { best: 6.5, poolSize: 2, benchmarkMasked: true }; },
};
const fixtureFx = { async getMidRate() { return 0.75; } };

let server, base;
before(async () => {
  const app = createApp({ repo: fixtureRepo, fx: fixtureFx });
  await new Promise((resolve) => {
    server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; resolve(); });
  });
});
after(() => server?.close());

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET /api/health -> ok', async () => {
  const j = await (await fetch(base + '/api/health')).json();
  assert.equal(j.ok, true);
  assert.equal(j.ratesSource, 'supabase');
});

test('GET /api/reference -> countries + product schemas + questionnaires', async () => {
  const j = await (await fetch(base + '/api/reference')).json();
  assert.ok(j.countries[0].code === 'SG');
  const hl = j.products.find((p) => p.id === 'housing_loan');
  assert.ok(hl && Array.isArray(hl.inputs) && hl.inputs.length);
  assert.ok(Array.isArray(j.questionnaires) && j.questionnaires.length >= 2);
});

test('POST /api/benchmark (rate) -> masked result, and NEVER the bank name', async () => {
  const r = await post('/api/benchmark', { country: 'SG', product: 'overdraft', currency: 'SGD', yourRate: 8, amount: 1000000 });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.benchmarkRate, 6.5);
  assert.ok(j.annualSaving > 0);
  // The bank's NAME is the paid product. This endpoint is public and
  // unauthenticated, so it must never carry it — the client-side paywall used to
  // be the only thing hiding a value that was sitting in every response.
  assert.ok(!('bestBank' in j), 'free benchmark must not leak the winning bank');
  assert.equal(j.benchmarkMasked, true);
});

test('POST /api/benchmark (cross-border) -> computes all-in cost via FX', async () => {
  const r = await post('/api/benchmark', {
    country: 'SG', product: 'cross_border',
    send_currency: 'SGD', receive_currency: 'USD',
    sent_amount: 1000, received_amount: 740,
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.yourCostPct, 1.33);     // (1 - 740/750) * 100
  assert.equal(j.benchmarkRate, 0.9);    // best market cost %
  // Sized on the transfer itself: (1.33 - 0.9)% of 1000.
  assert.equal(j.annualSaving, 4);
  // Same paywall as the rate path. This handler returned the result unchanged
  // for a long time and nobody noticed, because with no cross-border rows every
  // request 404'd before it could leak anything. The test above covers the rate
  // path only, which is exactly why this one was missed — assert it here too.
  assert.ok(!('bestBank' in j), 'free cross-border benchmark must not leak the winning provider');
  assert.equal(j.benchmarkMasked, true);
});

test('POST /api/benchmark -> unknown product 400', async () => {
  const r = await post('/api/benchmark', { product: 'zzz' });
  assert.equal(r.status, 400);
});

test('POST /api/benchmark -> no data for selection 404', async () => {
  const r = await post('/api/benchmark', { country: 'SG', product: 'personal_loan', amount: 1000 });
  assert.equal(r.status, 404);
});

test('POST /api/questionnaire/score -> points and tier', async () => {
  const keys = ['ap_automation', 'close_cycle', 'ar_dso', 'fpa_agility', 'expenses',
    'cash_visibility', 'compliance', 'integration', 'error_rate', 'team_focus'];
  const r = await post('/api/questionnaire/score', {
    id: 'operational_efficiency',
    answers: Object.fromEntries(keys.map((k) => [k, 4])),
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.score, 100);
  assert.equal(j.points, 40);
  assert.equal(j.band, 'Best-in-Class Operations');
});

test('POST /api/reveal -> 402 without proof of payment', async () => {
  // No session id and no signed-in user: nothing to be entitled by.
  const r = await post('/api/reveal', { country: 'SG', product: 'overdraft', currency: 'SGD' });
  assert.equal(r.status, 402);
  const j = await r.json();
  assert.equal(j.code, 'payment_required');
  assert.ok(!('bestBank' in j));
});

test('POST /api/reveal -> 400 on an unknown product, before any entitlement work', async () => {
  assert.equal((await post('/api/reveal', { product: 'not_a_product' })).status, 400);
});

test('POST /api/benchmark -> 503 when rates DB unconfigured', async () => {
  const app = createApp({ repo: { ...fixtureRepo, ratesConfigured: false, async getProductValues() { return null; } }, fx: fixtureFx });
  const srv = app.listen(0);
  await new Promise((res) => srv.once('listening', res));
  const b = `http://localhost:${srv.address().port}`;
  const r = await fetch(b + '/api/benchmark', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: 'overdraft', amount: 1000 }) });
  assert.equal(r.status, 503);
  srv.close();
});

/* ---------------------------------------------------------------------------
   /api/reveal — the endpoint that hands over the paid product.

   It was untestable until `pay` became injectable, and that is how it shipped
   asking the rate database a different question from the one /api/benchmark
   asked: for cross-border it passed no options at all, so every corridor was
   merged into one pool and every fee was sized against the row's own stored
   notional instead of the customer's amount. The buyer paid for "the bank that
   beats yours on THIS transfer" and could be handed the winner of a different
   one.
   --------------------------------------------------------------------------- */
const paidStub = {
  isPaymentsConfigured: true,
  getTier: () => ({ id: 'reveal' }),
  async retrieveCheckout() { return { paid: true, tier: 'reveal' }; },
  async createCheckout() { return {}; },
  async amountFor() { return {}; },
  async markEmailSent() {},
};

let revealServer, revealBase, seenArgs;
const revealRepo = {
  ...fixtureRepo,
  async getProductValues(country, product, currency, variant, opts) {
    seenArgs = { country, product, currency, variant, opts };
    return fixtureRepo.getProductValues(country, product, currency, variant, opts);
  },
};

before(async () => {
  const app = createApp({ repo: revealRepo, fx: fixtureFx, pay: paidStub });
  await new Promise((resolve) => {
    revealServer = app.listen(0, () => { revealBase = `http://localhost:${revealServer.address().port}`; resolve(); });
  });
});
after(() => revealServer?.close());

const revealPost = (body) =>
  fetch(revealBase + '/api/reveal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

test('POST /api/reveal -> 402 even with payments live, when nothing is presented', async () => {
  // Distinct from the case above: Stripe IS configured here, so the entitlement
  // branch actually runs. Presenting no session id must still buy nothing.
  const r = await revealPost({ country: 'SG', product: 'overdraft' });
  assert.equal(r.status, 402);
  const j = await r.json();
  assert.ok(!('bestBank' in j), 'an unpaid reveal must never carry the name');
  assert.equal(j.code, 'payment_required');
});

test('POST /api/reveal (paid) -> the winning bank', async () => {
  const r = await revealPost({ sessionId: 'cs_test_paid', country: 'SG', product: 'overdraft', currency: 'SGD' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.bestBank, 'DBS');
  assert.equal(j.benchmarkRate, 6.5);
});

test('POST /api/reveal (cross-border) asks for the SAME pool /api/benchmark priced', async () => {
  seenArgs = null;
  const r = await revealPost({
    sessionId: 'cs_test_paid', country: 'SG', product: 'cross_border',
    send_currency: 'SGD', receive_currency: 'INR', sent_amount: 10000,
  });
  assert.equal(r.status, 200);
  // The corridor and the amount must reach the repo. Without them the pool is
  // every corridor at once, priced off each row's stored notional.
  assert.equal(seenArgs.opts?.counterparty, 'INR');
  assert.equal(seenArgs.opts?.sentAmount, 10000);
  assert.equal(seenArgs.opts?.sendCurrency, 'SGD');
});

test('POST /api/reveal (rate product) still passes currency and variant', async () => {
  seenArgs = null;
  const r = await revealPost({
    sessionId: 'cs_test_paid', country: 'SG', product: 'housing_loan', currency: 'SGD', variant: 'floating',
  });
  assert.equal(r.status, 200);
  assert.equal(seenArgs.currency, 'SGD');
  assert.equal(seenArgs.variant, 'floating');
  assert.equal(seenArgs.opts, undefined, 'a rate pool takes no cross-border options');
});
