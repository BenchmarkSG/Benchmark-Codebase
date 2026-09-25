// Product catalog + pure benchmarking logic for the calculator.
// Data (market rate pools, FX) comes from Supabase / the FX service; this module
// holds only product metadata, the per-product INPUT SCHEMAS the calculator
// renders, and the side-effect-free maths — so it is directly unit-testable.

/* ---- Field option lists ---------------------------------------------------- */
const RATE_BASIS = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'floating', label: 'Floating' },
];
const FUNDED_TYPES = [
  { value: 'import_finance', label: 'Import finance' },
  { value: 'export_finance', label: 'Export finance' },
  { value: 'supplier_finance', label: 'Supplier finance' },
  { value: 'bill_discounting', label: 'Bill discounting' },
];
const UNFUNDED_TYPES = [
  { value: 'lc', label: 'Letter of Credit (L/C)' },
  { value: 'bg', label: 'Bank Guarantee (BG)' },
  { value: 'sblc', label: 'Standby L/C (SBLC)' },
];
const REMIT_DIRECTION = [
  { value: 'outgoing', label: 'Outgoing' },
  { value: 'incoming', label: 'Incoming' },
];

/* ---- Field builders (role: metric = benchmarked · context = drives maths ·
        meta = descriptive) ------------------------------------------------- */
const bank = (label = 'Your current provider') => ({ key: 'bank', label, type: 'bank', role: 'meta', required: false });
const amount = (label, placeholder = 'e.g. 500000') => ({ key: 'amount', label, type: 'amount', role: 'context', required: true, placeholder });
const rate = (label, unit = '% p.a.', placeholder = 'e.g. 3.50') => ({ key: 'rate', label, type: 'rate', role: 'metric', required: false, unit, placeholder });
const tenor = () => ({ key: 'tenor', label: 'Tenor (months)', type: 'tenor', role: 'context', required: false, placeholder: 'e.g. 240' });
const currency = (required = true) => ({ key: 'currency', label: 'Currency', type: 'currency', role: 'context', required });
const rateBasis = () => ({ key: 'rate_basis', label: 'Rate type', type: 'enum', role: 'context', required: false, options: RATE_BASIS });
const variant = (label, options) => ({ key: 'variant', label, type: 'enum', role: 'context', required: true, options });
// A money metric rather than a rate. Keeps key 'rate' so it flows through the
// same metricKey / yourRate plumbing; `metricMode: 'amount'` on the product is
// what tells the maths and the UI to treat it as a sum, not a percentage.
const feeAmount = (label, placeholder = 'e.g. 12000') => ({ key: 'rate', label, type: 'amount', role: 'metric', required: false, placeholder });

// The two mirrored legs of a cross-border transfer. `direction` picks the leg.
const crossBorderInputs = () => [
  { key: 'direction', label: 'Direction', type: 'enum', role: 'context', required: true, options: REMIT_DIRECTION },
  bank('Remitting / receiving bank'),
  { key: 'send_currency', label: 'Sent currency', type: 'currency', role: 'context', required: true },
  { key: 'sent_amount', label: 'Amount sent / debited (Dr)', type: 'amount', role: 'context', required: true, placeholder: 'e.g. 5000' },
  { key: 'receive_currency', label: 'Received currency', type: 'currency', role: 'context', required: true },
  { key: 'received_amount', label: 'Amount received / credited (Cr)', type: 'amount', role: 'context', required: true, placeholder: 'e.g. 305000' },
];

/* ---- Product catalog ------------------------------------------------------
   family:      'rate' (benchmark one stored rate) | 'crossborder' (derived cost)
   rateType:    'apr' (cost → lower is better) | 'yield' (return → higher better)
   currencyMode:'local' | 'usd' | 'localusd' | 'multi'
   metricKey:   which input carries the benchmarked number
   amountKey:   which input sizes the saving
   variantKey:  present when the product splits into stored sub-pools
   annualiser:  multiplies a per-period rate to an annual figure
   metricMode:  'percent' (default) | 'amount' — is the compared number a rate,
                or a sum of money already expressed per year?
   amortising:  the balance is repaid over the tenor, so a rate difference does
                NOT apply to the full principal for the whole term. Set on term
                loans only — an overdraft or trade facility revolves at (roughly)
                full drawn balance, and a deposit's balance doesn't fall either.
   onlyCountries: ALLOWLIST of markets where the product is lawful/meaningful.
                An allowlist, not a denylist, because the reason a product is
                restricted is usually regulatory: current-account credit interest
                is prohibited outright in India, so a new market has to be shown
                eligible before the product appears there, never assumed.       */
export const PRODUCTS = [
  // ------- Individual -------
  {
    id: 'housing_loan', label: 'Housing loan', blurb: 'Home loan rates & conditions', category: 'loan',
    segments: ['individual'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount', amortising: true,
    inputs: [bank('Your Bank/Finance Company'), amount('Outstanding amount'), tenor(), rate('Your interest rate (% p.a.)'), rateBasis()],
    tip: 'Home-loan rates are highly repriceable — lenders quote board rates but settle far lower to retain good borrowers.',
  },
  {
    id: 'personal_loan', label: 'Personal loan', blurb: 'Interest rates & processing fees', category: 'loan',
    segments: ['individual'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount', amortising: true,
    inputs: [bank('Your Bank/Finance Company'), amount('Outstanding amount'), tenor(), rate('Your interest rate (% p.a.)'), rateBasis()],
    tip: 'Advertised “from” rates rarely match realised EIR — benchmark what borrowers with your profile actually pay.',
  },
  {
    id: 'vehicle_loan', label: 'Vehicle loan', blurb: 'Car & vehicle financing rates', category: 'loan',
    segments: ['individual'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount', amortising: true,
    inputs: [bank('Your Bank/Finance Company'), amount('Outstanding amount'), tenor(), rate('Your interest rate (% p.a.)'), rateBasis()],
    tip: 'Dealer-arranged financing is often costlier than refinancing directly with a bank.',
  },
  // ------- Both -------
  {
    id: 'fixed_deposit', label: 'Fixed deposit', blurb: 'Maturity yields & terms', category: 'deposit',
    segments: ['individual', 'sme'], family: 'rate', rateType: 'yield', unit: '% p.a.',
    currencyMode: 'multi', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
    inputs: [bank('Your Bank/Finance Company'), amount('Deposit amount'), tenor(), rate('Your FD rate (% p.a.)'), currency(false)],
    tip: 'Smaller and foreign banks routinely lead on FD promotional yields.',
  },
  {
    id: 'cross_border', label: 'Cross-border transfer', blurb: 'FX margins & transfer fees', category: 'remittance',
    segments: ['individual', 'sme'], family: 'crossborder', rateType: 'apr', unit: '% all-in cost',
    // The saving is sized on the amount sent, so it is PER TRANSFER, not per
    // year — the client labels it that way (see the product id checks there).
    currencyMode: 'multi', annualiser: 1, metricKey: 'cost_pct', amountKey: 'sent_amount',
    inputs: crossBorderInputs(),
    tip: 'The real cost is the FX margin baked into the rate — not the visible fee. We compute it against the mid-market rate.',
  },
  // ------- SME / Corporate -------
  {
    // Credit interest on balances — only offered where a regulator permits banks
    // to pay it. India's RBI prohibits interest on current accounts outright, so
    // every Indian bank is 0% and a "best rate" here would be unobtainable by
    // law. Indian SMEs get `current_account_fees` below instead. Before adding a
    // market to this list, confirm its central bank allows credit interest —
    // several in the region do not.
    id: 'current_account', label: 'Current account', blurb: 'Credit interest & maintenance fees', category: 'account',
    segments: ['sme'], family: 'rate', rateType: 'yield', unit: '% p.a.',
    onlyCountries: ['SG'],
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
    inputs: [bank('Your bank'), amount('Average daily balance'), rate('Credit interest / rebate (% p.a.)'), currency(false)],
    tip: 'Idle balances can earn interest or fee rebates that most SMEs never negotiate for.',
  },
  {
    // The Indian equivalent. With interest off the table by regulation, what an
    // SME can actually negotiate is cost: the minimum-balance requirement and
    // the charges stacked on top of it. Benchmarked as an absolute annual sum
    // (lower is better) rather than a rate, since none of it is a percentage.
    id: 'current_account_fees', label: 'Current account (charges)', blurb: 'Account maintenance & transaction charges', category: 'account',
    segments: ['sme'], family: 'rate', rateType: 'apr', unit: 'total charges per year',
    onlyCountries: ['IN'],
    metricMode: 'amount',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
    inputs: [
      bank('Your bank'),
      amount('Average monthly balance you keep'),
      feeAmount('Total charges you pay per year'),
      currency(false),
    ],
    tip: 'Indian current accounts pay no interest — by RBI rule. What is negotiable is the minimum balance, the non-maintenance penalty, and cash-handling and NEFT/RTGS charges. Banks waive these for steady turnover far more often than SMEs ask.',
  },
  {
    id: 'overdraft', label: 'Overdraft facility', blurb: 'Working-capital line pricing', category: 'account',
    segments: ['sme'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'localusd', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
    inputs: [bank('Your bank'), amount('Average utilised balance'), rate('Your overdraft rate (% p.a.)'), currency(false)],
    tip: 'Overdraft pricing is very negotiable for SMEs with steady turnover — most never ask.',
  },
  {
    id: 'short_term_finance', label: 'Short-term finance (funded)', blurb: 'Trade & invoice financing rates', category: 'trade_finance',
    segments: ['sme'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'localusd', annualiser: 1, metricKey: 'rate', amountKey: 'amount', variantKey: 'variant',
    inputs: [bank('Your bank'), variant('Facility type', FUNDED_TYPES), amount('Facility amount'), tenor(), rate('Your rate (% p.a.)'), currency(false)],
    tip: 'Short-tenor facilities reprice fast — a small rate cut compounds across rollovers.',
  },
  {
    id: 'unfunded_facility', label: 'Unfunded facility', blurb: 'L/C, BG & SBLC commissions', category: 'trade_finance',
    segments: ['sme'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'usd', annualiser: 1, metricKey: 'rate', amountKey: 'amount', variantKey: 'variant',
    inputs: [bank('Your bank'), variant('Instrument', UNFUNDED_TYPES), amount('Facility amount'), tenor(), rate('Commission / fee (% p.a.)'), currency(false)],
    tip: 'L/C, BG and SBLC commissions vary widely between banks — benchmark the rate and the minimum charge.',
  },
];

/* ---- Questionnaires (NOT benchmarks) --------------------------------------
   Structural profiling → a maturity score + "talk to an expert" hand-off.     */
const scale = (key, label) => ({ key, label, type: 'scale', role: 'score', required: false, options: [
  { value: 1, label: 'Basic' }, { value: 2, label: 'Developing' }, { value: 3, label: 'Advanced' },
] });

export const QUESTIONNAIRES = [
  {
    id: 'treasury_efficiency', label: 'Treasury efficiency', segment: 'sme',
    intro: 'A quick structural review of how your group treasury is set up.',
    inputs: [
      { key: 'entities', label: 'Number of entities', type: 'count', role: 'context', required: true, placeholder: 'e.g. 3' },
      { key: 'accounts_per_entity', label: 'Accounts per entity', type: 'count', role: 'context', required: false, placeholder: 'e.g. 2' },
      { key: 'shareholding_pct', label: 'Shareholding %', type: 'percent', role: 'context', required: false, placeholder: 'e.g. 100' },
      { key: 'account_locations', label: 'Location of accounts', type: 'text', role: 'context', required: false, placeholder: 'e.g. Singapore, Hong Kong' },
      { key: 'bank_names', label: 'Banks used (Dr / Cr)', type: 'text', role: 'context', required: false, placeholder: 'e.g. DBS, HSBC' },
      { key: 'daily_avg_balance', label: 'Daily average balance (Dr / Cr)', type: 'amount', role: 'context', required: false, placeholder: 'e.g. 250000' },
      scale('liquidity_structure', 'Currency / liquidity structure maturity'),
    ],
    scoreKeys: ['liquidity_structure'],
  },
  {
    id: 'operational_efficiency', label: 'Operational efficiency', segment: 'sme',
    intro: 'How automated and centralised are your banking operations?',
    inputs: [
      { key: 'entities', label: 'Number of entities', type: 'count', role: 'context', required: true, placeholder: 'e.g. 3' },
      { key: 'bank_accounts', label: 'Number of bank accounts', type: 'count', role: 'context', required: false, placeholder: 'e.g. 6' },
      scale('data_channel', 'Bank-data channel (statements → host-to-host)'),
      scale('reconciliation', 'Reconciliation method (manual → automated)'),
      scale('connectivity', 'Bank connectivity (portals → API/SWIFT)'),
      scale('payables', 'Payables model (decentralised → centralised)'),
      scale('obo_structure', 'IHB / POBO / ROBO adoption'),
    ],
    scoreKeys: ['data_channel', 'reconciliation', 'connectivity', 'payables', 'obo_structure'],
  },
];

/* ---- Accessors ------------------------------------------------------------- */
export const getProduct = (id) => PRODUCTS.find((p) => p.id === id) || null;
// No `onlyCountries` means the product is universal. Products that carry one are
// confined to it — see the catalog notes above for why this is an allowlist.
export const isProductInCountry = (p, country) => !p?.onlyCountries || p.onlyCountries.includes(country);
export const productsForCountry = (country) => PRODUCTS.filter((p) => isProductInCountry(p, country));
export const getQuestionnaire = (id) => QUESTIONNAIRES.find((q) => q.id === id) || null;
export const productDirection = (p) => (p?.rateType === 'yield' ? 'higher' : 'lower');

const round2 = (n) => Math.round(n * 100) / 100;

/* ---- Cross-border: true all-in cost vs the mid-market rate -----------------
   costPct = 1 − (received ÷ (sent × midRate)), as a percentage. Positive = the
   customer lost that % to spread + fees; can be negative if they beat mid.
   `midRate` is units of receive-currency per 1 unit of send-currency.          */
export function crossBorderCostPct({ sent, received, midRate }) {
  const s = Number(sent), r = Number(received), m = Number(midRate);
  if (!(s > 0) || !(r >= 0) || !(m > 0)) return null;
  const expected = s * m;            // what they'd get at mid-market
  return round2((1 - r / expected) * 100);
}

// Pick the best-priced item from [{ bank, value, basis? }]: lowest for a cost
// (apr), highest for a return (yield). Returns the whole item so the caller
// can report both who it is and how that rate was published.
export function pickBestItem(items, rateType) {
  const finite = (items || []).filter((i) => i && i.bank && Number.isFinite(Number(i.value)));
  if (!finite.length) return null;
  return finite.reduce((a, b) =>
    rateType === 'yield' ? (Number(b.value) > Number(a.value) ? b : a) : (Number(b.value) < Number(a.value) ? b : a));
}

/* All-in cost of one bank's outward transfer, as a % of the amount sent:
   the FX spread over mid-market plus the published fees spread over the
   notional. Fees are applied to the customer's OWN sent amount when it is
   known and the fees are quoted in that currency — a S$20 fee is 2% of
   S$1,000 and 0.2% of S$10,000, so the row's stored notional is only a
   fallback. Fees in another currency cannot be sized without a rate, so
   the row's own notional (which the fee was quoted against) is used. */
export function remittanceCostPct(row, { sentAmount = 0, sendCurrency = null } = {}) {
  const fees = Number(row.upfront_fee || 0) + Number(row.intermediary_fee || 0) + Number(row.lifting_fee || 0);
  const spread = Number(row.fx_spread_pct || 0);
  const own = Number(sentAmount) > 0 && (!sendCurrency || !row.fee_currency || row.fee_currency === sendCurrency);
  const notional = own ? Number(sentAmount) : Number(row.amount) || 0;
  const feePct = notional > 0 ? (fees / notional) * 100 : 0;
  return Math.round((spread + feePct) * 100) / 100;
}

/* Level-payment (annuity) amortisation. A term loan's balance falls every month,
   so a rate difference does NOT earn (delta × principal) every year — over 20
   years it earns roughly half that. Quoting the flat figure across the tenor
   overstates the saving by ~60% on a typical mortgage. */
export function monthlyPayment(principal, annualPct, months) {
  const P = Number(principal) || 0, n = Math.round(Number(months) || 0);
  if (P <= 0 || n <= 0) return 0;
  const r = (Number(annualPct) || 0) / 100 / 12;
  return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
}

/** Total interest paid over the full term under level-payment amortisation. */
export function totalInterest(principal, annualPct, months) {
  const P = Number(principal) || 0, n = Math.round(Number(months) || 0);
  if (P <= 0 || n <= 0) return 0;
  return monthlyPayment(P, annualPct, n) * n - P;
}

/**
 * Benchmark a list of comparable values. rateType 'apr' (lower better) |
 * 'yield' (higher better). Returns null if there are no values.
 *
 * `tenorMonths` + `amortising` switch the saving from a flat annual
 * differential to a properly amortised one. Both must be present — without a
 * tenor the flat figure is the only defensible answer, and that is the
 * long-standing behaviour every caller without a tenor still gets.
 */
export function benchmarkValues(values, { yourRate, amount = 0, annualiser = 1, rateType = 'apr', metricMode = 'percent', tenorMonths = 0, amortising = false } = {}) {
  const asc = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!asc.length) return null;

  const isYield = rateType === 'yield';
  const best = isYield ? asc[asc.length - 1] : asc[0];
  const median = asc[Math.floor(asc.length / 2)];
  const marketTypical = isYield ? asc[Math.floor(asc.length * 0.25)] : asc[Math.max(0, Math.ceil(asc.length * 0.75) - 1)];

  const hasYourRate = Number.isFinite(Number(yourRate));
  const your = hasYourRate ? Number(yourRate) : marketTypical;
  const notional = Math.max(0, Number(amount) || 0);
  const delta = isYield ? best - your : your - best; // > 0 ⇒ the best provider still beats you
  // A percentage metric has to be applied to the balance to become money. An
  // amount metric IS the money already, so the notional plays no part — multiply
  // by it and a ₹12,000 fee gap on a ₹5,000,000 balance reads as ₹600m saved.
  const flatAnnualSaving = metricMode === 'amount'
    ? Math.max(0, delta * annualiser)
    : Math.max(0, (delta / 100) * notional * annualiser);

  // A term loan with a known tenor gets the real number: the difference in
  // total interest across the schedule, and the difference in the monthly
  // payment the borrower actually writes. Anything else keeps the flat figure.
  const term = Math.round(Number(tenorMonths) || 0);
  const amortised = amortising && metricMode === 'percent' && term > 0 && notional > 0;
  let annualSaving = flatAnnualSaving;
  let monthlySaving = flatAnnualSaving / 12;
  let totalSaving = null, monthlyPaymentNow = null, monthlyPaymentBest = null;
  if (amortised) {
    monthlyPaymentNow = monthlyPayment(notional, your, term);
    monthlyPaymentBest = monthlyPayment(notional, best, term);
    totalSaving = Math.max(0, totalInterest(notional, your, term) - totalInterest(notional, best, term));
    monthlySaving = Math.max(0, monthlyPaymentNow - monthlyPaymentBest);
    // Averaged across the term, so "per year" stays true for the whole tenor
    // rather than only for the first one.
    annualSaving = totalSaving / (term / 12);
  }

  // Where the user stands in the pool (only meaningful once they entered a rate).
  const betterThan = asc.filter((v) => (isYield ? v < your : v > your)).length;
  const percentileBeaten = Math.round((betterThan / asc.length) * 100);
  const beatsBest = isYield ? your >= best : your <= best; // at least as good as the pool's best
  const beatsAll = betterThan === asc.length;              // strictly better than every provider
  const status = !hasYourRate ? 'estimate' : beatsBest ? 'ahead' : 'saving';

  return {
    best: round2(best), median: round2(median), marketTypical: round2(marketTypical),
    yourRate: round2(your), poolSize: asc.length,
    annualSaving: Math.round(annualSaving), monthlySaving: Math.round(monthlySaving),
    // Present only for an amortising product with a tenor — the full-term
    // saving, and the two payments it is the difference of.
    amortised,
    termMonths: amortised ? term : null,
    totalSaving: amortised ? Math.round(totalSaving) : null,
    monthlyPaymentNow: amortised ? Math.round(monthlyPaymentNow) : null,
    monthlyPaymentBest: amortised ? Math.round(monthlyPaymentBest) : null,
    direction: isYield ? 'higher' : 'lower',
    hasYourRate, beatsBest, beatsAll, percentileBeaten, status,
  };
}

/**
 * Assemble the masked benchmark response for a product from its market values.
 * `extra` carries product-family specifics (e.g. cross-border settlement time).
 */
export function buildBenchmarkResult({ product, country, currency, values, items, yourRate, amount, tenor, dataQuality = null, extra = {} }) {
  const meta = getProduct(product);
  if (!meta) return { error: 'Unknown product' };
  const b = benchmarkValues(values, {
    yourRate, amount, annualiser: meta.annualiser, rateType: meta.rateType, metricMode: meta.metricMode,
    tenorMonths: tenor, amortising: meta.amortising === true,
  });
  if (!b) return { error: 'No benchmark data for this selection yet.' };
  const bestItem = pickBestItem(items, meta.rateType);

  return {
    product: meta.label,
    unit: meta.unit,
    metricMode: meta.metricMode || 'percent', // 'amount' ⇒ render as money, not %
    country,
    currency: currency || null,
    direction: b.direction,
    yourRate: b.yourRate,
    benchmarkRate: b.best,
    marketTypical: b.marketTypical,
    median: b.median,
    poolSize: b.poolSize,
    benchmarkMasked: true,
    // 'real' — every rate in the pool came from a regulator feed or a published
    // rate sheet. 'indicative'/'mixed' — at least one is generated, so the UI
    // must say so rather than presenting it as a market benchmark.
    dataQuality,
    benchmarkLabel: `Best of ${b.poolSize} providers (hidden)`,
    bestBank: bestItem?.bank ?? null,
    // How the best rate was published (see supabase/rate_basis.sql):
    //   'exact' — a single figure;  'range' — benchmarkRate is the MIDPOINT of
    //   benchmarkLow–benchmarkHigh and the UI shows "~";  'from' — a floor the
    //   lender advertises ("from 7.50%"), shown as "from". Never invented: the
    //   basis is whatever the bank printed.
    benchmarkBasis: bestItem?.basis || 'exact',
    benchmarkLow: bestItem?.low ?? null,
    benchmarkHigh: bestItem?.high ?? null,
    // True when any rate in the pool is a midpoint or a floor — the median and
    // market-typical figures are then approximate too, and the UI says so.
    approxPool: (items || []).some((i) => i && i.basis && i.basis !== 'exact'),
    // Floating pricing (supabase/floating_rate.sql). A Singapore mortgage is
    // "3M SORA + 0.30%", an Indian one "RLLR + spread": benchmarkRate is that
    // sum TODAY, and it moves when the index does. Null on a fixed rate.
    benchmarkIndex: bestItem?.index ?? null,
    benchmarkIndexValue: bestItem?.indexValue ?? null,
    benchmarkSpread: bestItem?.spread ?? null,
    // True when any rate in the pool tracks an index — the whole comparison is
    // then a snapshot, and the UI says so rather than implying it is fixed.
    floatingPool: (items || []).some((i) => i && i.index),
    // 'flat' when the pool is quoted the way Singapore car loans are: interest
    // on the original sum for the whole tenor, roughly half the effective rate
    // for the same money. The importer refuses to mix bases in one pool, so
    // this describes every rate in it, not just the winner.
    poolRateType: (items || []).find((i) => i && i.rateType)?.rateType ?? null,
    flatPool: (items || []).some((i) => i && i.rateType === 'flat'),
    annualSaving: b.annualSaving,
    monthlySaving: b.monthlySaving,
    // Term loans only: the saving over the whole schedule, plus the payments it
    // comes from. Null elsewhere so the UI can tell "not applicable" from zero.
    amortised: b.amortised,
    termMonths: b.termMonths,
    totalSaving: b.totalSaving,
    monthlyPaymentNow: b.monthlyPaymentNow,
    monthlyPaymentBest: b.monthlyPaymentBest,
    status: b.status,
    hasYourRate: b.hasYourRate,
    beatsBest: b.beatsBest,
    beatsAll: b.beatsAll,
    percentileBeaten: b.percentileBeaten,
    tip: meta.tip,
    ...extra,
  };
}

/**
 * Score a questionnaire's answers into a 0–100 maturity score + band.
 * Only `scoreKeys` (1–3 scales) count toward the score; other fields are context.
 */
export function scoreQuestionnaire(id, answers = {}) {
  const q = getQuestionnaire(id);
  if (!q) return { error: 'Unknown questionnaire' };
  const keys = q.scoreKeys || [];
  const vals = keys.map((k) => Number(answers[k])).filter((n) => Number.isFinite(n) && n > 0);
  const max = keys.length * 3;
  const raw = vals.reduce((a, b) => a + b, 0);
  const score = max ? Math.round((raw / max) * 100) : 0;
  const band = score >= 75 ? 'Advanced' : score >= 45 ? 'Developing' : 'Foundational';
  return {
    questionnaire: q.label,
    answered: vals.length,
    total: keys.length,
    score,
    band,
    recommendExpert: score < 75, // hand off to an advisor unless already advanced
  };
}
