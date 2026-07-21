// Unit tests for the pure benchmarking logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amortisedMonthly,
  computeBenchmark,
  parseStatement,
  buildOtherAreas,
} from '../benchmark.js';

test('amortisedMonthly: known amortisation', () => {
  // 500k @ 2.45% over 20y = 2,637.35/mo (standard annuity formula)
  const m = amortisedMonthly(500000, 2.45, 20);
  assert.ok(Math.abs(m - 2637.35) < 1, `expected ~2637.35, got ${m}`);
});

test('amortisedMonthly: zero interest is straight division', () => {
  assert.equal(amortisedMonthly(12000, 0, 1), 1000);
});

test('amortisedMonthly: zero/invalid tenor does not divide by zero', () => {
  assert.equal(amortisedMonthly(1000, 5, 0), 0);
});

test('computeBenchmark: mortgage floating produces positive saving + monthly repayments', () => {
  const r = computeBenchmark({ bank: 'DBS', product: 'mortgage', variant: 'floating', amount: 500000, tenorYears: 20 });
  assert.equal(r.direction, 'lower');
  assert.ok(r.yourRate > r.benchmarkRate);
  assert.ok(r.annualSaving > 0);
  assert.ok(r.yourMonthly > r.benchmarkMonthly);
  assert.equal(r.benchmarkMasked, true);
  assert.ok(r.poolSize > 0);
});

test('computeBenchmark: fixed variant differs from floating', () => {
  const fixed = computeBenchmark({ product: 'mortgage', variant: 'fixed', amount: 500000, tenorYears: 20 });
  const floating = computeBenchmark({ product: 'mortgage', variant: 'floating', amount: 500000, tenorYears: 20 });
  assert.notEqual(fixed.benchmarkRate, floating.benchmarkRate);
});

test('computeBenchmark: yield product (savings) is higher-is-better', () => {
  const r = computeBenchmark({ product: 'savings', amount: 100000, tenorYears: 1 });
  assert.equal(r.direction, 'higher');
  assert.ok(r.benchmarkRate > r.yourRate);
  assert.ok(r.annualSaving > 0);
  assert.equal(r.yourMonthly, null); // deposits have no repayment
});

test('computeBenchmark: FX margin is volume-based (annualised x12)', () => {
  const monthly = 40000;
  const r = computeBenchmark({ product: 'fx_margin', corridor: 'SGD-INR', amount: monthly, tenorYears: 1 });
  // saving = monthly * 12 * (1.6 - 0.35)/100
  const expected = Math.round(monthly * 12 * (1.6 - 0.35) / 100);
  assert.equal(r.annualSaving, expected);
});

test('computeBenchmark: unknown product returns error', () => {
  assert.equal(computeBenchmark({ product: 'nope' }).error, 'Unknown product');
});

test('computeBenchmark: negative amount is clamped to 0 (no negative saving)', () => {
  const r = computeBenchmark({ product: 'mortgage', amount: -999, tenorYears: 20 });
  assert.equal(r.principal, 0);
  assert.equal(r.annualSaving, 0);
});

test('computeBenchmark: tenor is clamped to [1,40]', () => {
  const r = computeBenchmark({ product: 'mortgage', amount: 100000, tenorYears: 999 });
  assert.equal(r.tenorYears, 40);
});

test('buildOtherAreas: excludes the current product, returns 3', () => {
  const areas = buildOtherAreas('fx_margin');
  assert.equal(areas.length, 3);
  assert.ok(!areas.some((a) => a.id === 'fx_margin'));
});

test('parseStatement: sample statement detects fees and totals savings', () => {
  const sample = `Outward TT fee SGD 30
Intermediary agent fee SGD 25
Beneficiary receiving deduction SGD 15
FX conversion margin to India 1.8% on SGD 40,000
Overdraft interest 8.25%`;
  const r = parseStatement(sample);
  assert.ok(r.itemsDetected >= 4, `detected ${r.itemsDetected}`);
  assert.equal(r.benchmarkMasked, true);
  // outward 30-5=25, intermediary 25-0=25, beneficiary 15-0=15, fx 40000*(1.8-0.35)/100=580
  assert.ok(r.totalAnnualSaving >= 25 + 25 + 15 + 580 - 1);
});

test('parseStatement: percent-only line has no dollar saving', () => {
  const r = parseStatement('Overdraft interest 8.25%');
  assert.equal(r.items[0].category, 'overdraft');
  assert.equal(r.items[0].annualSaving, null);
});

test('parseStatement: empty text yields zero items with guidance note', () => {
  const r = parseStatement('');
  assert.equal(r.itemsDetected, 0);
  assert.match(r.note, /No priced fee lines/);
});

test('parseStatement: corridor detection changes benchmark', () => {
  const india = parseStatement('FX margin to India 2% on SGD 10000').items[0];
  const philippines = parseStatement('FX margin to Philippines 2% on SGD 10000').items[0];
  assert.notEqual(india.benchmarkValue, philippines.benchmarkValue);
});
