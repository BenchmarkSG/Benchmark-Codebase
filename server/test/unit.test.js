// Unit tests for the pure catalog + benchmarking logic (no DB, no HTTP, no FX).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS, QUESTIONNAIRES, getProduct, getQuestionnaire,
  benchmarkValues, buildBenchmarkResult, crossBorderCostPct, scoreQuestionnaire,
  isProductInCountry, productsForCountry,
} from '../benchmark.js';

test('PRODUCTS: catalog exposes the go-live products with schemas', () => {
  const ids = PRODUCTS.map((p) => p.id);
  for (const id of ['housing_loan', 'personal_loan', 'vehicle_loan', 'fixed_deposit',
    'cross_border', 'current_account', 'overdraft', 'short_term_finance', 'unfunded_facility']) {
    assert.ok(ids.includes(id), `missing ${id}`);
  }
  // segments + families
  assert.ok(getProduct('housing_loan').segments.includes('individual'));
  assert.ok(getProduct('overdraft').segments.includes('sme'));
  assert.ok(getProduct('fixed_deposit').segments.includes('individual') && getProduct('fixed_deposit').segments.includes('sme'));
  assert.equal(getProduct('cross_border').family, 'crossborder');
  assert.equal(getProduct('fixed_deposit').rateType, 'yield');
  assert.equal(getProduct('housing_loan').rateType, 'apr');
  // every product ships an input schema
  for (const p of PRODUCTS) assert.ok(Array.isArray(p.inputs) && p.inputs.length, `${p.id} has no inputs`);
  // variants where expected
  assert.ok(getProduct('unfunded_facility').inputs.some((i) => i.key === 'variant'));
  assert.equal(getProduct('nope'), null);
});

test('benchmarkValues: apr picks lowest, computes saving', () => {
  const b = benchmarkValues([8, 6, 7, 9, 10], { yourRate: 9, amount: 1000000 });
  assert.equal(b.best, 6);
  assert.equal(b.poolSize, 5);
  assert.equal(b.annualSaving, 30000); // (9-6)/100 * 1,000,000
  assert.equal(b.direction, 'lower');
});

test('benchmarkValues: yield is higher-is-better', () => {
  const b = benchmarkValues([1.8, 2.2, 2.5, 3.0], { yourRate: 1.8, amount: 100000, rateType: 'yield' });
  assert.equal(b.direction, 'higher');
  assert.equal(b.best, 3.0);
  assert.equal(b.annualSaving, 1200); // (3.0-1.8)/100 * 100,000
});

test('benchmarkValues: missing yourRate assumes market-typical (no negative saving)', () => {
  const b = benchmarkValues([5, 6, 7, 8], { amount: 100000 });
  assert.equal(b.yourRate, b.marketTypical);
  assert.ok(b.annualSaving >= 0);
});

test('benchmarkValues: empty list returns null', () => {
  assert.equal(benchmarkValues([], { yourRate: 5, amount: 1000 }), null);
});

test('benchmarkValues: user beating the pool is "ahead" with zero saving', () => {
  // apr: user's 5.0 is below every provider → already the cheapest.
  const b = benchmarkValues([6, 7, 8, 9], { yourRate: 5, amount: 1000000 });
  assert.equal(b.status, 'ahead');
  assert.equal(b.beatsBest, true);
  assert.equal(b.beatsAll, true);
  assert.equal(b.percentileBeaten, 100);
  assert.equal(b.annualSaving, 0);
});

test('benchmarkValues: yield user beating the pool is "ahead"', () => {
  const b = benchmarkValues([1.8, 2.2, 2.5, 3.0], { yourRate: 3.2, amount: 100000, rateType: 'yield' });
  assert.equal(b.status, 'ahead');
  assert.equal(b.beatsAll, true);
  assert.equal(b.annualSaving, 0);
});

test('benchmarkValues: better-than-most but not the best is "saving" with percentile', () => {
  // apr: 6.5 beats 7,8,9 (3 of 4) but the pool's best (6) is still cheaper.
  const b = benchmarkValues([6, 7, 8, 9], { yourRate: 6.5, amount: 1000000 });
  assert.equal(b.status, 'saving');
  assert.equal(b.beatsBest, false);
  assert.equal(b.beatsAll, false);
  assert.equal(b.percentileBeaten, 75);
  assert.ok(b.annualSaving > 0);
});

test('benchmarkValues: no rate entered is an "estimate"', () => {
  const b = benchmarkValues([5, 6, 7, 8], { amount: 100000 });
  assert.equal(b.status, 'estimate');
  assert.equal(b.hasYourRate, false);
});

test('buildBenchmarkResult: masked result reveals lowest-cost bank', () => {
  const r = buildBenchmarkResult({
    product: 'overdraft', country: 'SG', currency: 'SGD',
    values: [6.5, 7.2, 8.0], items: [{ bank: 'A', value: 7.2 }, { bank: 'DBS', value: 6.5 }, { bank: 'C', value: 8 }],
    yourRate: 8, amount: 1000000,
  });
  assert.equal(r.benchmarkMasked, true);
  assert.equal(r.benchmarkRate, 6.5);
  assert.equal(r.bestBank, 'DBS');
  assert.ok(r.annualSaving > 0);
});

test('buildBenchmarkResult: yield product picks highest-rate bank', () => {
  const r = buildBenchmarkResult({
    product: 'fixed_deposit', country: 'SG', currency: 'SGD',
    values: [1.8, 2.5, 2.0], items: [{ bank: 'X', value: 1.8 }, { bank: 'Digi', value: 2.5 }, { bank: 'Y', value: 2.0 }],
    yourRate: 1.8, amount: 100000,
  });
  assert.equal(r.direction, 'higher');
  assert.equal(r.bestBank, 'Digi');
});

test('buildBenchmarkResult: unknown product / no values -> error', () => {
  assert.equal(buildBenchmarkResult({ product: 'zzz', values: [1] }).error, 'Unknown product');
  assert.match(buildBenchmarkResult({ product: 'overdraft', values: [] }).error, /No benchmark data/);
});

test('crossBorderCostPct: all-in cost vs mid-market', () => {
  // sent 1000 SGD, mid 0.75 USD/SGD -> expected 750; got 740 -> 1.33% cost
  assert.equal(crossBorderCostPct({ sent: 1000, received: 740, midRate: 0.75 }), 1.33);
  // beating mid gives a negative cost
  assert.equal(crossBorderCostPct({ sent: 1000, received: 760, midRate: 0.75 }), -1.33);
  // bad inputs -> null
  assert.equal(crossBorderCostPct({ sent: 0, received: 100, midRate: 0.75 }), null);
  assert.equal(crossBorderCostPct({ sent: 1000, received: 740, midRate: 0 }), null);
});

test('scoreQuestionnaire: maturity score + expert hand-off', () => {
  const top = scoreQuestionnaire('operational_efficiency', {
    data_channel: 3, reconciliation: 3, connectivity: 3, payables: 3, obo_structure: 3,
  });
  assert.equal(top.score, 100);
  assert.equal(top.band, 'Advanced');
  assert.equal(top.recommendExpert, false);

  const low = scoreQuestionnaire('operational_efficiency', {
    data_channel: 1, reconciliation: 1, connectivity: 1, payables: 1, obo_structure: 1,
  });
  assert.equal(low.score, 33);
  assert.equal(low.band, 'Foundational');
  assert.equal(low.recommendExpert, true);

  assert.equal(scoreQuestionnaire('nope', {}).error, 'Unknown questionnaire');
  assert.ok(QUESTIONNAIRES.length >= 2 && getQuestionnaire('treasury_efficiency'));
});


/* ---- Market availability -------------------------------------------------
   India's RBI prohibits interest on current accounts, so the credit-interest
   product must not be offered there — every bank is 0% and any "best rate"
   would be unobtainable by law. Indian SMEs get the fee-based product instead. */

test('market scoping: current-account credit interest is not offered in India', () => {
  const interest = getProduct('current_account');
  assert.deepEqual(interest.onlyCountries, ['SG']);
  assert.equal(isProductInCountry(interest, 'SG'), true);
  assert.equal(isProductInCountry(interest, 'IN'), false);

  const ids = (c) => productsForCountry(c).map((p) => p.id);
  assert.ok(!ids('IN').includes('current_account'));
  assert.ok(ids('SG').includes('current_account'));
});

test('market scoping: India gets the fee-based current account instead', () => {
  const fees = getProduct('current_account_fees');
  assert.deepEqual(fees.onlyCountries, ['IN']);
  assert.equal(fees.rateType, 'apr');        // charges: lower is better
  assert.equal(fees.metricMode, 'amount');   // compared as money, not a percentage
  assert.ok(productsForCountry('IN').map((p) => p.id).includes('current_account_fees'));
  assert.ok(!productsForCountry('SG').map((p) => p.id).includes('current_account_fees'));
});

test('market scoping: unrestricted products stay available everywhere', () => {
  for (const c of ['SG', 'IN', 'MY', 'TH', 'ID']) {
    const ids = productsForCountry(c).map((p) => p.id);
    assert.ok(ids.includes('housing_loan'), `housing_loan missing for ${c}`);
    assert.ok(ids.includes('overdraft'), `overdraft missing for ${c}`);
  }
});

test('benchmarkValues: an amount metric is the saving, not a rate on a balance', () => {
  // Charges of 18,000/yr against a market best of 6,000 → saves 12,000, and the
  // balance is context only. Treated as a percentage this would read as millions.
  const b = benchmarkValues([6000, 9000, 18000, 24000], {
    yourRate: 18000, amount: 5_000_000, rateType: 'apr', metricMode: 'amount',
  });
  assert.equal(b.annualSaving, 12000);
  assert.equal(b.benchmarkRate ?? b.best, 6000);
  assert.equal(b.direction, 'lower');
});

test('buildBenchmarkResult: fee product reports its metric mode for the UI', () => {
  const r = buildBenchmarkResult({
    product: 'current_account_fees', country: 'IN', currency: 'INR',
    values: [6000, 12000, 18000], items: [
      { bank: 'Cheap Bank', value: 6000 }, { bank: 'Mid Bank', value: 12000 }, { bank: 'Dear Bank', value: 18000 },
    ],
    yourRate: 18000, amount: 2_000_000,
  });
  assert.equal(r.metricMode, 'amount');
  assert.equal(r.annualSaving, 12000);
  assert.equal(r.bestBank, 'Cheap Bank');   // lowest charges wins for an apr product
});

test('buildBenchmarkResult: percentage products are unaffected', () => {
  const r = buildBenchmarkResult({
    product: 'housing_loan', country: 'SG', currency: 'SGD',
    values: [2.5, 3.5, 4.5], items: [], yourRate: 4.5, amount: 100000,
  });
  assert.equal(r.metricMode, 'percent');
  assert.equal(r.annualSaving, 2000); // (4.5 - 2.5)% of 100,000
});
