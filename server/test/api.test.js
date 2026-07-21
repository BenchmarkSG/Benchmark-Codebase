// Integration tests — spin up the real Express app on an ephemeral port
// and exercise the HTTP endpoints end to end.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';

let server;
let base;

before(async () => {
  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(() => server?.close());

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('GET /api/health -> ok', async () => {
  const r = await fetch(base + '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('GET /api/reference -> banks, products, corridors, segments', async () => {
  const r = await fetch(base + '/api/reference');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(Array.isArray(j.banks) && j.banks.length > 0);
  assert.ok(Array.isArray(j.products) && j.products.length > 0);
  assert.ok(Array.isArray(j.corridors) && j.corridors.length > 0);
  assert.ok(j.segments.individual && j.segments.sme);
  // a product exposes the metadata the client needs
  const mortgage = j.products.find((p) => p.id === 'mortgage');
  assert.ok(mortgage.variants.length >= 2);
});

test('POST /api/benchmark -> valid result', async () => {
  const r = await post('/api/benchmark', { bank: 'DBS', product: 'mortgage', variant: 'floating', amount: 500000, tenorYears: 20 });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.annualSaving > 0);
  assert.equal(j.benchmarkMasked, true);
});

test('POST /api/benchmark -> unknown product 400', async () => {
  const r = await post('/api/benchmark', { product: 'zzz' });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /Unknown product/);
});

test('POST /api/parse -> parses text', async () => {
  const r = await post('/api/parse', { text: 'Outward TT fee SGD 30' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.itemsDetected, 1);
  assert.equal(j.items[0].annualSaving, 25);
});

test('POST /api/parse -> missing text 400', async () => {
  const r = await post('/api/parse', { notText: 1 });
  assert.equal(r.status, 400);
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
