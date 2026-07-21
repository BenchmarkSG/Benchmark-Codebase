// ---------------------------------------------------------------------------
// Illustrative benchmark repository for the prototype.
// All rates/margins/fees are indicative demo figures — NOT live market data.
// The real product would crowdsource anonymised transactional data + curated
// panel rates. See scope.md for the "actual vs card rate" data problem.
// ---------------------------------------------------------------------------

export const BANKS = [
  'DBS', 'POSB', 'OCBC', 'UOB', 'Standard Chartered', 'Citibank',
  'HSBC', 'Maybank', 'Bank of China', 'CIMB', 'RHB', 'Trust Bank',
  'GXS Bank', 'MariBank', 'State Bank of India',
];

export const SEGMENTS = {
  individual: 'For Individuals',
  sme: 'For SMEs',
  corporate: 'For Corporates',
};

// Remittance / FX-conversion corridors. margin = % spread over mid-market.
// `marketAvg` ≈ what a typical bank charges; `benchmark` ≈ best fintech/bank.
export const CORRIDORS = {
  'SGD-INR': { label: 'SGD → India (INR)', marketAvg: 1.6, benchmark: 0.35 },
  'SGD-PHP': { label: 'SGD → Philippines (PHP)', marketAvg: 2.2, benchmark: 0.5 },
  'SGD-BDT': { label: 'SGD → Bangladesh (BDT)', marketAvg: 2.8, benchmark: 0.7 },
  'SGD-PKR': { label: 'SGD → Pakistan (PKR)', marketAvg: 2.6, benchmark: 0.6 },
  'SGD-CNY': { label: 'SGD → China (CNY)', marketAvg: 1.4, benchmark: 0.4 },
  'SGD-IDR': { label: 'SGD → Indonesia (IDR)', marketAvg: 2.0, benchmark: 0.45 },
  'SGD-USD': { label: 'SGD ↔ USD', marketAvg: 0.8, benchmark: 0.15 },
  'SGD-EUR': { label: 'SGD ↔ EUR', marketAvg: 1.0, benchmark: 0.2 },
  'SGD-GBP': { label: 'SGD ↔ GBP', marketAvg: 1.1, benchmark: 0.25 },
  'SGD-AUD': { label: 'SGD ↔ AUD', marketAvg: 1.2, benchmark: 0.3 },
  'USD-INR': { label: 'USD → India (INR)', marketAvg: 1.5, benchmark: 0.4 },
  'USD-CNY': { label: 'USD → China (CNY)', marketAvg: 1.3, benchmark: 0.35 },
};

// Flat cross-border transfer fee legs (SGD). A single outward transfer is often
// charged at all three points; benchmark players collapse most of these to ~0.
export const TRANSFER_LEGS = {
  initiation: { label: 'Outward / initiation fee', marketAvg: 30, benchmark: 5 },
  intermediary: { label: 'Intermediary / agent (correspondent) fee', marketAvg: 25, benchmark: 0 },
  beneficiary: { label: 'Beneficiary / receiving deduction', marketAvg: 15, benchmark: 0 },
};

// Rate-based products for the manual calculator.
// rateType: 'apr'  -> lower is better (loans, fees, FX margin)
//           'yield'-> higher is better (deposits, savings)
// volumeBased: true -> `amount` is a MONTHLY figure, annualised x12.
export const PRODUCTS = {
  mortgage: {
    label: '20-Year Mortgage',
    segment: ['individual'],
    rateType: 'apr',
    unit: '% p.a.',
    defaultTenor: 20,
    variants: {
      floating: { label: 'Floating', marketAvg: 3.55, benchmark: 2.45 },
      fixed: { label: 'Fixed', marketAvg: 3.75, benchmark: 2.60 },
    },
    byBank: { DBS: 3.80, POSB: 3.75, OCBC: 3.70, UOB: 3.65, 'Standard Chartered': 3.55, HSBC: 3.50 },
    tip: 'Banks publish teaser/board rates; the actual offer depends on your profile. Benchmark to what others like you actually got, then reprice.',
  },
  personal_loan: {
    label: '5-Year Personal Loan',
    segment: ['individual'],
    rateType: 'apr',
    unit: '% EIR',
    defaultTenor: 5,
    marketAvg: 8.5,
    benchmark: 5.8,
    byBank: { DBS: 8.9, OCBC: 8.4, UOB: 8.6, 'Standard Chartered': 7.9, HSBC: 7.8, Citibank: 8.2 },
    tip: 'Advertised rates are “card” rates; realised EIR varies by credit history. We benchmark to the most competitive realised offers.',
  },
  overdraft: {
    label: 'Overdraft Facility',
    segment: ['sme', 'corporate'],
    rateType: 'apr',
    unit: '% p.a.',
    defaultTenor: 1,
    marketAvg: 8.0,
    benchmark: 5.5,
    byBank: { DBS: 8.25, OCBC: 7.90, UOB: 8.10, 'Standard Chartered': 7.20, HSBC: 7.00 },
    tip: 'Overdraft pricing is highly negotiable for SMEs with steady turnover — most never ask.',
  },
  short_term_loan: {
    label: '3-Month Working-Capital Loan',
    segment: ['sme', 'corporate'],
    rateType: 'apr',
    unit: '% p.a.',
    defaultTenor: 1,
    marketAvg: 6.5,
    benchmark: 4.2,
    byBank: { DBS: 6.7, OCBC: 6.4, UOB: 6.55, 'Standard Chartered': 5.6, HSBC: 5.4 },
    tip: 'Short-tenor facilities reprice fast — a small rate cut compounds across rollovers.',
  },
  fx_margin: {
    label: 'FX Conversion / Remittance Margin',
    segment: ['individual', 'sme', 'corporate'],
    rateType: 'apr',
    unit: '% margin',
    defaultTenor: 1,
    volumeBased: true, // amount = monthly FX volume
    corridorBased: true,
    tip: 'FX spread is the most invisible cost — it is baked into the rate, not shown as a fee. Benchmark by corridor.',
  },
  fixed_deposit: {
    label: 'Fixed Deposit',
    segment: ['individual', 'sme', 'corporate'],
    rateType: 'yield',
    unit: '% p.a.',
    defaultTenor: 1,
    marketAvg: 2.6,
    benchmark: 3.55,
    byBank: { DBS: 2.45, OCBC: 2.55, UOB: 2.60, 'Standard Chartered': 3.10, 'Bank of China': 3.40, CIMB: 3.35 },
    tip: 'Smaller and foreign banks frequently lead on FD promotional yields.',
  },
  savings: {
    label: 'Savings / Current Account Interest',
    segment: ['individual', 'sme'],
    rateType: 'yield',
    unit: '% p.a.',
    defaultTenor: 1,
    marketAvg: 0.85,
    benchmark: 2.50,
    byBank: { DBS: 0.90, POSB: 0.85, OCBC: 0.80, UOB: 0.95, 'Trust Bank': 2.00, 'GXS Bank': 2.28, MariBank: 2.50 },
    tip: 'Digital banks and bonus-interest accounts materially out-earn legacy savings rates.',
  },
};
