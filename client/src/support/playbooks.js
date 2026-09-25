/* CALL SCRIPTS for the support desk.
 *
 * This is not a briefing. The agent is on the phone with a stranger right now.
 * Every line here is one of four things:
 *
 *   say   — speak it, word for word
 *   ask   — a question, with what to do with each answer
 *   do    — an action (type it, look it up, agree a date)
 *   warn  — say this before they act, or they will get hurt
 *
 * RULES THIS FILE FOLLOWS
 *   1. Short lines. If it does not fit on one line at a glance, it is too long.
 *   2. No background, no theory, no "what this product is really about".
 *      The agent cannot read a paragraph while someone is waiting.
 *   3. {placeholders} are filled with the customer's real numbers before render,
 *      so the agent reads "8%" and "THB 470", never "<their rate>".
 *   4. Still no invented figures: every number substituted comes from that
 *      customer's own benchmark.
 */

/* ---- placeholder fill ----------------------------------------------------
   Anything we do not have becomes a short neutral phrase rather than an empty
   gap or a raw {token} the agent would read out by accident. */
const FALLBACK = {
  name: 'there',
  bank: 'your bank',
  rate: 'your current rate',
  best: 'the best rate available',
  gap: 'the gap',
  product: 'your facility',
};

export function fill(text, c = {}) {
  if (!text) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    const v = c[k];
    return v === null || v === undefined || v === '' ? (FALLBACK[k] ?? m) : String(v);
  });
}

/* ---- Ground rules. Read once. Four lines, not six paragraphs. ------------- */
export const GUARDRAILS = [
  'Never promise a rate or an outcome. Say "this is what the market shows", not "you will get".',
  'Never ask for a password, OTP or card number. We never need one.',
  'We coach — we do not call the bank for them. Only the account holder can reprice.',
  'If they are behind on payments, stop. Refer them to the bank’s hardship team, not a refinance.',
  'If their rate already beats the market, say so and tell them the fee is refundable.',
];

/* ---- Per-country: the one question that changes the answer ---------------- */
const COUNTRY = {
  IN: {
    words: 'Sanction letter · EBLR / repo-linked · MCLR · spread · balance transfer · CIBIL',
    regulator: 'RBI',
    keyAsk: 'Does your sanction letter say repo-linked, EBLR, MCLR, or base rate?',
    keyWhy: 'This decides the whole call.',
    branches: [
      { if: 'MCLR or base rate', then: 'Biggest win available. Tell them: ask to switch to repo-linked and ask the conversion fee.' },
      { if: 'Repo-linked / EBLR', then: 'Rate is fixed by RBI. Only the spread moves. Go after the spread.' },
      { if: 'They don’t know', then: 'Have them read the sanction letter or latest statement while you wait.' },
    ],
    extraAsk: 'Has your CIBIL score gone up since you took the loan?',
    extraThen: 'If yes, that is the argument: "you priced me for an old score."',
    warn: ['Floating-rate home loans to individuals: RBI restricts foreclosure charges. Have them confirm it applies before they rely on it.'],
  },
  SG: {
    words: 'Letter of Offer · SORA · board rate · lock-in · clawback · repricing vs refinancing',
    regulator: 'MAS',
    keyAsk: 'Are you on a fixed package, SORA floating, or the bank’s board rate?',
    keyWhy: 'Board rate is where the worst pricing hides.',
    branches: [
      { if: 'Board rate', then: 'Worst case. Nothing public constrains it. Push hard to reprice.' },
      { if: 'Fixed', then: 'Ask when it ends. The window is the 3 months before.' },
      { if: 'SORA floating', then: 'SORA is fixed by the market. Go after the spread only.' },
    ],
    extraAsk: 'When does your lock-in end? It is on the Letter of Offer.',
    extraThen: 'Inside lock-in, leaving costs a penalty. Reprice instead.',
    warn: ['If the bank paid their legal fees, leaving early claws that back. Check the Letter of Offer first.'],
  },
  MY: {
    words: 'Facility agreement · OPR · SBR · spread · lock-in · early settlement',
    regulator: 'BNM',
    keyAsk: 'Does your agreement say SBR, or the older BR / BLR?',
    keyWhy: 'SBR is the same at every bank — so any gap is pure spread.',
    branches: [
      { if: 'SBR', then: 'Say: "Every bank has the same SBR. Your competitor’s spread is lower. Match it."' },
      { if: 'BR or BLR', then: 'Older framework. Ask what switching to SBR would cost and what spread they’d get.' },
    ],
    extraAsk: 'Is this conventional or Islamic financing?',
    extraThen: 'Islamic = profit rate, with a ceiling. Same negotiation, different words.',
    warn: ['Housing lock-ins run several years. Early settlement inside it carries a penalty — check the agreement.'],
  },
  TH: {
    words: 'MLR · MRR · MOR · promotional period · retention rate · refinance',
    regulator: 'BOT',
    keyAsk: 'Has your promotional rate ended yet?',
    keyWhy: 'Almost every Thai mortgage call is triggered by the revert.',
    branches: [
      { if: 'Already ended', then: 'That is why it jumped. Banks expect a retention request — most people never ask.' },
      { if: 'Ends soon', then: 'Call them about 30 days before. That is the window.' },
      { if: 'Still fixed', then: 'Nothing to do yet. Write the end date in their calendar.' },
    ],
    extraAsk: 'Have you ever asked them to lower it?',
    extraThen: 'If no — that is the whole problem. Tell them to put the request in writing to the branch or retention team, not just phone.',
    warn: ['Refinancing means a new mortgage registration and appraisal. Get both costs before they move.'],
  },
  ID: {
    words: 'BI-Rate · SBDK · risk premium · KPR · take-over',
    regulator: 'OJK',
    keyAsk: 'Has your KPR promo period finished and gone floating?',
    keyWhy: 'That is when the rate jumps and people call.',
    branches: [
      { if: 'Yes, floating now', then: 'Tell them to ask the bank to split it: published SBDK vs their personal risk premium.' },
      { if: 'Still in promo', then: 'Note the end date. Prepare the ask for 30 days before.' },
    ],
    extraAsk: 'Have you missed any payments since you took it?',
    extraThen: 'Clean record is the whole argument for cutting the risk premium.',
    warn: ['Take-over to another bank carries early settlement, notary and appraisal costs. Price them first.'],
  },
};

/* ---- Per-product: the script spine --------------------------------------- */
const PRODUCT = {
  housing_loan: {
    label: 'home loan',
    check: [
      'What rate is on your latest statement?',
      'How much is still outstanding, and how many years left?',
      'Fixed or floating right now?',
    ],
    pitch: [
      'You’re paying {rate}. Best available right now is {best}.',
      'That’s {gap} a year you’re handing over for nothing.',
      'Banks only reprice when they’re asked. Nothing is wrong with your account.',
    ],
    ask: 'I have a better offer at {best}. I’d rather stay with you. What is the best rate you can reprice me to?',
    who: 'Ask for the retention team. Not the branch counter, not the front-line call centre.',
    objections: [
      { they: 'That rate is for new customers only.', say: 'Then I’ll become a new customer somewhere else. What can you actually do?' },
      { they: 'Your rate is already competitive.', say: 'Competitive with what? I have a lower written offer. Match it or tell me you can’t.' },
      { they: 'You’re inside your lock-in.', say: 'Then reprice me now, or tell me the exact date it ends and I’ll call back that week.' },
    ],
    close: [
      'Agree a day they will call. Write it down.',
      'Tell them: if the bank says no, get a written quote from another bank first.',
      'Offer Option 3 only if they say they don’t want to do it themselves.',
    ],
    warn: [
      'A lower rate over a longer tenor can cost more. Compare total interest, not the monthly payment.',
      'If they’re selling within ~2 years, refinancing rarely pays for itself.',
    ],
  },

  personal_loan: {
    label: 'personal loan',
    check: [
      'What rate are you paying, and is that flat or effective?',
      'How much is left and how many months?',
      'Any other personal loans or card balances?',
    ],
    pitch: [
      'You’re at {rate}. Best available is {best}.',
      'That’s {gap} a year.',
      'Unsecured pricing moves most with your credit score.',
    ],
    ask: 'What is my all-in effective rate including every fee — and what would you offer me today as a new applicant?',
    who: 'Ask for the loans team, then ask for a supervisor if the answer is scripted.',
    objections: [
      { they: 'The rate is fixed for the term.', say: 'Then quote me a new loan that settles this one. What rate?' },
      { they: 'We can’t change an existing loan.', say: 'Can you refinance it internally? If not I’ll take a consolidation quote elsewhere.' },
    ],
    close: [
      'If they hold several small debts, tell them to ask for one consolidation quote.',
      'Agree a callback date.',
    ],
    warn: [
      'Check early-settlement terms first — some charge full-term interest anyway.',
      'Never suggest borrowing more than they owe now.',
    ],
  },

  vehicle_loan: {
    label: 'car loan',
    check: [
      'Was the finance arranged at the dealership or with a bank?',
      'Is the rate quoted flat or effective?',
      'How much is left, and how many months?',
    ],
    pitch: [
      'You’re at {rate}. Best available is {best}.',
      'Dealer finance pays a commission. Going direct to a bank is usually cheaper.',
    ],
    ask: 'What is my effective rate, and what is the settlement figure today?',
    who: 'Ask the finance company directly, not the dealership.',
    objections: [
      { they: 'Your rate is only 3, that’s very low.', say: 'Is that flat or effective? Give me the effective rate.' },
    ],
    close: ['Get the settlement figure in writing before they commit to anything.'],
    warn: [
      'If they owe more than the car is worth, refinancing options are thin. Ask first.',
      'Short tenor left = little interest to save. Be honest if it isn’t worth it.',
    ],
  },

  fixed_deposit: {
    label: 'fixed deposit',
    check: [
      'What rate are you getting and when does it mature?',
      'Is it set to auto-renew?',
      'Do you bank elsewhere too?',
    ],
    pitch: [
      'You’re getting {rate}. Best available is {best}.',
      'That’s {gap} a year you’re not being paid.',
      'Auto-renewal almost always drops you to the board rate.',
    ],
    ask: 'What is your best promotional tenor and rate right now — and does my existing balance qualify, or does it need to be fresh funds?',
    who: 'The deposits desk, or the branch manager if you hold a loan there too.',
    objections: [
      { they: 'That promotion has ended.', say: 'What’s running now, and when does the next one start? I’ll place it then.' },
      { they: 'That rate needs a bigger amount.', say: 'What is the threshold?' },
    ],
    close: [
      'Tell them: turn OFF auto-renewal and diarise the maturity date.',
      'Agree they will call two weeks before maturity.',
    ],
    warn: ['Breaking a deposit early usually forfeits the interest. Check the maturity date before suggesting a move.'],
  },

  cross_border: {
    label: 'transfer',
    check: [
      'How much do you send in a year, and to which country?',
      'Do you know the exchange rate you were actually given?',
      'What fee did they charge?',
    ],
    pitch: [
      'Your all-in cost is {rate}. Best available is {best}.',
      'That’s {gap} on this one transfer.',
      'The fee is the small part. The real cost is hidden in the exchange rate.',
    ],
    ask: 'What is my all-in cost as a percentage — your fee plus your margin over the mid-market rate? And what improves if I commit my annual volume?',
    who: 'Ask if treasury can quote a live rate. Above a threshold most banks will.',
    objections: [
      { they: 'We charge zero fees.', say: 'Then what is your margin over the mid-market rate? That’s where the cost is.' },
      { they: 'That is the board rate.', say: 'Can treasury quote me? I send {gap} worth a year.' },
    ],
    close: [
      'For small transfers, tell them a specialist provider usually beats the bank. Say it plainly.',
      'For businesses, ask if settlement speed matters more than price before pushing the cheapest.',
    ],
    warn: ['Check who pays the intermediary charges — a cheap transfer that arrives short is not cheap.'],
  },

  current_account: {
    label: 'current account',
    check: [
      'What balance do you typically keep?',
      'Are you getting any interest or fee rebate today?',
      'Do you also have a loan or FX with this bank?',
    ],
    pitch: [
      'You’re getting {rate}. Best available is {best}.',
      'Idle balance is a free loan to the bank.',
    ],
    ask: 'What credit interest or fee rebate can you offer at my balance — and what changes if I bring my FX and payroll across?',
    who: 'Your relationship manager, or the business banking desk.',
    objections: [
      { they: 'Current accounts don’t pay interest.', say: 'Then what fee rebate applies at my balance? And what sweep options do you have?' },
    ],
    close: ['If they won’t pay interest, ask about an automatic sweep into a yielding account.'],
    warn: ['Check the balance they quoted is a real average, not a one-off peak.'],
  },

  current_account_fees: {
    label: 'current account charges',
    check: [
      'What is your required minimum balance?',
      'What did you pay in charges last year?',
      'How much money flows through the account monthly?',
    ],
    pitch: [
      'You’re paying {rate}. Best available is {best}.',
      'That’s {gap} a year in charges.',
      'Interest is off the table by law here. Charges are not.',
    ],
    ask: 'Which account variant suits my turnover, what is its minimum balance, and will you waive the non-maintenance and cash-handling charges given my monthly credits?',
    who: 'The branch manager. This is decided locally more often than people think.',
    objections: [
      { they: 'These charges are standard.', say: 'Standard for which variant? Move me to the one that fits my turnover.' },
      { they: 'We cannot waive charges.', say: 'Then lower my minimum balance instead.' },
    ],
    close: ['Tell them to take last year’s charge summary to the branch. It is the whole argument.'],
    warn: ['Never say interest is negotiable here — it is prohibited, and it destroys your credibility instantly.'],
  },

  overdraft: {
    label: 'overdraft',
    check: [
      'What rate are you paying on the drawn balance?',
      'What is your limit, and how much do you actually use?',
      'Any excesses or missed payments in the last year?',
    ],
    pitch: [
      'You’re at {rate}. Best available is {best}.',
      'That’s {gap} a year.',
      'Clean conduct is the argument. Most businesses never ask.',
    ],
    ask: 'My account has run clean for twelve months. What margin can you offer at renewal — and what would improve it, more security or a right-sized limit?',
    who: 'Your relationship manager, before the renewal date.',
    objections: [
      { they: 'That is our standard SME rate.', say: 'I am not a standard risk. Here is my conduct. Price me on it.' },
      { they: 'We would need to re-underwrite.', say: 'Then re-underwrite. My numbers are better than when you set this.' },
    ],
    close: [
      'Tell them to diarise the renewal date — that is the repricing moment.',
      'If the limit is bigger than they use, tell them to cut it. Unused limit costs money.',
    ],
    warn: ['Do not push them into offering a personal guarantee or property as security. That is a serious commitment, not a trick.'],
  },

  short_term_finance: {
    label: 'trade finance',
    check: [
      'What margin are you paying, and what fees on top?',
      'Who are your main buyers?',
      'When does the facility come up for renewal?',
    ],
    pitch: [
      'You’re at {rate}. Best available is {best}.',
      'That’s {gap} a year.',
    ],
    ask: 'Break out the funded margin from the transaction fees, and tell me what improves if I commit my annual trade volume.',
    who: 'Trade finance desk, plus your relationship manager.',
    objections: [
      { they: 'Pricing reflects your risk profile.', say: 'My buyers are the risk. Price the exposure to them, not to me.' },
    ],
    close: ['Tell them to get one competing term sheet before renewal. That alone moves the price.'],
    warn: ['Structures vary a lot — make sure any comparison is like-for-like before calling it a saving.'],
  },

  unfunded_facility: {
    label: 'guarantee / LC',
    check: [
      'What commission are you charged, and is there a minimum per instrument?',
      'Are you providing cash cover?',
      'How many do you issue a year?',
    ],
    pitch: [
      'You’re at {rate}. Best available is {best}.',
      'That’s {gap} a year.',
      'Nothing is drawn, so people assume the cost is fixed. It is not.',
    ],
    ask: 'What is the per-annum commission and the minimum charge — and what does it drop to against cash cover?',
    who: 'Trade finance desk.',
    objections: [
      { they: 'That is the tariff rate.', say: 'Tariffs are a starting point. What is the relationship rate?' },
    ],
    close: ['If they issue several, tell them to ask for one umbrella limit instead of separate lines.'],
    warn: ['Check whether their figure is per annum or per issuance — mixing the two makes the gap meaningless.'],
  },
};

/* ---- Compose the script -------------------------------------------------- */
/**
 * Build the call script for one country + product, with the customer's own
 * numbers already substituted.
 *
 * `customer` = { name, bank, rate, best, gap } — all optional; anything missing
 * falls back to a neutral phrase so the agent never reads a raw token aloud.
 */
export function scriptFor(countryCode, productId, customer = {}) {
  const co = COUNTRY[String(countryCode || '').toUpperCase()];
  const pr = PRODUCT[productId];
  if (!co || !pr) return null;
  const c = { ...customer, product: pr.label };
  const f = (t) => fill(t, c);

  const steps = [
    {
      id: 'open',
      title: 'Open',
      time: '30 sec',
      lines: [
        { kind: 'say', text: f('Hi {name}, this is [your name] from FeeOptima. You booked a call about your {product} with {bank}.') },
        { kind: 'say', text: 'Is now still a good time? This takes about fifteen minutes.' },
        { kind: 'say', text: 'I’ll give you the exact words to use with your bank. You make the call — they’ll only reprice for the account holder.' },
      ],
    },
    {
      id: 'check',
      title: 'Check their numbers',
      time: '2 min',
      lines: [
        ...pr.check.map((t) => ({ kind: 'ask', text: f(t) })),
        { kind: 'do', text: 'If what they say differs from the panel above, use THEIR number and note it in the comments.' },
      ],
    },
    {
      id: 'diagnose',
      title: 'The question that decides everything',
      time: '2 min',
      lines: [
        { kind: 'ask', text: co.keyAsk, note: co.keyWhy, branches: co.branches },
        ...(co.extraAsk ? [{ kind: 'ask', text: co.extraAsk, note: co.extraThen }] : []),
      ],
    },
    {
      id: 'gap',
      title: 'Tell them the gap',
      time: '2 min',
      lines: pr.pitch.map((t) => ({ kind: 'say', text: f(t) })),
    },
    {
      id: 'ask',
      title: 'Dictate this — word for word',
      time: '3 min',
      quote: f(pr.ask),
      lines: [
        { kind: 'do', text: 'Read it slowly. Make them write it down. Offer to repeat it.' },
        { kind: 'do', text: pr.who },
      ],
    },
    {
      id: 'push',
      title: 'If the bank pushes back',
      time: '2 min',
      objections: pr.objections.map((o) => ({ they: o.they, say: f(o.say) })),
    },
    {
      id: 'close',
      title: 'Before you hang up',
      time: '3 min',
      lines: [
        ...pr.close.map((t) => ({ kind: 'do', text: f(t) })),
        ...[...pr.warn, ...co.warn].map((t) => ({ kind: 'warn', text: t })),
        { kind: 'do', text: 'Log the outcome and their comments below before the next call.' },
      ],
    },
  ];

  return { steps, words: co.words, regulator: co.regulator, productLabel: pr.label };
}

// Kept for the "How to run a call" tab.
export const CALL_FLOW = [
  { title: 'Before you dial', points: ['Read the panel: bank, rate, best rate, gap.', 'Check the comments — someone may have called already.', 'Open the call guide for their country + product.'] },
  { title: 'On the call', points: ['Follow the script top to bottom.', 'Use their numbers, not the script’s examples.', 'Stop after two levers. Nobody remembers five.'] },
  { title: 'After', points: ['Set the outcome.', 'Type what they said into Customer comments.', 'Stamp the actual call time if it wasn’t the booked slot.'] },
];
