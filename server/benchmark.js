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

// The two mirrored legs of a cross-border transfer. `direction` picks the leg.
const crossBorderInputs = () => [
  { key: 'direction', label: 'Direction', type: 'enum', role: 'context', required: true, options: REMIT_DIRECTION },
  bank('Remitting / receiving bank'),
  { key: 'send_currency', label: 'Sent currency', type: 'currency', role: 'context', required: true },
  { key: 'sent_amount', label: 'Amount sent / debited (Dr)', type: 'amount', role: 'context', required: true, placeholder: 'e.g. 5000' },
  { key: 'receive_currency', label: 'Received currency', type: 'currency', role: 'context', required: true },
  { key: 'received_amount', label: 'Amount received / credited (Cr)', type: 'amount', role: 'context', required: true, placeholder: 'e.g. 305000' },
  { key: 'time_taken_hours', label: 'Time taken (hours)', type: 'duration', role: 'context', required: false, placeholder: 'e.g. 24' },
  amount('Annual transfer volume'), // savings basis (in send currency)
];

/* ---- Product catalog ------------------------------------------------------
   family:      'rate' (benchmark one stored rate) | 'crossborder' (derived cost)
   rateType:    'apr' (cost → lower is better) | 'yield' (return → higher better)
   currencyMode:'local' | 'usd' | 'localusd' | 'multi'
   metricKey:   which input carries the benchmarked number
   amountKey:   which input sizes the saving
   variantKey:  present when the product splits into stored sub-pools
   annualiser:  multiplies a per-period rate to an annual figure               */
export const PRODUCTS = [
  // ------- Individual -------
  {
    id: 'housing_loan', label: 'Housing loan', blurb: 'Home loan rates & conditions', category: 'loan',
    segments: ['individual'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
    inputs: [bank('Your Bank/Finance Company'), amount('Outstanding amount'), tenor(), rate('Your interest rate (% p.a.)'), rateBasis()],
    tip: 'Home-loan rates are highly repriceable — lenders quote board rates but settle far lower to retain good borrowers.',
  },
  {
    id: 'personal_loan', label: 'Personal loan', blurb: 'Interest rates & processing fees', category: 'loan',
    segments: ['individual'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
    inputs: [bank('Your Bank/Finance Company'), amount('Outstanding amount'), tenor(), rate('Your interest rate (% p.a.)'), rateBasis()],
    tip: 'Advertised “from” rates rarely match realised EIR — benchmark what borrowers with your profile actually pay.',
  },
  {
    id: 'vehicle_loan', label: 'Vehicle loan', blurb: 'Car & vehicle financing rates', category: 'loan',
    segments: ['individual'], family: 'rate', rateType: 'apr', unit: '% p.a.',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
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
    currencyMode: 'multi', annualiser: 1, metricKey: 'cost_pct', amountKey: 'amount',
    inputs: crossBorderInputs(),
    tip: 'The real cost is the FX margin baked into the rate — not the visible fee. We compute it against the mid-market rate.',
  },
  // ------- SME / Corporate -------
  {
    id: 'current_account', label: 'Current account', blurb: 'Credit interest & maintenance fees', category: 'account',
    segments: ['sme'], family: 'rate', rateType: 'yield', unit: '% p.a.',
    currencyMode: 'local', annualiser: 1, metricKey: 'rate', amountKey: 'amount',
    inputs: [bank('Your bank'), amount('Average daily balance'), rate('Credit interest / rebate (% p.a.)'), currency(false)],
    tip: 'Idle balances can earn interest or fee rebates that most SMEs never negotiate for.',
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

// Pick the best-priced bank from [{ bank, value }] items: lowest for a cost
// (apr), highest for a return (yield).
function pickBestBank(items, rateType) {
  const finite = (items || []).filter((i) => i && i.bank && Number.isFinite(Number(i.value)));
  if (!finite.length) return null;
  const best = finite.reduce((a, b) =>
    rateType === 'yield' ? (Number(b.value) > Number(a.value) ? b : a) : (Number(b.value) < Number(a.value) ? b : a));
  return best.bank;
}

/**
 * Benchmark a list of comparable values. rateType 'apr' (lower better) |
 * 'yield' (higher better). Returns null if there are no values.
 */
export function benchmarkValues(values, { yourRate, amount = 0, annualiser = 1, rateType = 'apr' } = {}) {
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
  const annualSaving = Math.max(0, (delta / 100) * notional * annualiser);

  // Where the user stands in the pool (only meaningful once they entered a rate).
  const betterThan = asc.filter((v) => (isYield ? v < your : v > your)).length;
  const percentileBeaten = Math.round((betterThan / asc.length) * 100);
  const beatsBest = isYield ? your >= best : your <= best; // at least as good as the pool's best
  const beatsAll = betterThan === asc.length;              // strictly better than every provider
  const status = !hasYourRate ? 'estimate' : beatsBest ? 'ahead' : 'saving';

  return {
    best: round2(best), median: round2(median), marketTypical: round2(marketTypical),
    yourRate: round2(your), poolSize: asc.length,
    annualSaving: Math.round(annualSaving), monthlySaving: Math.round(annualSaving / 12),
    direction: isYield ? 'higher' : 'lower',
    hasYourRate, beatsBest, beatsAll, percentileBeaten, status,
  };
}

/**
 * Assemble the masked benchmark response for a product from its market values.
 * `extra` carries product-family specifics (e.g. cross-border settlement time).
 */
export function buildBenchmarkResult({ product, country, currency, values, items, yourRate, amount, extra = {} }) {
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
    bestBank: pickBestBank(items, meta.rateType),
    annualSaving: b.annualSaving,
    monthlySaving: b.monthlySaving,
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
