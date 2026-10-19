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

// A four-level question (A–D → 1–4 points) with the full question as a prompt.
const tq = (key, label, prompt, answers) => ({ key, label, prompt, type: 'choice', role: 'score', required: true,
  options: answers.map((a, i) => ({ value: i + 1, letter: 'ABCD'[i], label: a })) });

export const QUESTIONNAIRES = [
  {
    id: 'treasury_efficiency', label: 'Treasury efficiency', segment: 'sme',
    intro: 'Ten questions across cash visibility, liquidity, forecasting, banking architecture, risk and automation.',
    inputs: [
      tq('cash_visibility', 'Multi-bank & multi-entity cash visibility',
        'How quickly and comprehensively can your treasury team access consolidated cash visibility across all group entities, currencies, and bank accounts?', [
          'Takes 1–2 days; relies on manual log-ins and spreadsheet aggregation',
          'Daily visibility achieved within 2–4 hours using manual/batch portal pulls',
          'Daily automated cash position delivered first thing in the morning via TMS/ERP or MT940/camt statements',
          'Real-time, continuous visibility across all accounts and entities via bank APIs and a central dashboard',
        ]),
      tq('forecasting', 'Cash flow forecasting accuracy & automation',
        'How automated is your short- to medium-term cash flow forecasting, and how frequently is variance analysed?', [
          'High-effort spreadsheet models updated monthly; low forecast accuracy with frequent surprises',
          'Bi-weekly/monthly rolling forecasts using static templates; basic manual variance analysis',
          'Weekly automated rolling forecast leveraging ERP AP/AR data with structured variance tracking',
          'Daily AI/predictive driver-based forecasting with automated ERP/bank data feeds and dynamic scenario analysis',
        ]),
      tq('liquidity_structure', 'Liquidity structure & cash concentration',
        'How efficiently is excess liquidity centralised across entities to optimise interest income and minimise idle balances?', [
          'Decentralised; funds stay in local accounts, requiring manual intercompany transfers when needed',
          'Periodic manual sweeps or transfers executed on a weekly/monthly basis',
          'Automated physical zero-balance accounts (ZBA) or header structures at primary banks',
          'Automated multi-currency cross-border pooling / virtual account management (VAM) with automated intercompany loan tracking',
        ]),
      tq('fx_risk', 'FX risk management & execution',
        'How are foreign exchange exposures identified, monitored, and executed across group operations?', [
          'Ad-hoc identification; FX executed manually via phone/online banking with single-bank pricing',
          'Periodic manual exposure aggregation; hedges placed via FX platforms or bank portals with basic policy tracking',
          'Systematic exposure identification from ERP; competitive multi-bank execution via FX platforms (e.g., FXall, Bloomberg)',
          'Automated end-to-end workflow: ERP exposure extraction, algorithmic/straight-through hedging execution, and real-time mark-to-market tracking',
        ]),
      tq('payments', 'Payments processing & payment factory operations',
        'How are vendor, payroll, and intercompany payment instructions initiated, approved, and transmitted to banking partners?', [
          'Manual input directly into multiple individual banking portals with separate tokens and workflows',
          'Batch uploads (e.g., CSV/Excel) to portals; semi-standardised matrix approvals',
          'Centralised host-to-host or ISO 20022/SWIFT integration directly from ERP/TMS with centralised payment controls',
          'Single-pipe Payment Factory / On-Behalf-Of (POBO) structure with automated straight-through processing, sanction screening, and fraud checks',
        ]),
      tq('working_capital', 'Working capital optimisation & trade finance',
        'How actively does Treasury manage working capital instruments (e.g., supply chain finance, dynamic discounting, letters of credit)?', [
          'Reactive; basic bank credit lines used as needed without structured working capital optimisation',
          'Standard short-term debt and trade facilities managed manually with basic bank limit tracking',
          'Active working capital management using structured SCF/factoring programs and digital trade portals',
          'Fully integrated working capital strategy leveraging real-time dynamic discounting, digital trade assets, and automated limit/collateral management',
        ]),
      tq('connectivity', 'Bank connectivity & SWIFT / API adoption',
        'What method does Treasury use to connect to its banking network for statements, payments, and confirmations?', [
          'Proprietary web portals for each individual banking partner',
          'Host-to-Host (SFTP) connections with primary banks, but web portals for secondary banks',
          'SWIFT Alliance/Cloud or standardised ISO 20022 Host-to-Host network across all core banks',
          'Open Banking API architecture paired with SWIFT, providing instantaneous two-way data flows across all banking partners',
        ]),
      tq('bam_fees', 'Bank account management (BAM) & fee auditing',
        'How are bank account administration (openings, signers, mandates) and bank fee structures managed?', [
          'Decentralised paper files; bank fees are rarely reviewed or audited against agreed schedules',
          'Centralised digital inventory of accounts; periodic manual spot-checks of bank fee statements',
          'Digital eBAM inventory with annual mandate reviews and structured electronic fee reconciliation (e.g., ISO 20022 BSB statements)',
          'Fully automated eBAM workflow integrated into TMS/ERP, with continuous, automated bank fee auditing and anomaly detection',
        ]),
      tq('debt_investment', 'Debt & investment portfolio management',
        'How are group debt facilities, investment yields, and counterparty credit risks monitored?', [
          'Tracked manually in spreadsheets; risk limits checked periodically or post-trade',
          'Centralised schedules for debt/investments; manual compliance monitoring against covenant/counterparty limits',
          'Managed through a Treasury Management System (TMS) with automated yield tracking and covenant alerts',
          'Automated, real-time risk dashboard monitoring counterparty exposures, interest rate risk (DV01), laddered maturities, and covenant compliance',
        ]),
      tq('systems', 'Treasury system architecture & operations',
        'What is the primary technological infrastructure underpinning your treasury operations?', [
          'Spreadsheet-based (Excel) with heavy reliance on manual inputs and macro workarounds',
          'Specialised Treasury Workstation or basic module within an ERP with partial automation',
          'Cloud-based Treasury Management System (TMS) fully integrated with core ERP, banking, and market data providers',
          'Best-in-class SaaS TMS integrated with ERPs via APIs, utilising automated workflow controls, audit trails, and advanced analytics',
        ]),
    ],
    scoreKeys: ['cash_visibility', 'forecasting', 'liquidity_structure', 'fx_risk', 'payments',
      'working_capital', 'connectivity', 'bam_fees', 'debt_investment', 'systems'],
    // Points (A=1 … D=4, so 10–40) → tier. Highest `min` first; `tone` colours
    // the score ring.
    tiers: [
      { min: 36, name: 'Value-Centric Treasury', tag: 'Market Leader', tone: 'advanced',
        summary: 'Near real-time visibility, automated execution, optimised capital structure, and full API/TMS integration acting as a strategic driver for the business.' },
      { min: 30, name: 'Strategic Treasury', tone: 'advanced',
        summary: 'Highly efficient and automated; strong cash controls, proactive risk management, and integrated connectivity.' },
      { min: 20, name: 'Operational Treasury', tone: 'developing',
        summary: 'Essential processes established; opportunities remain in centralising liquidity, automating bank connectivity, and reducing spreadsheet dependencies.' },
      { min: 0, name: 'Tactical Treasury', tone: 'foundational',
        summary: 'Highly manual and reactive; vulnerable to operational risk, high banking costs, and low cash visibility.' },
    ],
  },
  {
    id: 'operational_efficiency', label: 'Operational efficiency', segment: 'sme',
    intro: 'Ten questions on automation, processing speed, accuracy, cost-to-serve, strategic focus and compliance.',
    inputs: [
      tq('ap_automation', 'Invoice & accounts payable (AP) automation',
        'What percentage of your vendor invoices are processed, matched (2-way/3-way), and approved automatically without manual intervention?', [
          '< 20% (highly manual, paper/PDF-based)',
          '20% – 49% (basic OCR or partial workflow automation)',
          '50% – 79% (automated routing and matching for standard POs)',
          '80%+ (fully automated end-to-end straight-through processing)',
        ]),
      tq('close_cycle', 'Month-end close cycle time',
        'How many business days does it typically take your finance team to complete the full month-end financial close and produce consolidated reports?', [
          '11+ business days',
          '6–10 business days',
          '3–5 business days',
          '1–2 business days (continuous accounting / near real-time)',
        ]),
      tq('ar_dso', 'Accounts receivable (AR) & days sales outstanding (DSO)',
        'How would you describe your collection process and customer payment tracking efficiency?', [
          'Manual chasing with high DSO relative to industry standard; frequent bad debts',
          'Automated invoicing, but manual follow-up; average DSO',
          'Automated payment reminders, structured credit terms, and DSO below industry average',
          'Fully automated AR workflows, integrated payment portals, and real-time cash application',
        ]),
      tq('fpa_agility', 'Forecasting & financial planning (FP&A) agility',
        'How long does it take your team to run an updated rolling forecast or scenario analysis when market conditions or key drivers change?', [
          'Several weeks (relies heavily on complex, disconnected spreadsheets)',
          '1–2 weeks (semi-automated using static ERP/EPM templates)',
          '2–4 days (integrated FP&A software/EPM solution)',
          'Real-time / on-demand (dynamic driver-based modelling with automated data feeds)',
        ]),
      tq('expenses', 'Expense management & employee processing',
        'How are employee corporate expenses, credit card reconciliations, and travel claims handled?', [
          'Paper receipts and manual spreadsheet submissions',
          'Digital app for submission, but manual auditing and ERP posting',
          'Cloud expense software with auto-receipt scanning and automated policy checks',
          'Integrated smart cards/software with real-time budget controls and instant ERP posting',
        ]),
      tq('cash_visibility', 'Treasury, cash visibility & banking integration',
        'How efficiently can leadership access a consolidated view of cash positions across all bank accounts and entities?', [
          'Takes 1–2 days of manual aggregation from multiple banking portals',
          'Daily manual pull and reconciliation via spreadsheets',
          'Automated daily cash aggregation via API or host-to-host bank connectivity',
          'Real-time cash visibility, automated liquidity management, and integrated short-term cash forecasting',
        ]),
      tq('compliance', 'Tax, regulatory compliance & audit readiness',
        'How prepared is your finance team for annual audits and ongoing tax compliance (e.g., e-invoicing, GST/VAT reporting)?', [
          'High friction; audit prep requires weeks of manual document searching and sample gathering',
          'Moderate effort; digital files exist, but reconciliation requires notable manual work',
          'Smooth process; digital audit trails and standardised compliance workflows in place',
          'Continuous audit readiness; real-time tax integration and fully automated compliance reporting',
        ]),
      tq('integration', 'System integration & single source of truth',
        'To what extent are your core finance platforms (ERP, CRM, Payroll, Inventory, Banking) integrated?', [
          'Siloed systems requiring frequent manual data re-entry and CSV uploads',
          'Partial integrations with periodic batch syncs; occasional data discrepancies',
          'Fully integrated core systems via standard APIs/connectors with single-source master data',
          'Modern unified cloud platform architecture with real-time data flow across all business operations',
        ]),
      tq('error_rate', 'Transaction error rate & reconciliations',
        'How often are errors, duplicate payments, or manual adjustments identified post-transaction processing or during reconciliations?', [
          'Frequently (> 5% error/re-work rate)',
          'Occasionally (2% – 5%), requiring regular manual balance adjustments',
          'Rarely (< 2%), with most reconciliations automated',
          'Exceptional (< 0.5%), with automated anomaly detection and proactive error prevention',
        ]),
      tq('team_focus', 'Finance team focus: operations vs. strategic partnering',
        'How is your finance team’s time allocated between operational processing (data entry, reconciliations) and strategic partnering (data analysis, business support)?', [
          '> 80% operational processing | < 20% strategic business partnering',
          '60%–80% operational | 20%–40% strategic',
          '40%–60% operational | 40%–60% strategic',
          '< 30% operational processing | > 70% strategic business partnering',
        ]),
    ],
    scoreKeys: ['ap_automation', 'close_cycle', 'ar_dso', 'fpa_agility', 'expenses',
      'cash_visibility', 'compliance', 'integration', 'error_rate', 'team_focus'],
    // Points (A=1 … D=4, so 10–40) → tier, highest `min` first.
    tiers: [
      { min: 36, name: 'Best-in-Class Operations', tag: 'Market Leader', tone: 'advanced',
        summary: 'Near-frictionless operations, real-time insights, and high strategic output.' },
      { min: 30, name: 'High-Performing Operations', tone: 'advanced',
        summary: 'Highly automated, scalable finance function with strong data accuracy.' },
      { min: 20, name: 'Standard Operations', tone: 'developing',
        summary: 'Essential digitisation in place; efficiency bottlenecks remain in cross-system workflows.' },
      { min: 0, name: 'Reactive Operations', tone: 'foundational',
        summary: 'High reliance on manual processes; significant scope for cost reduction and automation.' },
    ],
  },
  {
    id: 'personal_wealth', label: 'Personal wealth scorecard', segment: 'individual',
    intro: 'Ten questions on your savings, debt, retirement, protection, investing and planning.',
    inputs: [
      tq('emergency_fund', 'Emergency fund coverage',
        'If your primary source of income were to stop tomorrow, how many months of essential living expenses could you cover using cash or liquid savings?', [
          'Less than 1 month (or living paycheck-to-paycheck)',
          '1 to 2 months',
          '3 to 5 months',
          '6 months or more held in accessible, low-risk accounts',
        ]),
      tq('debt_to_income', 'Debt-to-income (DTI) & high-interest debt',
        'How much of your monthly gross income goes toward total debt payments (mortgage, car loans, personal loans, credit cards), and do you carry high-interest credit card debt?', [
          'Total debt payments exceed 45% of income, OR regularly carry a balance on high-interest credit cards (> 15% APR)',
          'Debt payments are 36%–45% of income; occasionally carry a credit card balance',
          'Debt payments are 20%–35% of income; credit card balances are always paid in full each month',
          'Total debt payments are under 20% of income (or zero debt, excluding primary mortgage); credit cards always paid in full',
        ]),
      tq('savings_rate', 'Savings & investment rate',
        'What percentage of your gross annual income do you consistently direct toward long-term savings and investments (including 401k/EPF/CPF, IRA, brokerage accounts, and cash savings)?', [
          'Less than 5%',
          '5% to 9%',
          '10% to 19%',
          '20% or more',
        ]),
      tq('retirement', 'Retirement preparedness',
        'Relative to your age and target retirement lifestyle, how on-track are your dedicated retirement savings/investments? (Rule of thumb: ~1x annual salary by age 30, 3x by 40, 6x by 50, 8x by 60)', [
          'Unsure or significantly behind (less than 50% of age benchmark)',
          'Moderately behind (50%–80% of age benchmark)',
          'On track (80%–110% of age benchmark)',
          'Ahead of track (> 110% of age benchmark) or financially independent / early retirement ready',
        ]),
      tq('protection', 'Insurance & risk protection',
        'How well-protected are you and your dependents against major health, disability, or life catastrophes?', [
          'Minimal or no health insurance; no life or disability coverage despite having dependents/liabilities',
          'Basic health coverage only; insufficient life insurance or disability cover',
          'Comprehensive health insurance plus basic life/disability coverage matching key liabilities',
          'Fully covered: robust health insurance, 10x+ income life coverage (if applicable), disability income protection, and an up-to-date estate plan (will/trust)',
        ]),
      tq('net_worth', 'Net worth trajectory',
        'Over the past 3 to 5 years, how has your total net worth (assets minus liabilities) evolved?', [
          'Decreasing (liabilities growing faster than assets) or stagnant with net negative value',
          'Stagnant or fluctuating around the same baseline level',
          'Steadily increasing year-over-year in line with inflation and basic savings',
          'Growing significantly due to compounding investments, asset appreciation, and active debt reduction',
        ]),
      tq('diversification', 'Portfolio diversification & asset allocation',
        'How are your total wealth and liquid investments distributed across asset classes (equities, fixed income, real estate, cash, alternative assets)?', [
          'Single-asset concentration (> 70% in one stock, cash, crypto, or primary real estate) or entirely in uninvested cash',
          'Limited diversification; heavily skewed toward one asset class with no deliberate rebalancing',
          'Diversified across multiple asset classes matched to my age and risk tolerance',
          'Well-balanced global diversification across equities, fixed income, real estate, and liquidity, with periodic rebalancing and tax-efficient structuring',
        ]),
      tq('budgeting', 'Budgeting & cash flow control',
        'How closely do you track your monthly cash inflows and outflows?', [
          'Do not track expenses; frequently surprised by end-of-month balances or overdrafts',
          'General mental budget; aware of major fixed expenses but unmonitored discretionary spending',
          'Structured budget (e.g., 50/30/20 rule); track income and expenses monthly with intentional spending targets',
          'Automated cash flow management; income automatically routed into targeted savings/investments first ("pay yourself first") with real-time tracking',
        ]),
      tq('credit_score', 'Credit score & financial standing',
        'What is your credit score or credit bureau rating standing? (e.g., US FICO scale: 300–850)', [
          'Poor / high risk (< 580) or multiple missed/late payments in the past 12 months',
          'Fair (580–669)',
          'Good (670–739)',
          'Excellent / prime (740+) with an impeccable payment history',
        ]),
      tq('planning', 'Financial literacy & strategic planning',
        'Do you have a documented long-term financial plan (estate planning, tax planning, major life milestones, retirement timeline)?', [
          'No plan; handle finances purely on a short-term, month-to-month basis',
          'Informal goals in mind (e.g., buy a home, retire at 65), but no written strategy or timeline',
          'Basic written plan with defined financial milestones reviewed annually',
          'Comprehensive, active financial strategy addressing tax efficiency, estate transition, asset location, and regular portfolio reviews',
        ]),
    ],
    scoreKeys: ['emergency_fund', 'debt_to_income', 'savings_rate', 'retirement', 'protection',
      'net_worth', 'diversification', 'budgeting', 'credit_score', 'planning'],
    // Points (A=1 … D=4, so 10–40) → tier, highest `min` first. `descriptor`,
    // `summary` and `priorities` fill the scorecard's results screen; `tone`
    // colours it (amber / blue / green).
    tiers: [
      { min: 36, name: 'Financially Independent / Ultra-Resilient', tone: 'green',
        descriptor: 'A strong position, built across multiple areas of financial life.',
        summary: 'Your responses point to excellent financial health, robust risk mitigation, and long-term security. Your focus may shift toward preserving and intentionally directing that progress.',
        priorities: ['Revisit legacy and estate planning', 'Protect and preserve wealth', 'Explore capital efficiency'] },
      { min: 30, name: 'Financially Healthy', tone: 'green',
        descriptor: 'Solid foundations give you options for what comes next.',
        summary: 'Your answers suggest disciplined cash flow and a solid financial base. You may now have room to optimise how your plan works together over the long term.',
        priorities: ['Review tax-efficient structures', 'Fine-tune asset allocation', 'Consider accelerating debt paydown'] },
      { min: 20, name: 'Financially Stable', tone: 'blue',
        descriptor: 'Your foundations are forming. There is room to strengthen the next layer.',
        summary: 'Core financial needs may be in place, while opportunities remain in long-term growth or protection. A few consistent systems can help close those gaps over time.',
        priorities: ['Gradually raise your savings rate', 'Review insurance and protection gaps', 'Build systematic investments'] },
      { min: 0, name: 'Financially Vulnerable', tone: 'amber',
        descriptor: 'A few sturdy basics can make a meaningful difference.',
        summary: 'Unexpected shocks may put pressure on your finances right now. That is a starting point—not a verdict. Small, deliberate steps can build more breathing room.',
        priorities: ['Start a starter emergency fund', 'Prioritise high-interest debt', 'Set up simple budget controls'] },
    ],
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
  const byKey = Object.fromEntries((q.inputs || []).map((f) => [f.key, f]));
  // Each question's ceiling is its own top option (3 for a scale, 4 for A–D),
  // and an answer outside the options it offers counts for nothing.
  const top = (k) => Math.max(...(byKey[k]?.options || [{ value: 3 }]).map((o) => Number(o.value)));
  const vals = keys.map((k) => {
    const n = Number(answers[k]);
    return Number.isInteger(n) && n > 0 && n <= top(k) ? n : null;
  }).filter((n) => n !== null);
  const max = keys.reduce((a, k) => a + top(k), 0);
  const raw = vals.reduce((a, b) => a + b, 0);
  const score = max ? Math.round((raw / max) * 100) : 0;
  const base = { questionnaire: q.label, answered: vals.length, total: keys.length, score };

  // Questionnaires with their own point tiers (treasury) are banded on points.
  if (q.tiers?.length) {
    const tier = q.tiers.find((t) => raw >= t.min) || q.tiers[q.tiers.length - 1];
    return {
      ...base,
      points: raw, maxPoints: max,
      band: tier.name, tag: tier.tag || null, summary: tier.summary, tone: tier.tone,
      descriptor: tier.descriptor || null, priorities: tier.priorities || [],
      recommendExpert: tier !== q.tiers[0], // everyone short of the top tier
    };
  }

  const band = score >= 75 ? 'Advanced' : score >= 45 ? 'Developing' : 'Foundational';
  return {
    ...base,
    band,
    tone: band.toLowerCase(),
    recommendExpert: score < 75, // hand off to an advisor unless already advanced
  };
}
