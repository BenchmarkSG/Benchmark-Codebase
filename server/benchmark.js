// Pure benchmarking logic for the homepage calculator.
// Values come from Supabase (via ratesRepo); this module holds only the product
// metadata and the side-effect-free maths, so it can be unit-tested directly.

// Products the calculator benchmarks.
// segments: which audience tab(s) show the product ('individual' | 'sme').
// rateType: 'apr' (a cost — lower is better) | 'yield' (a return — higher is better).
// currencyMode: 'localusd' → offer [local ccy, USD]; 'local' → [local]; 'usd' → [USD].
// annualiser: multiplies a per-period rate to an annual cost (LC issuance is /quarter).
export const PRODUCTS = [
  // ---- Individual ----
  {
    id: 'mortgage', label: 'Mortgage / home loan', unit: '% p.a.',
    segments: ['individual'], rateType: 'apr', currencyMode: 'local', annualiser: 1,
    yourLabel: 'Your mortgage rate (% p.a.)', amountLabel: 'Loan amount',
    tip: 'Banks publish teaser/board rates; benchmark to what borrowers like you actually got, then reprice.',
  },
  {
    id: 'personal_loan', label: 'Personal loan', unit: '% EIR',
    segments: ['individual'], rateType: 'apr', currencyMode: 'local', annualiser: 1,
    yourLabel: 'Your loan EIR (%)', amountLabel: 'Loan amount',
    tip: 'Advertised rates are “card” rates; realised EIR varies by credit profile.',
  },
  {
    id: 'savings', label: 'Savings account interest', unit: '% p.a.',
    segments: ['individual'], rateType: 'yield', currencyMode: 'local', annualiser: 1,
    yourLabel: 'Your savings rate (% p.a.)', amountLabel: 'Balance',
    tip: 'Digital banks and bonus-interest accounts materially out-earn legacy savings rates.',
  },
  {
    id: 'fixed_deposit', label: 'Fixed deposit', unit: '% p.a.',
    segments: ['individual'], rateType: 'yield', currencyMode: 'local', annualiser: 1,
    yourLabel: 'Your FD rate (% p.a.)', amountLabel: 'Deposit amount',
    tip: 'Smaller and foreign banks frequently lead on FD promotional yields.',
  },
  // ---- SME / Corporate ----
  {
    id: 'overdraft', label: 'Overdraft facility', unit: '% p.a.',
    segments: ['sme'], rateType: 'apr', currencyMode: 'localusd', annualiser: 1,
    yourLabel: 'Your overdraft rate (% p.a.)', amountLabel: 'Facility / utilised amount',
    tip: 'Overdraft pricing is highly negotiable for SMEs with steady turnover — most never ask.',
  },
  {
    id: 'short_term_local', label: 'Short-term loan (local ccy)', unit: '% p.a.',
    segments: ['sme'], rateType: 'apr', currencyMode: 'local', annualiser: 1,
    yourLabel: 'Your loan rate (% p.a.)', amountLabel: 'Loan amount',
    tip: 'Short-tenor facilities reprice fast — a small rate cut compounds across rollovers.',
  },
  {
    id: 'short_term_usd', label: 'Short-term loan (USD)', unit: '% p.a.',
    segments: ['sme'], rateType: 'apr', currencyMode: 'usd', annualiser: 1,
    yourLabel: 'Your USD loan rate (% p.a.)', amountLabel: 'Loan amount (USD)',
    tip: 'USD working-capital is SOFR-linked — benchmark the spread over the index.',
  },
  {
    id: 'import_lc', label: 'Import LC (issuance fee)', unit: '% / quarter',
    segments: ['sme'], rateType: 'apr', currencyMode: 'usd', annualiser: 4,
    yourLabel: 'Your issuance commission (% / quarter)', amountLabel: 'LC amount (USD)',
    tip: 'LC issuance commission is quoted per quarter — negotiate the rate and the minimum charge.',
  },
  {
    id: 'export_lc_discount', label: 'Export LC discounting', unit: '% p.a.',
    segments: ['sme'], rateType: 'apr', currencyMode: 'usd', annualiser: 1,
    yourLabel: 'Your discount rate (% p.a.)', amountLabel: 'LC amount (USD)',
    tip: 'Discounting rates vary widely between banks — benchmark before accepting the first quote.',
  },
  // ---- Both ----
  {
    id: 'remittance', label: 'Cross-border FX spread', unit: '% spread',
    segments: ['individual', 'sme'], rateType: 'apr', currencyMode: 'local', annualiser: 1,
    yourLabel: 'Your FX spread (%)', amountLabel: 'Annual transfer volume',
    tip: 'FX spread is the most invisible cost — it is baked into the rate, not shown as a fee.',
  },
];

export const getProduct = (id) => PRODUCTS.find((p) => p.id === id) || null;

const round2 = (n) => Math.round(n * 100) / 100;

// Pick the best-priced bank from [{ bank, value }] items: lowest for a cost
// (apr), highest for a return (yield). Returns null if nothing usable.
function pickBestBank(items, rateType) {
  const finite = (items || []).filter((i) => i && i.bank && Number.isFinite(Number(i.value)));
  if (!finite.length) return null;
  const best = finite.reduce((a, b) =>
    rateType === 'yield'
      ? (Number(b.value) > Number(a.value) ? b : a)
      : (Number(b.value) < Number(a.value) ? b : a));
  return best.bank;
}

/**
 * Benchmark a list of comparable rate values.
 * @param rateType 'apr' (lower is better) | 'yield' (higher is better)
 * @returns null if there are no values, else the masked benchmark summary.
 */
export function benchmarkValues(values, { yourRate, amount = 0, annualiser = 1, rateType = 'apr' } = {}) {
  const asc = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!asc.length) return null;

  const isYield = rateType === 'yield';
  const best = isYield ? asc[asc.length - 1] : asc[0];
  const median = asc[Math.floor(asc.length / 2)];
  // "Market typical" ≈ the worse quartile: upper for a cost, lower for a return.
  const marketTypical = isYield
    ? asc[Math.floor(asc.length * 0.25)]
    : asc[Math.max(0, Math.ceil(asc.length * 0.75) - 1)];

  const your = Number.isFinite(Number(yourRate)) ? Number(yourRate) : marketTypical;
  const notional = Math.max(0, Number(amount) || 0);
  const delta = isYield ? best - your : your - best;
  const annualSaving = Math.max(0, (delta / 100) * notional * annualiser);

  return {
    best: round2(best),
    median: round2(median),
    marketTypical: round2(marketTypical),
    yourRate: round2(your),
    poolSize: asc.length,
    annualSaving: Math.round(annualSaving),
    monthlySaving: Math.round(annualSaving / 12),
    direction: isYield ? 'higher' : 'lower',
  };
}

/**
 * Assemble the API benchmark response from a product + its values.
 * Bank identities stay masked until a reveal CTA (see scope.md).
 */
export function buildBenchmarkResult({ product, country, currency, values, items, yourRate, amount }) {
  const meta = getProduct(product);
  if (!meta) return { error: 'Unknown product' };
  const b = benchmarkValues(values, { yourRate, amount, annualiser: meta.annualiser, rateType: meta.rateType });
  if (!b) return { error: 'No benchmark data for this selection yet.' };

  return {
    product: meta.label,
    unit: meta.unit,
    country,
    currency: currency || null,
    direction: b.direction,
    yourRate: b.yourRate,
    benchmarkRate: b.best,
    marketTypical: b.marketTypical,
    median: b.median,
    poolSize: b.poolSize,
    benchmarkMasked: true,
    benchmarkLabel: `Best of ${b.poolSize} providers (hidden)`,
    // The winning bank — revealed on the "next steps" screen (Screen 3).
    bestBank: pickBestBank(items, meta.rateType),
    annualSaving: b.annualSaving,
    monthlySaving: b.monthlySaving,
    tip: meta.tip,
  };
}
