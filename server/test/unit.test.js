// Unit tests for the pure catalog + benchmarking logic (no DB, no HTTP, no FX).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS, QUESTIONNAIRES, getProduct, getQuestionnaire,
  benchmarkValues, buildBenchmarkResult, crossBorderCostPct, scoreQuestionnaire,
  monthlyPayment, totalInterest, remittanceCostPct,
  isProductInCountry, productsForCountry,
} from '../benchmark.js';
import { isRevealPaid, bearerToken, checkRevealPurchase } from '../purchases.js';
import { isSupabaseConfigured } from '../supabase.js';

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

// --- amortisation -----------------------------------------------------------
// A term loan repays principal, so a rate gap does not earn (delta × principal)
// every year for the life of the loan. These pin the real numbers from the
// Malaysia mortgage case: MYR 500,000 over 20 years, 4.00% against a pool best
// of 3.10% (Public Bank, from BNM).

test('monthlyPayment: standard annuity formula', () => {
  // 500,000 at 4% over 240 months.
  assert.equal(Math.round(monthlyPayment(500000, 4, 240)), 3030);
  assert.equal(Math.round(monthlyPayment(500000, 3.1, 240)), 2798);
  assert.equal(monthlyPayment(500000, 0, 240), 500000 / 240); // zero-rate branch
  assert.equal(monthlyPayment(0, 4, 240), 0);
  assert.equal(monthlyPayment(500000, 4, 0), 0);
});

test('totalInterest: full-term interest under amortisation', () => {
  assert.equal(Math.round(totalInterest(500000, 4, 240)), 227176);
  assert.equal(Math.round(totalInterest(500000, 3.1, 240)), 171540);
});

test('benchmarkValues: a tenor turns the flat saving into an amortised one', () => {
  const opts = { yourRate: 4.0, amount: 500000, rateType: 'apr' };
  const flat = benchmarkValues([3.1, 3.4, 4.5], opts);
  const amort = benchmarkValues([3.1, 3.4, 4.5], { ...opts, tenorMonths: 240, amortising: true });

  assert.equal(flat.amortised, false);
  assert.equal(flat.annualSaving, 4500);        // (4.0-3.1)% of 500,000, every year
  assert.equal(flat.totalSaving, null);

  assert.equal(amort.amortised, true);
  assert.equal(amort.totalSaving, 55636);       // real saving across the schedule
  assert.equal(amort.monthlySaving, 232);       // difference in the actual payment
  assert.equal(amort.monthlyPaymentNow, 3030);
  assert.equal(amort.monthlyPaymentBest, 2798);
  assert.equal(amort.termMonths, 240);
  // The flat figure, taken across 20 years, would claim 90,000 — 62% too much.
  assert.ok(flat.annualSaving * 20 > amort.totalSaving * 1.6);
});

test('benchmarkValues: no tenor keeps the long-standing flat behaviour', () => {
  const b = benchmarkValues([3.1, 4.5], { yourRate: 4.0, amount: 500000, rateType: 'apr', amortising: true });
  assert.equal(b.amortised, false);
  assert.equal(b.annualSaving, 4500);
  assert.equal(b.totalSaving, null);
});

test('benchmarkValues: a revolving product ignores the tenor', () => {
  // An overdraft is not amortising — the balance does not step down, so the
  // flat differential is the honest figure even when a tenor is supplied.
  const b = benchmarkValues([6.0, 9.0], { yourRate: 9.0, amount: 100000, rateType: 'apr', tenorMonths: 240 });
  assert.equal(b.amortised, false);
  assert.equal(b.annualSaving, 3000);
});

test('benchmarkValues: a borrower already beating the pool saves nothing', () => {
  const b = benchmarkValues([6.3, 7.0], { yourRate: 6.0, amount: 2500000, rateType: 'apr', tenorMonths: 240, amortising: true });
  assert.equal(b.totalSaving, 0);      // never a negative "saving"
  assert.equal(b.monthlySaving, 0);
  assert.equal(b.status, 'ahead');
});

test('buildBenchmarkResult: a housing loan with a tenor reports the full-term saving', () => {
  const r = buildBenchmarkResult({
    product: 'housing_loan', country: 'MY', currency: 'MYR',
    values: [3.1, 3.4, 4.5], items: [{ bank: 'Public Bank Berhad', value: 3.1 }],
    yourRate: 4.0, amount: 500000, tenor: 240,
  });
  assert.equal(r.amortised, true);
  assert.equal(r.totalSaving, 55636);
  assert.equal(r.monthlySaving, 232);
  assert.equal(r.bestBank, 'Public Bank Berhad');
});

test('buildBenchmarkResult: reports how the best rate was published', () => {
  // Bank A prints a range (8.00–9.50 → midpoint 8.75), B a figure, C a floor.
  const items = [
    { bank: 'A', value: 8.75, basis: 'range', low: 8, high: 9.5 },
    { bank: 'B', value: 9.1, basis: 'exact', low: null, high: null },
    { bank: 'C', value: 9.5, basis: 'from', low: null, high: null },
  ];
  const r = buildBenchmarkResult({
    product: 'housing_loan', country: 'IN', currency: 'INR',
    values: items.map((i) => i.value), items, yourRate: 10, amount: 5000000,
  });
  assert.equal(r.bestBank, 'A');
  assert.equal(r.benchmarkRate, 8.75);
  assert.equal(r.benchmarkBasis, 'range');
  assert.equal(r.benchmarkLow, 8);
  assert.equal(r.benchmarkHigh, 9.5);
  assert.equal(r.approxPool, true);
});

test('buildBenchmarkResult: a floor wins as "from"; an all-exact pool is not approximate', () => {
  const items = [{ bank: 'X', value: 7.5, basis: 'from', low: null, high: null }, { bank: 'Y', value: 8, basis: 'exact', low: null, high: null }];
  const r = buildBenchmarkResult({ product: 'personal_loan', country: 'IN', currency: 'INR', values: [7.5, 8], items, yourRate: 11, amount: 500000 });
  assert.equal(r.bestBank, 'X');
  assert.equal(r.benchmarkBasis, 'from');
  assert.equal(r.approxPool, true);

  const exact = [{ bank: 'P', value: 3.1 }, { bank: 'Q', value: 3.4 }]; // legacy items carry no basis
  const e = buildBenchmarkResult({ product: 'housing_loan', country: 'MY', currency: 'MYR', values: [3.1, 3.4], items: exact, yourRate: 4, amount: 500000 });
  assert.equal(e.benchmarkBasis, 'exact');
  assert.equal(e.benchmarkLow, null);
  assert.equal(e.approxPool, false);
});

test('remittanceCostPct: fees are sized on the amount actually sent', () => {
  // S$20 fee, 0.6% spread, quoted against a S$1,300 notional.
  const row = { fx_spread_pct: 0.6, upfront_fee: 20, intermediary_fee: 0, lifting_fee: 0, amount: 1300, fee_currency: 'SGD' };
  assert.equal(remittanceCostPct(row, { sentAmount: 1000, sendCurrency: 'SGD' }), 2.6);   // 0.6 + 20/1000
  assert.equal(remittanceCostPct(row, { sentAmount: 10000, sendCurrency: 'SGD' }), 0.8);  // 0.6 + 20/10000
  // No sent amount → the row's own notional.
  assert.equal(remittanceCostPct(row), Math.round((0.6 + (20 / 1300) * 100) * 100) / 100);
  // Fee in another currency than the one sent → cannot be sized, row notional again.
  assert.equal(remittanceCostPct({ ...row, fee_currency: 'USD' }, { sentAmount: 1000, sendCurrency: 'SGD' }), Math.round((0.6 + (20 / 1300) * 100) * 100) / 100);
  // All fees count.
  assert.equal(remittanceCostPct({ ...row, intermediary_fee: 25, lifting_fee: 5 }, { sentAmount: 1000, sendCurrency: 'SGD' }), 5.6);
});

// ---- Duplicate-purchase guard (server/purchases.js) -------------------------
// The reveal is sold once per saved benchmark; closing the modal and clicking
// again must not charge a second time.
test('isRevealPaid: every stage past "new" means the reveal is already bought', () => {
  for (const s of ['revealed', 'email', 'call', 'expert', 'negotiated']) {
    assert.equal(isRevealPaid(s), true, `${s} should count as paid`);
  }
  // 'new' hasn't been paid for. 'dismissed' only means the row was hidden from
  // the dashboard and says nothing either way — neither may block a sale.
  assert.equal(isRevealPaid('new'), false);
  assert.equal(isRevealPaid('dismissed'), false);
  assert.equal(isRevealPaid(null), false);
  assert.equal(isRevealPaid(undefined), false);
  assert.equal(isRevealPaid(''), false);
});

test('isRevealPaid: tolerates the casing/padding a stored value can pick up', () => {
  assert.equal(isRevealPaid(' Revealed '), true);
  assert.equal(isRevealPaid('EXPERT'), true);
  assert.equal(isRevealPaid('revealing'), false); // not a real stage — never guess
});

test('bearerToken: reads the Authorization header, or nothing at all', () => {
  assert.equal(bearerToken({ headers: { authorization: 'Bearer abc.def.ghi' } }), 'abc.def.ghi');
  assert.equal(bearerToken({ headers: { authorization: 'bearer abc' } }), 'abc'); // scheme is case-insensitive
  assert.equal(bearerToken({ headers: { authorization: '  Bearer   abc  ' } }), 'abc');
  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), '');
  assert.equal(bearerToken({ headers: {} }), '');
  assert.equal(bearerToken({}), '');
  assert.equal(bearerToken(undefined), '');
});

test('checkRevealPurchase: an anonymous buyer is allowed through', async () => {
  // A reveal no longer requires an account to buy: /api/reveal serves what was
  // bought against the paid Stripe session, so payment is the entitlement. An
  // anonymous caller has no purchase history to check, and refusing them would
  // simply block a legitimate sale.
  assert.equal(await checkRevealPurchase({ token: '', benchmarkId: 'abc' }), null);
});

// ---- Floating rates (supabase/floating_rate.sql) ---------------------------
// A Singapore mortgage is "3M SORA + 0.30%", not a fixed number. `rate` stays
// the all-in comparable figure; the index and spread ride alongside so the UI
// can show it is a formula, and which half the customer can negotiate.
test('buildBenchmarkResult: carries the winning bank’s index and spread', () => {
  const items = [
    { bank: 'A', value: 2.45, basis: 'exact', index: '3M SORA', indexValue: 1.85, spread: 0.6 },
    { bank: 'B', value: 2.15, basis: 'exact', index: '3M SORA', indexValue: 1.85, spread: 0.3 },
  ];
  const r = buildBenchmarkResult({
    product: 'housing_loan', country: 'SG', currency: 'SGD',
    values: items.map((i) => i.value), items, yourRate: 3.2, amount: 500000,
  });
  assert.equal(r.bestBank, 'B');
  assert.equal(r.benchmarkIndex, '3M SORA');
  assert.equal(r.benchmarkIndexValue, 1.85);
  assert.equal(r.benchmarkSpread, 0.3);
  assert.equal(r.floatingPool, true);
  // The spread is what differs; the all-in figure must still be what's compared.
  assert.equal(r.benchmarkRate, 2.15);
});

test('buildBenchmarkResult: a fixed pool reports no index at all', () => {
  const items = [
    { bank: 'A', value: 2.45, basis: 'exact' },
    { bank: 'B', value: 2.15, basis: 'exact' },
  ];
  const r = buildBenchmarkResult({
    product: 'housing_loan', country: 'SG', currency: 'SGD',
    values: items.map((i) => i.value), items, yourRate: 3.2, amount: 500000,
  });
  assert.equal(r.benchmarkIndex, null);
  assert.equal(r.benchmarkSpread, null);
  assert.equal(r.floatingPool, false);
});

test('buildBenchmarkResult: floatingPool is true even when the best rate is fixed', () => {
  // A mixed pool still moves, so the caveat has to appear — otherwise a
  // fixed-rate winner would silently present the whole comparison as stable.
  const items = [
    { bank: 'Fixed', value: 2.10, basis: 'exact' },
    { bank: 'Floating', value: 2.15, basis: 'exact', index: '3M SORA', indexValue: 1.85, spread: 0.3 },
  ];
  const r = buildBenchmarkResult({
    product: 'housing_loan', country: 'SG', currency: 'SGD',
    values: items.map((i) => i.value), items, yourRate: 3.2, amount: 500000,
  });
  assert.equal(r.bestBank, 'Fixed');
  assert.equal(r.benchmarkIndex, null);   // the winner is fixed …
  assert.equal(r.floatingPool, true);     // … but the pool is not
});

// ---- Flat rates (SG vehicle loans, decision 13 Sep 2026) -------------------
// A flat rate charges interest on the ORIGINAL sum for the whole tenor, so on
// the same loan it reads about half the size of an effective rate. Hong Leong
// prints both: 2.68% flat is 5.81% EIR over 1 year and 5.14% over 7. The pool
// compares flat, and every screen that shows the number has to say so.
test('buildBenchmarkResult: a flat pool is labelled as flat', () => {
  const items = [
    { bank: 'Hong Leong Finance', value: 2.68, basis: 'exact', rateType: 'flat' },
    { bank: 'Other', value: 2.88, basis: 'exact', rateType: 'flat' },
  ];
  const r = buildBenchmarkResult({
    product: 'vehicle_loan', country: 'SG', currency: 'SGD',
    values: items.map((i) => i.value), items, yourRate: 3.5, amount: 60000, tenor: 60,
  });
  assert.equal(r.bestBank, 'Hong Leong Finance');
  assert.equal(r.flatPool, true);
  assert.equal(r.poolRateType, 'flat');
});

test('buildBenchmarkResult: an effective-rate pool is not flagged flat', () => {
  const items = [
    { bank: 'A', value: 5.24, basis: 'exact', rateType: 'apr' },
    { bank: 'B', value: 5.81, basis: 'exact', rateType: 'apr' },
  ];
  const r = buildBenchmarkResult({
    product: 'vehicle_loan', country: 'IN', currency: 'INR',
    values: items.map((i) => i.value), items, yourRate: 7, amount: 60000, tenor: 60,
  });
  assert.equal(r.flatPool, false);
  assert.equal(r.poolRateType, 'apr');
});
