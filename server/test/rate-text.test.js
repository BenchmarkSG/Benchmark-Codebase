// The published-rate parser shared by the scraper and the importer. What it
// decides here is what the calculator later labels "~" or "from".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRate, formatRate } from '../../scripts/lib/rate-text.mjs';

test('parseRate: a single published figure is exact', () => {
  assert.deepEqual(parseRate('6.25%'), { basis: 'exact', value: 6.25, low: null, high: null });
  assert.deepEqual(parseRate('7.5'), { basis: 'exact', value: 7.5, low: null, high: null });
  assert.deepEqual(parseRate('11,75%'), { basis: 'exact', value: 11.75, low: null, high: null }); // Indonesian comma
  assert.deepEqual(parseRate('6.25% p.a.*'), { basis: 'exact', value: 6.25, low: null, high: null });
});

test('parseRate: a range becomes its midpoint with both bounds kept', () => {
  assert.deepEqual(parseRate('8.00% - 9.50%'), { basis: 'range', value: 8.75, low: 8, high: 9.5 });
  assert.deepEqual(parseRate('8.35%–11.05%'), { basis: 'range', value: 9.7, low: 8.35, high: 11.05 });
  assert.deepEqual(parseRate('8.00 to 9.50'), { basis: 'range', value: 8.75, low: 8, high: 9.5 });
  assert.deepEqual(parseRate('11,75% s.d. 12,25%'), { basis: 'range', value: 12, low: 11.75, high: 12.25 });
  assert.deepEqual(parseRate('between 8% and 9%'), { basis: 'range', value: 8.5, low: 8, high: 9 });
  // A degenerate range is just a figure.
  assert.equal(parseRate('8% - 8%').basis, 'exact');
});

test('parseRate: a floor is kept as published and marked "from"', () => {
  assert.deepEqual(parseRate('from 7.50% p.a.'), { basis: 'from', value: 7.5, low: null, high: null });
  assert.deepEqual(parseRate('7.90% p.a. onwards'), { basis: 'from', value: 7.9, low: null, high: null });
  assert.deepEqual(parseRate('Starting from 2.88% p.a. (EIR 5.79% p.a.)'), { basis: 'from', value: 2.88, low: null, high: null });
  assert.deepEqual(parseRate('mulai dari 3,88%'), { basis: 'from', value: 3.88, low: null, high: null });
  assert.equal(parseRate('as low as 2.48% p.a.').value, 2.48);
});

test('parseRate: tenor words inside a phrase are never read as a range', () => {
  assert.deepEqual(parseRate('1 year to 2 years: 6.25%'), { basis: 'exact', value: 6.25, low: null, high: null });
  assert.deepEqual(parseRate('1 Year to < 15 months 6.25%'), { basis: 'exact', value: 6.25, low: null, high: null });
  assert.throws(() => parseRate('1 to 2 years'), /holds no rate/);
});

test('parseRate: refuses what it cannot read rather than guessing', () => {
  assert.throws(() => parseRate(''), /empty/);
  assert.throws(() => parseRate('abc'), /holds no rate/);
  assert.throws(() => parseRate('0%'), /not a positive/);
  assert.throws(() => parseRate('-'), /holds no rate/);
});

test('parseRate: a forced basis must agree with the text', () => {
  // The page says "starting from" in a heading; the cell holds only the number.
  assert.deepEqual(parseRate('7.50%', { basis: 'from' }), { basis: 'from', value: 7.5, low: null, high: null });
  assert.throws(() => parseRate('8% - 9%', { basis: 'exact' }), /is a range/);
  assert.throws(() => parseRate('8% - 9%', { basis: 'from' }), /is a range/);
  assert.throws(() => parseRate('7.5%', { basis: 'range' }), /holds no range/);
  assert.throws(() => parseRate('from 7.5%', { basis: 'exact' }), /is a floor/);
});

test('formatRate: ~ for a midpoint, "from" for a floor, plain otherwise', () => {
  assert.equal(formatRate(8.75, 'range'), '~8.75%');
  assert.equal(formatRate(7.5, 'from'), 'from 7.50%');
  assert.equal(formatRate(6.25, 'exact'), '6.25%');
  assert.equal(formatRate(6.25), '6.25%');
  assert.equal(formatRate('x'), '');
});

test('parseRate: two alternatives joined by "or" are a range of two', () => {
  assert.deepEqual(parseRate('11.25% OR 11.75%'), { basis: 'range', value: 11.5, low: 11.25, high: 11.75 });
});
