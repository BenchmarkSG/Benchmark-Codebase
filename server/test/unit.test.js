// Unit tests for the pure benchmarking logic (no DB, no HTTP).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, getProduct, benchmarkValues, buildBenchmarkResult } from '../benchmark.js';

test('PRODUCTS: known calculator products are exposed with metadata + segments', () => {
  assert.ok(PRODUCTS.length >= 5);
  const od = getProduct('overdraft');
  assert.equal(od.unit, '% p.a.');
  assert.equal(od.currencyMode, 'localusd');
  assert.ok(od.segments.includes('sme'));
  // both segments are represented
  assert.ok(PRODUCTS.some((p) => p.segments.includes('individual')));
  assert.ok(getProduct('mortgage').segments.includes('individual'));
  assert.equal(getProduct('savings').rateType, 'yield');
  assert.equal(getProduct('nope'), null);
});

test('benchmarkValues: yield product is higher-is-better', () => {
  const b = benchmarkValues([1.8, 2.2, 2.5, 3.0], { yourRate: 1.8, amount: 100000, rateType: 'yield' });
  assert.equal(b.direction, 'higher');
  assert.equal(b.best, 3.0); // highest yield wins
  // extra earned = (3.0 - 1.8)/100 * 100,000 = 1,200
  assert.equal(b.annualSaving, 1200);
});

test('benchmarkValues: best/median/market from a value list', () => {
  const b = benchmarkValues([8, 6, 7, 9, 10], { yourRate: 9, amount: 1000000 });
  assert.equal(b.best, 6);
  assert.equal(b.poolSize, 5);
  // saving = (9 - 6)/100 * 1,000,000 = 30,000
  assert.equal(b.annualSaving, 30000);
  assert.equal(b.monthlySaving, 2500);
});

test('benchmarkValues: annualiser multiplies the saving (e.g. LC per quarter)', () => {
  const b = benchmarkValues([0.2, 0.3, 0.4], { yourRate: 0.4, amount: 1000000, annualiser: 4 });
  // (0.4 - 0.2)/100 * 1,000,000 * 4 = 8,000
  assert.equal(b.annualSaving, 8000);
});

test('benchmarkValues: missing yourRate assumes market-typical (no negative saving)', () => {
  const b = benchmarkValues([5, 6, 7, 8], { amount: 100000 });
  assert.equal(b.yourRate, b.marketTypical);
  assert.ok(b.annualSaving >= 0);
});

test('benchmarkValues: empty list returns null', () => {
  assert.equal(benchmarkValues([], { yourRate: 5, amount: 1000 }), null);
});

test('buildBenchmarkResult: masked result shape for a known product', () => {
  const r = buildBenchmarkResult({
    product: 'overdraft', country: 'SG', currency: 'SGD',
    values: [6.5, 7.2, 8.0, 8.5], yourRate: 8.5, amount: 1000000,
  });
  assert.equal(r.direction, 'lower');
  assert.equal(r.benchmarkMasked, true);
  assert.equal(r.benchmarkRate, 6.5);
  assert.ok(r.yourRate > r.benchmarkRate);
  assert.ok(r.annualSaving > 0);
  assert.match(r.benchmarkLabel, /hidden/);
});

test('buildBenchmarkResult: reveals the lowest-cost bank (apr) from items', () => {
  const r = buildBenchmarkResult({
    product: 'overdraft', country: 'SG', currency: 'SGD',
    values: [7, 6.5, 8],
    items: [{ bank: 'A', value: 7 }, { bank: 'DBS', value: 6.5 }, { bank: 'C', value: 8 }],
    yourRate: 8, amount: 100000,
  });
  assert.equal(r.bestBank, 'DBS'); // lowest apr wins
  assert.equal(r.benchmarkRate, 6.5);
});

test('buildBenchmarkResult: yield reveals the highest-rate bank', () => {
  const r = buildBenchmarkResult({
    product: 'savings', country: 'SG', currency: 'SGD',
    values: [1.8, 2.5, 2.0],
    items: [{ bank: 'X', value: 1.8 }, { bank: 'Digi', value: 2.5 }, { bank: 'Y', value: 2.0 }],
    yourRate: 1.8, amount: 100000,
  });
  assert.equal(r.bestBank, 'Digi'); // highest yield wins
});

test('buildBenchmarkResult: bestBank is null when items are absent', () => {
  const r = buildBenchmarkResult({ product: 'overdraft', values: [6.5, 7.2], yourRate: 7.2, amount: 1000 });
  assert.equal(r.bestBank, null);
});

test('buildBenchmarkResult: unknown product -> error', () => {
  assert.equal(buildBenchmarkResult({ product: 'zzz', values: [1] }).error, 'Unknown product');
});

test('buildBenchmarkResult: no values -> error', () => {
  assert.match(buildBenchmarkResult({ product: 'overdraft', values: [] }).error, /No benchmark data/);
});
