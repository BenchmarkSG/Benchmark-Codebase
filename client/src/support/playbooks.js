/* Negotiation playbooks for the customer-support portal.
 *
 * WHO READS THIS
 *   The person handling an Option-2 callback. They have the customer's booking
 *   and benchmark (bank, product, their rate, the gap) but no domain background.
 *   These notes are what turns that data into a coaching call.
 *
 * THE ONE RULE: NAME THE LEVER, NEVER THE NUMBER.
 *   Nothing here quotes a rate, a fee or a penalty percentage. Every figure the
 *   agent says out loud comes from the customer's own benchmark or from the
 *   customer's own paperwork. A hardcoded number would be stale within weeks,
 *   wrong across five markets, and — worst — indistinguishable from an invented
 *   one. The same discipline the rate seeder enforces (NO_SYNTHETIC) applies to
 *   anything said to a customer.
 *
 * STRUCTURE
 *   COUNTRY  — how loans are priced in that market and what the regulator allows.
 *   PRODUCT  — what is actually negotiable on that product, anywhere.
 *   SPECIFIC — the few country+product pairs with something genuinely unique.
 *   playbookFor() composes the three. Composition rather than 42 hand-written
 *   blobs: the levers for a Malaysian and a Thai overdraft are 80% the same, and
 *   duplicating them means 42 places to fix when one changes.
 */

/* ---------------------------------------------------------------------------
   How to run the call. Product-independent.
   --------------------------------------------------------------------------- */
export const CALL_FLOW = [
  {
    title: '1 · Before you dial (2 min)',
    points: [
      'Read their benchmark: bank, product, their rate, the best available rate, the annual gap.',
      'Check the booking note — they often say what they have already tried.',
      'Have their paperwork question ready: you will need their letter of offer / sanction letter / facility agreement to find the lock-in and the spread.',
    ],
  },
  {
    title: '2 · Open (1 min)',
    points: [
      '“Hi <name>, this is <you> from FeeOptima — you booked a call about your <product> with <bank>.”',
      '“I have your comparison in front of me. Is now still a good time for about 20 minutes?”',
      'Set the frame early: “I am not going to call your bank for you — I am going to give you the exact words so you can, because the bank will only reprice for the account holder.”',
    ],
  },
  {
    title: '3 · Confirm the numbers (3 min)',
    points: [
      'Read their rate back and ask them to confirm it against their latest statement. Benchmarks are only as good as what they typed in.',
      'Ask whether the rate is fixed or floating, and when the current package ends. This decides the whole strategy.',
      'Ask what the outstanding balance and remaining tenor are — the saving is meaningless without them.',
    ],
  },
  {
    title: '4 · Explain the gap (3 min)',
    points: [
      'Say what the gap is in money per year, not in percentage points. People act on money.',
      'Explain that the best rate is a real rate a real bank is offering today — not a teaser you invented.',
      'Be honest about why banks let this happen: they price for retention only when asked. Nobody is being cheated; they are being unprofitable to complain.',
    ],
  },
  {
    title: '5 · Give them the play (8 min)',
    points: [
      'Walk the levers below in order. Stop after the two that fit them — a customer who remembers two asks will use them.',
      'Make them write down the exact sentence. Offer to repeat it slowly.',
      'Tell them who to ask for: retention / customer-retention team, not the branch counter and not the call-centre front line.',
    ],
  },
  {
    title: '6 · Close (3 min)',
    points: [
      'Agree a concrete next action and a date: “call them Thursday, ask for retention, quote the competing rate.”',
      'Tell them what to do if the bank says no — the switch is the leverage, and it only works if they are willing to use it.',
      'Offer the Option-3 advisor if they would rather someone negotiated for them. Do not push it if they are already confident.',
      'Log the outcome on the lead before you hang up.',
    ],
  },
];

/* ---------------------------------------------------------------------------
   Compliance guardrails. Read once, remember forever.
   --------------------------------------------------------------------------- */
export const GUARDRAILS = [
  'We are not licensed financial advisers. Coach on process and pricing — never recommend a specific product as suitable for their circumstances.',
  'Never promise a rate, an approval, or a saving. Say “this is what the market is offering” and “this is what to ask for”, never “you will get”.',
  'Never offer to call the bank as the customer, and never ask for their banking password, OTP or card number. We have no reason to hold any of it.',
  'If they ask about tax, legal or insurance consequences, refer them to a qualified professional.',
  'If they are in financial distress or missing payments, stop the negotiation coaching. Point them at their bank’s hardship team — that is a different conversation and pushing a refinance can make it worse.',
  'The fee is refundable if we find them no savings. If the benchmark shows they are already at or better than market, say so plainly and tell them about the refund. Do not invent a saving to justify the call.',
];

/* ---------------------------------------------------------------------------
   Per-market pricing mechanics and regulator-specific levers.
   --------------------------------------------------------------------------- */
export const COUNTRY = {
  SG: {
    name: 'Singapore',
    regulator: 'MAS (Monetary Authority of Singapore)',
    anchor: 'SORA — the Singapore Overnight Rate Average, published by MAS. Floating packages quote compounded SORA (1-month or 3-month) plus a spread.',
    pricing: [
      'Three package types: fixed for a period, floating on SORA + spread, or a board rate the bank sets itself (often pegged to its own fixed-deposit rates). Board rates are the opaque ones — the bank can move them without any published benchmark moving.',
      'SIBOR and SOR have been retired. If their paperwork still references either, the loan has been or must be converted — that conversion is itself a repricing conversation.',
      'The spread is the negotiable half. SORA is not — nobody sets it for them.',
    ],
    levers: [
      { title: 'Reprice before you refinance', detail: 'Repricing means staying with the same bank on a better package. It is far cheaper than refinancing — usually a small conversion fee, no new legal or valuation work. Always ask for this first; the threat of leaving is what makes it happen.' },
      { title: 'Time it to the lock-in', detail: 'Most packages have a lock-in period with a penalty on early redemption. Ask them to find the exact end date on their letter of offer. The strongest window is the few months before it ends — banks will reprice to keep the loan rather than lose it.' },
      { title: 'Watch the legal subsidy clawback', detail: 'If the bank paid their legal or valuation fees, leaving within the clawback period means paying that back. It is on the letter of offer. Factor it into whether switching actually wins.' },
      { title: 'Check they can still refinance', detail: 'Property loans are subject to TDSR, and HDB loans additionally to MSR. If their income has fallen or their other debts have grown since they borrowed, they may not requalify elsewhere — which removes their leverage. Better to find out before they threaten to leave.' },
    ],
    terms: 'Letter of Offer · repricing vs refinancing · lock-in · clawback · board rate · FHR/FDR · TDSR · MSR',
  },

  IN: {
    name: 'India',
    regulator: 'RBI (Reserve Bank of India)',
    anchor: 'The RBI repo rate. Since October 2019 floating-rate retail and MSME loans must be linked to an external benchmark (EBLR) — for most banks that is the repo rate.',
    pricing: [
      'Their rate is benchmark + spread. The benchmark moves with the RBI; the spread is set by the bank at sanction and is where the negotiation lives.',
      'Older loans may still sit on MCLR or a legacy base rate. These reprice slowly and almost always sit above a current EBLR loan — moving off them is often the single biggest win available.',
      'The spread is risk-priced off their credit bureau score. A borrower whose score has improved since sanction is being charged for a risk they no longer represent.',
    ],
    levers: [
      { title: 'Ask for a spread reduction first', detail: 'Same bank, same benchmark, lower spread. Banks run retention desks precisely for this. It needs no new paperwork and no new loan.' },
      { title: 'Move off MCLR to EBLR', detail: 'If they are on MCLR or a base rate, banks allow a switch to the external-benchmark regime for a one-time conversion fee. Have them ask what the fee is and what the new spread would be — then compare against the gap on their benchmark.' },
      { title: 'Cite the improved credit score', detail: 'If their bureau score has gone up since sanction, that is the argument. “You priced me at sanction for a score of X; it is now Y. Reprice me to your current card rate for my score.”' },
      { title: 'Prepayment charges on floating-rate loans', detail: 'RBI restricts foreclosure and prepayment charges on floating-rate term loans to individual borrowers. Have them confirm it applies to their loan before relying on it — the protection turns on the loan being floating-rate and the borrower being an individual. Where it applies, it removes the main cost of walking away, which is exactly why it is leverage.' },
      { title: 'Balance transfer as the fallback', detail: 'A competing bank will quote a takeover rate. Get that quote in writing first, then take it to the existing bank. The quote is worth more as a negotiating tool than as a transaction.' },
      { title: 'Processing fees are waived more often than they are paid', detail: 'On any switch or top-up, the processing fee is close to always negotiable. It is the cheapest thing a bank can give away to close.' },
    ],
    terms: 'Sanction letter · EBLR · repo-linked · MCLR · spread · balance transfer / takeover · foreclosure charges · CIBIL score',
  },

  MY: {
    name: 'Malaysia',
    regulator: 'BNM (Bank Negara Malaysia)',
    anchor: 'The OPR — Overnight Policy Rate, set by BNM. Since August 2022 retail floating loans are quoted against the SBR (Standardised Base Rate), which moves only with the OPR.',
    pricing: [
      'Their effective lending rate is SBR + spread. Because SBR is standardised across banks and moves only with the OPR, the spread is the only thing that differs between lenders — which makes cross-bank comparison unusually clean here.',
      'Loans taken before the SBR changeover may still sit on the older BR or BLR framework. Ask which one their agreement names.',
      'Islamic financing quotes a profit rate rather than interest, with a ceiling profit rate in the contract. The negotiation is the same; the vocabulary is not.',
    ],
    levers: [
      { title: 'Attack the spread, not the SBR', detail: 'Every bank has the same SBR. If a competitor is cheaper, it is purely their spread — and that is a decision their bank can match if it wants to keep the account.' },
      { title: 'Find the lock-in before threatening to move', detail: 'Housing financing commonly carries a multi-year lock-in with a penalty on early settlement. It is in the facility agreement. Leaving inside it can cost more than the saving.' },
      { title: 'Ask who absorbs the moving costs', detail: 'Refinancing brings legal fees, valuation and stamp duty. Banks competing for a takeover will often absorb some or all of it. That package is negotiable separately from the rate — and customers forget to ask.' },
      { title: 'Compare conventional against Islamic', detail: 'Many banks offer both. The ceiling profit rate in an Islamic facility caps the downside, which some customers value more than a marginally lower conventional rate. Present it as a choice, never as a recommendation.' },
    ],
    terms: 'Facility agreement · OPR · SBR · spread / ELR · lock-in · early settlement · profit rate · ceiling profit rate',
  },

  TH: {
    name: 'Thailand',
    regulator: 'BOT (Bank of Thailand)',
    anchor: 'The BOT policy rate. Banks publish their own reference rates off it — MLR (minimum lending rate), MRR (minimum retail rate) and MOR (minimum overdraft rate).',
    pricing: [
      'Retail loans are usually quoted as a reference rate minus a margin — “MRR − x” — rather than benchmark plus spread. Lower MRR and a bigger discount both help; ask which of the two changed.',
      'Mortgages almost always start with a promotional period (fixed or stepped for the first years) and then revert to the floating reference. The revert is where the pain appears, and customers usually call once it has already happened.',
      'MLR, MRR and MOR are set per bank and published. Two banks quoting the same “MRR − 2” are not offering the same rate.',
    ],
    levers: [
      { title: 'The end of the promo period is the moment', detail: 'Ask when their promotional rate ended or ends. Banks expect to be asked for a retention rate at that point and frequently grant one — but only to customers who ask.' },
      { title: 'Request a rate reduction in writing', detail: 'A formal written request to the branch or retention team is the standard route and is taken more seriously than a phone complaint. It also creates a record if they later escalate.' },
      { title: 'Refinancing costs are real here', detail: 'A new mortgage registration and appraisal are payable on a switch, and leaving early in the term may trigger a prepayment penalty. Have them get both figures before committing — the saving must clear them.' },
      { title: 'Compare the reference rate itself', detail: 'Since each bank sets its own MRR/MLR/MOR, a competitor’s headline discount can be worse in absolute terms. Always compare the resulting rate, never the discount.' },
    ],
    terms: 'MLR · MRR · MOR · promotional period · retention rate · refinance / re-mortgage · prepayment penalty',
  },

  ID: {
    name: 'Indonesia',
    regulator: 'OJK and Bank Indonesia',
    anchor: 'The BI-Rate, set by Bank Indonesia. Banks must publish SBDK (Suku Bunga Dasar Kredit — prime lending rate) by segment; the customer’s actual rate is SBDK plus a risk premium.',
    pricing: [
      'SBDK is published and comparable. The risk premium on top is not published — it is assigned to the individual borrower, and it is the negotiable part.',
      'KPR (mortgage) products typically run a fixed promotional period and then float. Customers almost always call after the float has kicked in.',
      'Because SBDK is broken out by segment (mortgage, non-mortgage consumer, retail, corporate), make sure any comparison uses the same segment.',
    ],
    levers: [
      { title: 'Separate SBDK from the risk premium', detail: 'Ask the bank what the published SBDK is for their segment and what premium they are carrying on top. Forcing that split is often the first time the customer sees what is actually being charged for their risk.' },
      { title: 'Ask for the premium to be re-assessed', detail: 'A clean payment record since drawdown is the argument for cutting the premium. It costs the bank nothing but margin, and losing the account costs more.' },
      { title: 'Take-over as leverage', detail: 'A competing bank will quote to take the facility over. Get it in writing, then give the existing bank the chance to match before moving.' },
      { title: 'Price in the exit cost', detail: 'Early settlement penalties, notary and appraisal fees apply on a take-over. Get the numbers from their existing agreement before they commit to switching.' },
    ],
    terms: 'BI-Rate · SBDK · risk premium · KPR · take-over · penalti pelunasan dipercepat',
  },
};

/* ---------------------------------------------------------------------------
   Per-product levers. Apply in every market unless SPECIFIC overrides them.
   --------------------------------------------------------------------------- */
export const PRODUCT = {
  housing_loan: {
    frame: 'The largest balance most people will ever carry, and the most repriceable. Banks quote board rates publicly and settle well below them to retain a paying borrower. A mortgage customer who has never asked is almost always above market.',
    levers: [
      { title: 'Ask to reprice before asking to leave', detail: 'Same bank, better package. Cheaper and faster than moving, and it is what the retention desk exists to do.' },
      { title: 'Get a written competing quote first', detail: 'An in-principle offer from another lender turns a request into a negotiation. Without it they are asking for a favour.' },
      { title: 'Know the exit cost before threatening the exit', detail: 'Lock-in penalty, clawback of any subsidised fees, new legal and valuation costs. The saving has to clear all of it.' },
      { title: 'Shorten the tenor instead of the payment', detail: 'If the bank will not move the rate, a shorter tenor at the same instalment cuts total interest. It is a second-best win that banks resist far less.' },
    ],
    ask: 'I have a written offer from <competitor> at <their rate>. I would rather not move. What is the best you can reprice me to if I stay?',
    objections: [
      { bank: '“That rate is for new customers only.”', you: '“Then I will become a new customer somewhere else. I would rather stay — what can you actually do?”' },
      { bank: '“Your rate is already competitive.”', you: '“Competitive against what? Here is a written offer that is lower. Match it or tell me you cannot.”' },
      { bank: '“You are within your lock-in period.”', you: '“Understood — so reprice me now, or tell me the date the lock-in ends and I will call back that week.” (Then actually call back.)' },
    ],
    watch: [
      'A lower rate on a longer tenor can cost more overall. Always compare total interest, not the monthly instalment.',
      'Teaser structures: a headline rate that lasts a year and then reverts is not a saving, it is a deferral. Ask what it reverts to.',
      'If the customer is likely to sell within a couple of years, refinancing rarely pays back its own costs.',
    ],
  },

  personal_loan: {
    frame: 'Advertised “from” rates are for the best-profile borrower and rarely match what people actually pay. The realised cost — fees included — is usually well above the headline.',
    levers: [
      { title: 'Compare on all-in cost, not headline rate', detail: 'Processing fee, insurance bundled into the drawdown, and early-settlement terms all move the true cost. Ask for the effective rate including fees.' },
      { title: 'Consolidate if they hold several', detail: 'Multiple small unsecured balances at different banks price worse than one consolidated facility — and consolidation is a competitive product banks bid for.' },
      { title: 'Use the credit score', detail: 'Unsecured pricing is the most score-sensitive of any product. If their score has improved since drawdown, that is the whole argument.' },
      { title: 'Check the early-settlement terms', detail: 'Some structures charge interest for the full original term regardless of early repayment. If so, refinancing early destroys most of the benefit — find out before recommending it.' },
    ],
    ask: 'What is my all-in effective rate including every fee, and what would you offer me today as a new applicant with my current credit score?',
    objections: [
      { bank: '“The rate is fixed for the term.”', you: '“Then I am asking about a new facility that settles this one. What would you price that at?”' },
      { bank: '“We cannot change an existing loan.”', you: '“Can you refinance it internally? If not, I will get a consolidation quote elsewhere.”' },
    ],
    watch: [
      'Never encourage borrowing more than they currently owe. Refinancing is about cost, not about releasing cash.',
      'If they are using unsecured credit to cover shortfalls, that is distress — stop and refer to the bank’s hardship team.',
    ],
  },

  vehicle_loan: {
    frame: 'Dealer-arranged financing is a commission product: the rate presented at the showroom is frequently above what the same bank would quote directly. The car is also a depreciating asset, which changes the maths.',
    levers: [
      { title: 'Refinance away from the dealer’s arrangement', detail: 'Going directly to a bank for the same balance often prices better, because nobody is being paid to introduce it.' },
      { title: 'Check the interest structure', detail: 'Flat-rate quoting makes a loan look far cheaper than it is. Ask for the effective rate. If they were quoted a flat rate, the real cost is materially higher.' },
      { title: 'Confirm early-settlement rules', detail: 'Vehicle financing frequently carries rebate rules on early settlement that are less generous than a simple interest calculation. Get the settlement figure in writing.' },
    ],
    ask: 'What is the effective rate on my current agreement, and what is the settlement figure today?',
    objections: [
      { bank: '“Your rate is only <low number> — that is very competitive.”', you: '“Is that flat or effective? Give me the effective rate.”' },
    ],
    watch: [
      'If the outstanding exceeds the vehicle’s value, refinancing options narrow sharply. Ask before promising anything.',
      'Short remaining tenor means little interest left to save — be honest that the call may not be worth acting on.',
    ],
  },

  fixed_deposit: {
    frame: 'The one product where the customer is the lender. Smaller and foreign banks buy deposits with promotional yields; large incumbents rely on inertia and pay less. Rolling over automatically is how customers lose most.',
    levers: [
      { title: 'Never let it auto-roll', detail: 'Automatic rollover almost always lands on the board rate, not the promotional rate. Diarise the maturity date and place it fresh each time.' },
      { title: 'Ask about fresh-funds conditions', detail: 'The best promotional tiers often require money new to the bank. Existing balances may not qualify — check before they move anything.' },
      { title: 'Ladder the tenors', detail: 'Splitting across maturities keeps some money always close to renewal, so they can chase promotions without locking everything up.' },
      { title: 'Use the relationship', detail: 'If they hold a loan with the same bank, the deposit desk and the lending desk are both fighting for the relationship. Ask for a preferential tier on that basis.' },
    ],
    ask: 'What is your best promotional tenor and yield right now, and does my existing balance qualify or does it need to be fresh funds?',
    objections: [
      { bank: '“That promotion ended.”', you: '“What is running now, and when does the next one start? I will place it then.”' },
      { bank: '“That rate needs a larger amount.”', you: '“What is the threshold?” (Sometimes it is close enough to be worth consolidating.)' },
    ],
    watch: [
      'Breaking a deposit early usually forfeits interest. Check the maturity before suggesting they move.',
      'Deposit insurance limits differ by market. If they are placing a large sum with a small bank, mention that the limit exists and let them look it up — do not quote a figure.',
    ],
  },

  cross_border: {
    frame: 'The visible fee is the decoy. The real cost is the margin baked into the exchange rate, and most customers have never compared the rate they were given against the mid-market rate on the same day. Our benchmark computes the all-in cost precisely because the fee alone is misleading.',
    levers: [
      { title: 'Make them quote the all-in cost', detail: 'Fee plus FX margin plus any correspondent or lifting charge, as a single percentage of the amount sent. Banks resist this because it is the only number that compares.' },
      { title: 'Ask for a dealt rate on larger amounts', detail: 'Above a threshold, the treasury desk will quote a live rate rather than the retail board rate. Most customers do not know they can ask.' },
      { title: 'Negotiate on volume, not per transfer', detail: 'Regular remitters and SMEs with recurring payments have far more leverage than one-off senders. Frame it as annual volume.' },
      { title: 'Check who pays the intermediary charges', detail: 'Whether the beneficiary receives the full amount depends on the charge instruction. A cheap-looking transfer that arrives short is not cheap.' },
    ],
    ask: 'What is my all-in cost as a percentage — your fee plus your FX margin against mid-market — and what improves if I commit my annual volume to you?',
    objections: [
      { bank: '“We charge zero fees.”', you: '“Then what is your margin over the mid-market rate? That is where the cost is.”' },
      { bank: '“That is the board rate.”', you: '“Can treasury quote me? I send <amount> a year.”' },
    ],
    watch: [
      'Specialist remittance providers usually beat banks outright on small transfers. Say so — our value is the honest comparison, not defending banks.',
      'For SMEs, settlement speed and audit trail can legitimately be worth more than the cheapest rate. Do not push them to the cheapest if it breaks their process.',
    ],
  },

  current_account: {
    frame: 'Idle operating balances that earn nothing. Where the regulator permits credit interest, an SME sitting on a working balance is lending the bank money for free.',
    levers: [
      { title: 'Ask for credit interest or a fee rebate', detail: 'Many banks will pay one or offset the other against charges, tiered by balance. Most SMEs have never asked.' },
      { title: 'Bundle the relationship', detail: 'Bring the loan, the FX and the payroll into the conversation. Pricing improves on total relationship value, not on the account in isolation.' },
      { title: 'Sweep idle cash', detail: 'If the bank will not pay on the current account, ask about an automatic sweep into a yielding account. It is an operational change, not a pricing concession, so banks agree more readily.' },
    ],
    ask: 'What credit interest or fee rebate can you offer on my average balance, and what changes if I bring my FX and payroll across?',
    objections: [
      { bank: '“Current accounts do not pay interest.”', you: '“Then what fee rebate applies at my balance, and what sweep options do you offer?”' },
    ],
    watch: ['Confirm the balance they quoted is a genuine average, not a one-off peak.'],
  },

  current_account_fees: {
    frame: 'Interest is off the table by regulation, so the entire negotiation is cost. What is negotiable is the minimum balance requirement and the charges stacked on top of it — and banks waive these for steady turnover far more often than SMEs ask.',
    levers: [
      { title: 'Negotiate the minimum balance first', detail: 'The average-monthly-balance requirement drives the non-maintenance penalty. Getting the requirement lowered is worth more than arguing any single charge.' },
      { title: 'Attack the non-maintenance penalty', detail: 'It is the single largest recurring charge for most small accounts, and it is routinely waived for an account with reliable turnover.' },
      { title: 'Cash handling and transaction limits', detail: 'Free cash-deposit limits and free transfer counts are set per variant. A different account variant at the same bank may fit their pattern far better at no extra cost.' },
      { title: 'Bring the turnover argument', detail: 'Banks price current accounts on the value of the flows through them. An SME with consistent credits is worth keeping — say so explicitly.' },
    ],
    ask: 'What account variant fits my turnover, what is its minimum balance, and will you waive the non-maintenance and cash-handling charges given my monthly credits?',
    objections: [
      { bank: '“These charges are standard.”', you: '“Standard for which variant? Move me to the one that suits my turnover.”' },
      { bank: '“We cannot waive charges.”', you: '“Then lower the minimum balance instead.” (One of the two usually moves.)' },
    ],
    watch: [
      'Never suggest interest is negotiable here — it is prohibited, and saying otherwise destroys credibility instantly.',
      'Charges are annual totals in our benchmark. Make sure they compare annual against annual.',
    ],
  },

  overdraft: {
    frame: 'Working-capital pricing is among the most negotiable products a bank sells, and among the least challenged. SMEs with steady turnover and clean conduct are routinely paying legacy rates set years ago.',
    levers: [
      { title: 'Reprice on conduct, not on request', detail: 'Clean operation of the limit, no excesses, steady credits — that is the case. Have them bring the last twelve months of conduct to the conversation.' },
      { title: 'Offer or improve security', detail: 'Moving from unsecured to secured, or adding property or receivables, cuts the margin materially. Only raise it if they are genuinely willing.' },
      { title: 'Right-size the limit', detail: 'Commitment fees are charged on the undrawn portion. An oversized facility costs money to not use. Match the limit to the real cycle.' },
      { title: 'Review the whole facility letter annually', detail: 'Renewal is the natural repricing moment and most SMEs let it auto-renew. Diarise it.' },
    ],
    ask: 'My account has run clean for twelve months. What margin can you offer at renewal, and what would improve it — more security, or a right-sized limit?',
    objections: [
      { bank: '“This is our standard SME rate.”', you: '“I am not a standard risk. Here is my conduct. Price me on it.”' },
      { bank: '“We would need to re-underwrite.”', you: '“Then re-underwrite. My numbers are better than when you set this.”' },
    ],
    watch: [
      'An overdraft priced off a bank-set reference rate moves when the bank decides. Check what theirs is pegged to.',
      'Do not encourage taking on security lightly — a personal guarantee or a charge over property is a serious commitment, not a pricing trick.',
    ],
  },

  short_term_finance: {
    frame: 'Trade and invoice finance is priced per transaction and per relationship, which means margins drift. Customers renew on autopilot and rarely test the market.',
    levers: [
      { title: 'Separate the margin from the fees', detail: 'Ask for the funded margin and every per-transaction fee as distinct numbers. Banks often concede on one while holding the other.' },
      { title: 'Price on counterparty quality', detail: 'If their buyers are strong names, the risk is the buyer’s, not theirs. That argument moves pricing more than their own balance sheet does.' },
      { title: 'Test the market at renewal', detail: 'Trade finance is competitive and banks actively pitch for it. A live competing term sheet is the fastest route to a better renewal.' },
    ],
    ask: 'Break out the funded margin from the transaction fees, and tell me what improves if I commit my annual trade volume.',
    objections: [
      { bank: '“Pricing reflects your risk profile.”', you: '“My buyers are <names>. Price the exposure to them, not to me.”' },
    ],
    watch: ['Facility structures vary enormously — make sure any comparison is like-for-like before calling a gap a saving.'],
  },

  unfunded_facility: {
    frame: 'Guarantees and letters of credit are commission products. Because no money is drawn, customers treat the cost as unavoidable admin — so it is rarely challenged and drifts upward.',
    levers: [
      { title: 'Commission is negotiable, per instrument', detail: 'Ask for the rate per annum and the minimum charge separately. The minimum is what hurts on small instruments.' },
      { title: 'Cash-cover reduces the rate', detail: 'If they are already providing cover, the commission should reflect that the bank carries little risk. Many do not reprice it automatically.' },
      { title: 'Consolidate the limit', detail: 'One umbrella limit across instruments usually prices better than separate lines, and cuts issuance admin.' },
    ],
    ask: 'What is the per-annum commission and the minimum charge, and what does it drop to against cash cover?',
    objections: [
      { bank: '“That is the tariff rate.”', you: '“Tariffs are published starting points. What is the relationship rate?”' },
    ],
    watch: ['Confirm whether their figure is per annum or per issuance — mixing the two makes the gap meaningless.'],
  },
};

/* ---------------------------------------------------------------------------
   Country + product pairs with something genuinely specific to add.
   Keyed "<CC>:<productId>". Merged on top of the generic product play.
   --------------------------------------------------------------------------- */
export const SPECIFIC = {
  'IN:housing_loan': {
    note: 'The highest-value call we take in India. Two levers stack: moving a legacy MCLR loan onto the repo-linked regime, and cutting the spread on the improved credit score. Ask which regime the loan is on before anything else — it changes the entire conversation.',
    extra: [
      { title: 'Establish the regime first', detail: 'Repo-linked, MCLR, or a legacy base rate? It is named on the sanction letter or the latest statement. A base-rate loan is usually the worst-priced product in Indian retail banking.' },
      { title: 'Conversion fee versus the gap', detail: 'The one-time fee to switch regimes or reset the spread is small against a multi-year gap on a large balance. Do the arithmetic with them on the call.' },
    ],
  },
  'IN:current_account_fees': {
    note: 'Never suggest negotiating interest — RBI prohibits banks paying it on current accounts. The whole conversation is minimum balance and charges.',
  },
  'SG:housing_loan': {
    note: 'Establish first whether the property is HDB or private, and whether the loan is on a fixed package, a SORA-linked floating package, or a bank board rate. Board-rate loans are where the worst pricing hides, because nothing public constrains them.',
    extra: [
      { title: 'Repricing is usually the right answer', detail: 'Given legal and valuation costs, staying with the bank on a better package frequently beats moving. Start there and keep refinancing in reserve as leverage.' },
    ],
  },
  'SG:current_account': {
    note: 'Singapore is the market where SME credit interest is genuinely available. Do not assume the customer knows it exists.',
  },
  'TH:housing_loan': {
    note: 'Ask immediately whether the promotional period has ended. Almost every Thai mortgage call is triggered by the revert to the floating reference, and the retention request is the standard remedy.',
  },
  'MY:housing_loan': {
    note: 'Because SBR is standardised across banks, a rate gap here is purely a spread gap — which makes the “your competitor charges a smaller spread on the same SBR” argument unusually concrete.',
  },
  'ID:housing_loan': {
    note: 'KPR promotional periods are the usual trigger. Force the split between the published SBDK and the individual risk premium — the premium is the negotiable half and most customers have never seen it separated.',
  },
};

/* ---------------------------------------------------------------------------
   Compose. Returns null when the product is not offered in that market so the
   UI can say so rather than render a confident-looking empty page.
   --------------------------------------------------------------------------- */
export function playbookFor(countryCode, productId) {
  const country = COUNTRY[countryCode];
  const product = PRODUCT[productId];
  if (!country || !product) return null;
  const specific = SPECIFIC[`${countryCode}:${productId}`] || null;
  return {
    country,
    product,
    specific,
    // Country levers come after the product ones: the product tells you what to
    // ask for, the market tells you what is actually possible there.
    levers: [...product.levers, ...(specific?.extra || []), ...country.levers],
  };
}
