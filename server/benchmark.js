// Pure, side-effect-free benchmarking logic. Imported by both the Express app
// and the test suite so the maths can be unit-tested without HTTP.

import { PRODUCTS, CORRIDORS, TRANSFER_LEGS, BANKS } from './data.js';

export function amortisedMonthly(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = Math.round(years * 12);
  if (n <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/** Resolve the "your rate/margin" and "benchmark rate/margin" for a product. */
function resolveRates(product, { bank, variant, corridor }) {
  const p = PRODUCTS[product];
  if (!p) return null;

  // Corridor-based products (FX margin / remittance)
  if (p.corridorBased) {
    const c = CORRIDORS[corridor] || CORRIDORS['SGD-INR'];
    return {
      your: c.marketAvg,
      benchmark: c.benchmark,
      contextLabel: c.label,
    };
  }

  // Variant-based products (mortgage fixed/floating)
  let marketAvg = p.marketAvg;
  let benchmark = p.benchmark;
  let contextLabel = null;
  if (p.variants) {
    const v = p.variants[variant] || Object.values(p.variants)[0];
    marketAvg = v.marketAvg;
    benchmark = v.benchmark;
    contextLabel = v.label;
  }

  // If we know the specific bank, use its indicative "your" rate.
  const your = bank && p.byBank && p.byBank[bank] != null ? p.byBank[bank] : marketAvg;
  return { your, benchmark, contextLabel };
}

/**
 * Core benchmark calculation.
 * @returns a result object, or { error } on invalid input.
 */
export function computeBenchmark({ bank, product, amount, tenorYears, variant, corridor } = {}) {
  const p = PRODUCTS[product];
  if (!p) return { error: 'Unknown product' };

  const principal = Math.max(0, Number(amount) || 0);
  const tenor = Math.max(1, Math.min(40, Number(tenorYears) || p.defaultTenor || 1));

  const rates = resolveRates(product, { bank, variant, corridor });
  if (!rates) return { error: 'Unknown product' };

  const { your: yourRate, benchmark: benchmarkRate, contextLabel } = rates;
  const annualFactor = p.volumeBased ? 12 : 1;

  let annualSaving = 0;
  let direction = 'lower';
  let yourMonthly = null;
  let benchmarkMonthly = null;

  if (p.rateType === 'apr') {
    // Lower is better — interest/fee cost.
    annualSaving = Math.max(0, principal * ((yourRate - benchmarkRate) / 100) * annualFactor);
    direction = 'lower';
    if (!p.volumeBased && !p.corridorBased) {
      yourMonthly = amortisedMonthly(principal, yourRate, tenor);
      benchmarkMonthly = amortisedMonthly(principal, benchmarkRate, tenor);
    }
  } else {
    // Yield — higher is better.
    annualSaving = Math.max(0, principal * ((benchmarkRate - yourRate) / 100) * annualFactor);
    direction = 'higher';
  }

  const poolSize = (p.byBank ? Object.keys(p.byBank).length : BANKS.length);

  return {
    product: p.label,
    contextLabel,
    unit: p.unit,
    bank: bank || 'Your current bank',
    yourRate,
    benchmarkRate,
    direction,
    // Bank identity is intentionally masked until a reveal CTA (see scope.md).
    benchmarkMasked: true,
    benchmarkLabel: `Top benchmark of ${poolSize} providers (hidden)`,
    poolSize,
    yourMonthly: yourMonthly != null ? Math.round(yourMonthly) : null,
    benchmarkMonthly: benchmarkMonthly != null ? Math.round(benchmarkMonthly) : null,
    annualSaving: Math.round(annualSaving),
    monthlySaving: Math.round(annualSaving / 12),
    tenorYears: tenor,
    principal,
    tip: p.tip,
    otherAreas: buildOtherAreas(product),
  };
}

export function buildOtherAreas(currentProduct) {
  const picks = [
    { id: 'personal_loan', label: 'Personal Loan', blurb: 'Save on EIR' },
    { id: 'fx_margin', label: 'FX & Remittance', blurb: 'Save up to 90% of spread' },
    { id: 'overdraft', label: 'Overdraft', blurb: 'Lower facility rate' },
    { id: 'fixed_deposit', label: 'Fixed Deposit', blurb: 'Earn up to 3.55% p.a.' },
    { id: 'savings', label: 'Savings Interest', blurb: 'Earn up to 2.5% p.a.' },
  ];
  return picks.filter((x) => x.id !== currentProduct).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Statement / transaction-text parser.
// Heuristically detects fee lines from pasted statement text and benchmarks
// each against the repository. Prototype-grade (regex, not OCR/ML).
// ---------------------------------------------------------------------------

const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)';

function pct(line) {
  const m = line.match(new RegExp(NUM + '\\s*%'));
  return m ? Number(m[1].replace(/,/g, '')) : null;
}
function sgd(line) {
  const m =
    line.match(new RegExp('(?:sgd|s\\$|\\$)\\s*' + NUM, 'i')) ||
    line.match(new RegExp(NUM + '\\s*(?:sgd|dollars?)', 'i'));
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

export function parseStatement(text = '') {
  const lines = String(text)
    .split(/[\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];

  for (const raw of lines) {
    const l = raw.toLowerCase();
    const percent = pct(l);
    const amount = sgd(l);

    let item = null;

    if (/overdraft|o\/d|od interest/.test(l) && percent != null) {
      item = fromRate('overdraft', 'Overdraft interest', percent, PRODUCTS.overdraft.benchmark, '% p.a.', amount);
    } else if (/(fx|foreign exchange|forex|conversion|exchange margin|fx margin|spread)/.test(l) && percent != null) {
      const bench = detectCorridorBenchmark(l);
      item = fromRate('fx_margin', 'FX conversion margin', percent, bench, '% margin', amount);
    } else if (/(working capital|short[- ]?term|3[- ]?month).*loan|loan.*(working capital|short)/.test(l) && percent != null) {
      item = fromRate('short_term_loan', 'Short-term loan rate', percent, PRODUCTS.short_term_loan.benchmark, '% p.a.', amount);
    } else if (/(mortgage|home loan|housing loan)/.test(l) && percent != null) {
      item = fromRate('mortgage', 'Mortgage rate', percent, PRODUCTS.mortgage.variants.floating.benchmark, '% p.a.', amount);
    } else if (/loan/.test(l) && percent != null) {
      item = fromRate('personal_loan', 'Loan rate', percent, PRODUCTS.personal_loan.benchmark, '% EIR', amount);
    } else if (/(intermediary|agent fee|correspondent|cable)/.test(l) && amount != null) {
      item = fromFee('Intermediary / agent fee', amount, TRANSFER_LEGS.intermediary.benchmark);
    } else if (/(beneficiary|receiving|deduct)/.test(l) && amount != null) {
      item = fromFee('Beneficiary deduction', amount, TRANSFER_LEGS.beneficiary.benchmark);
    } else if (/(tt|telegraphic|wire|swift|remittance|outward|cross.?border|transfer)/.test(l) && amount != null) {
      item = fromFee('Outward transfer fee', amount, TRANSFER_LEGS.initiation.benchmark);
    } else if (/(commission|handling|service charge|monthly (account )?fee|account fee|maintenance)/.test(l) && amount != null) {
      item = fromFee('Account / service fee', amount, Math.round(amount * 0.3));
    }

    if (item) items.push({ ...item, source: raw });
  }

  const totalAnnualSaving = items.reduce((s, i) => s + (i.annualSaving || 0), 0);

  return {
    itemsDetected: items.length,
    linesScanned: lines.length,
    items,
    totalAnnualSaving: Math.round(totalAnnualSaving),
    benchmarkMasked: true,
    poolSize: BANKS.length,
    note:
      items.length === 0
        ? 'No priced fee lines detected. Try lines like "Outward TT fee SGD 30" or "FX margin 1.8%".'
        : 'Illustrative benchmark. Winning providers are hidden until you request the reveal.',
  };
}

function detectCorridorBenchmark(l) {
  if (/india|inr/.test(l)) return CORRIDORS['SGD-INR'].benchmark;
  if (/philippine|php/.test(l)) return CORRIDORS['SGD-PHP'].benchmark;
  if (/bangladesh|bdt/.test(l)) return CORRIDORS['SGD-BDT'].benchmark;
  if (/pakistan|pkr/.test(l)) return CORRIDORS['SGD-PKR'].benchmark;
  if (/china|cny|rmb/.test(l)) return CORRIDORS['SGD-CNY'].benchmark;
  if (/usd|dollar/.test(l)) return CORRIDORS['SGD-USD'].benchmark;
  return 0.4; // sensible default best-in-class margin
}

// Rate-style line: saving needs a base amount to become a dollar figure.
function fromRate(category, label, yourRate, benchmarkRate, unit, baseAmount) {
  const delta = Math.max(0, yourRate - benchmarkRate);
  const annualSaving = baseAmount != null ? Math.round(baseAmount * (delta / 100)) : null;
  return {
    category,
    label,
    yourValue: yourRate,
    benchmarkValue: benchmarkRate,
    unit,
    baseAmount: baseAmount ?? null,
    annualSaving,
    note: baseAmount == null ? 'Add the balance/volume for a dollar estimate' : null,
  };
}

// Flat-fee line: dollar saving is direct.
function fromFee(label, yourFee, benchmarkFee) {
  return {
    category: 'transfer_fee',
    label,
    yourValue: yourFee,
    benchmarkValue: benchmarkFee,
    unit: 'SGD / txn',
    baseAmount: null,
    annualSaving: Math.max(0, Math.round(yourFee - benchmarkFee)),
    note: 'Per transaction — multiply by your monthly volume',
  };
}

// Re-export for the app layer.
export { PRODUCTS, CORRIDORS, TRANSFER_LEGS, BANKS };
