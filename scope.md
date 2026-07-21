# BankBenchmark.sg — Scope, Critical Analysis & Strategy

> A working note on the idea behind the product: what it is, why it can work, the
> ways it can fail, where friction hides, how it scales, how we acquire customers,
> and the regulatory/data-governance guardrails. Written to be argued with, not
> admired.

---

## 1. The idea in one line

**A benchmarking layer for banking costs.** A person, SME, or corporate provides a
few numbers (typed) or pastes/uploads a statement; the tool instantly benchmarks
their fees, FX margins and interest rates against the *best available in the market*,
shows the **savings without naming the winning bank**, and — on a call-to-action —
offers a **virtual negotiator** who renegotiates on their behalf. Revenue is a
**percentage of realised savings**, with **no obligation** if we save nothing.

The product deliberately sits *beside* the banking system, not inside it: we never
hold deposits, initiate payments, or give investment advice — so we avoid a banking
licence (see §11).

---

## 2. Why this can work (the core insight)

1. **Banking cost is deliberately opaque.** FX margin is baked into the rate, not
   shown as a fee. Loan pricing is negotiated privately. Cross-border fees are split
   across three legs (initiation, intermediary/correspondent, beneficiary). Customers
   *cannot* self-benchmark, so they overpay by inertia.
2. **The overpayment is large and recurring.** An SME doing SGD 250k/month of
   cross-border payments at a 1.8% margin vs a 0.35% benchmark is bleeding ~SGD 43k/yr
   — every year, silently.
3. **The fix requires no switching pain to demonstrate.** We can show the gap in
   seconds without the customer moving anything. That is a powerful "aha".
4. **Alignment via success fee.** "You only pay a slice of what we actually save you"
   removes the buyer's risk and is honest — our incentive is the customer's incentive.

---

## 3. What the product actually does (as built)

| Layer | Function | Prototype status |
| --- | --- | --- |
| **Input** | Typed parameters **or** paste/upload of statement text | Manual form + paste-and-parse ✅ (PDF/CSV upload = next) |
| **Repository** | Curated + (future) crowdsourced pricing: mortgage 20y fixed/floating, 5y personal loan, overdraft, 3-month working-capital, FX margins across 12 corridors (INR/PHP/BDT/PKR/CNY/USD…), deposits, and 3-leg transfer fees | `server/data.js` ✅ |
| **Benchmark engine** | Compares "your" figure to "best" and computes annualised savings; masks the provider | `server/benchmark.js` ✅ |
| **Reveal / conversion** | Savings shown free; identity + report gated behind a CTA and a 3-tier plan | Tiers modal + email capture ✅ (mail backend later) |
| **Negotiator** | "Concierge" tier renegotiates for a % of savings | Positioned, not operational |

---

## 4. Critical analysis — what is genuinely strong

- **Zero-friction "wow".** Value is visible before any commitment or data upload.
- **Two-sided data moat potential.** Every consented statement makes the benchmark
  sharper, which is a compounding advantage crowdsourcing can build over time.
- **Multiple monetisation rungs** (SaaS → report → referral marketplace → negotiator →
  bank/consultant referral) let us start low-risk and climb.
- **Regulatory-light entry** if we stay a *technology & analytics* business and push
  advisory to independent consultants (see §11).
- **Clear beachhead**: SME cross-border FX + cash management is the sharpest pain and
  the least served by consumer comparison sites.

---

## 5. Concept of failure — what actually kills this

Ranked by how lethal, most lethal first.

### 5.1 The "actual vs card rate" data problem (existential)
Banks publish **teaser/board rates**, not what they *eventually offer* a specific
customer (which depends on credit history, relationship, volume). SingSaver and
MoneySmart show card rates and still can't tell you *your* real number. If our
"benchmark" is just published rates, we are a prettier comparison site and our savings
claims are wrong — which destroys trust and (worse) invites regulatory attention for
misleading figures.
- **Mitigation:** benchmark against **realised** data (consented statements + negotiator
  outcomes + a broker panel), present it as **ranges/percentiles** ("SMEs like you
  achieved 0.3–0.6% margin"), and label everything *indicative* until we have depth.
  The negotiator arm is not just revenue — it is the **data-collection flywheel** for
  ground-truth pricing.

### 5.2 Cold-start / chicken-and-egg
Crowdsourced benchmarks need volume to be credible; credibility is needed to get
volume. Thin data → weak benchmark → low trust → no uploads.
- **Mitigation:** seed with expert/broker panel data (the "ex-JPM/Citi/SCB" credibility
  is real leverage here), start in ONE corridor/product where we can be authoritative
  (SME SGD→INR/PHP FX), and expand only once each cell is dense.

### 5.3 Trust & the upload barrier
People are (rightly) wary of uploading bank statements. One breach headline ends it.
- **Mitigation:** privacy-by-design (§11): typed input works with zero upload; parse
  in-session; mask/strip PII early; publish only aggregates; be loud about "no personal
  data stored". Offer the value *before* asking for anything sensitive.

### 5.4 Savings verification / attribution
The success-fee model dies if we can't prove *we* caused the saving, or if the bank
matches a rate the customer could've gotten alone. Disputes over "did you really save
me this?" are the classic performance-fee failure mode.
- **Mitigation:** capture a signed pre-negotiation baseline; define savings
  contractually (delta vs baseline over 12 months); take fees only on realised,
  documented reductions.

### 5.5 Incumbent / channel response
Banks can widen spreads elsewhere, refuse third-party negotiators, or comparison
incumbents (SingSaver, MoneySmart, Wise) can bolt on "benchmarking".
- **Mitigation:** our wedge is **SME transaction banking + FX**, which consumer sites
  ignore and which is stickier and higher-value. Move fast into the data moat.

### 5.6 Negotiator arm doesn't scale
Human negotiation is high-touch and margin-thin at small ticket sizes.
- **Mitigation:** productise it — templated RFP/repricing playbooks, tiered by ticket
  size; only high-value tickets get a human; the rest get a self-serve playbook.

---

## 6. Where friction comes from

| Friction | Where it bites | Reduction lever |
| --- | --- | --- |
| **Data-entry** | Users don't know their FX margin (it's hidden in the rate) | Paste-and-parse; upload; smart defaults; "don't know? use typical" |
| **Trust** | Uploading statements; believing the savings number | Typed-first, no-storage, aggregates-only, expert branding, indicative labelling |
| **Comprehension** | "% margin", "EIR", "3-leg fees" are jargon | Plain-language output; show $ /year not just bps |
| **Conversion** | Free savings → paid reveal/negotiator | Reveal is the natural CTA; no-obligation success fee lowers the risk |
| **Delivery** | Actually banking the saving (negotiate/switch) | Concierge + documented baseline + bank-facing playbooks |
| **Cross-border UX** | Different rates, currencies, regs per country | Localise corridors and copy per market; one corridor at a time |

---

## 7. Business model & unit economics

| Stage | Revenue line | Regulatory load | Notes |
| --- | --- | --- | --- |
| 1 | Free benchmark (lead gen) | Low | The hook; builds data |
| 2 | Paid report / SaaS subscription | Low | Recurring, predictable |
| 3 | Success fee on negotiator (% of first-year savings) | Low–moderate | Core margin; needs baseline/attribution |
| 4 | Referral marketplace (independent consultants) | Low–moderate | Asset-light scaling |
| 5 | Bank/consultant referral fees | Moderate–high | **Disclose conflicts**; can taint independence |
| 6 | Loan/FX/investment brokerage, payment initiation, account aggregation | High | Triggers licensing — treat as a separate, later entity |

**Design tension:** taking bank referral fees (rung 5) undermines the "independent, on
your side" promise that makes rungs 1–4 work. Keep independence sacred early; if we
ever take bank money, ring-fence and disclose it prominently.

---

## 8. How we attract customers (GTM)

**Beachhead:** Singapore SMEs with recurring cross-border payments (import/export,
logistics, remittance-heavy sectors) — highest, most recurring pain.

- **Content / SEO / calculators.** "How much is your bank's FX margin costing you?"
  free tools are evergreen, shareable, and rank. The calculator *is* the ad.
- **The shareable number.** "You could save SGD 43,000/year" is a screenshot people
  send to their CFO/partner. Build viral loops around the result.
- **Trust borrowing.** Ex-JPM/Citi/SCB founder credibility → thought-leadership,
  webinars, trade-association partnerships (chambers of commerce, SME associations).
- **Accountant / consultant channel.** CAs and treasury consultants already advise
  SMEs on cost — make them a distribution channel (the "Join Us" section in the design).
- **Founding-member scarcity.** Early-adopter cohort (already in the UI) for referrals,
  case studies, and the first tranche of consented benchmark data.
- **Proof, not promises.** Anonymised "real savings" case studies per sector.

**Acquisition principle:** give the benchmark away; charge for *acting on it*.

---

## 9. How we scale

1. **Deepen before widening.** Own SME FX in SG first; density → credible percentiles →
   trust → uploads → deeper density (the flywheel).
2. **Product adjacency.** From FX → cross-border fees → overdraft/working capital →
   deposits → mortgages/personal (individuals) → cards/insurance.
3. **Geographic adjacency.** SG → Malaysia → India (each with its own corridors, rates,
   and — critically — its own privacy/AA regime; see §11). Reuse the engine, localise
   the repository and consent.
4. **Data moat.** Consented transactional data + negotiator outcomes = a realised-pricing
   dataset nobody else has. This is the defensible asset; the UI is not.
5. **Marketplace, not headcount.** Push advisory to an independent consultant network so
   growth isn't gated on hiring negotiators, and regulatory exposure stays with
   appropriately-licensed third parties.

---

## 10. Defensibility (moat)

- **Realised-rate dataset** (hard to copy, compounds with use).
- **Two-sided trust** (SMEs + independent consultants).
- **Success-fee alignment** (hard for a bank-funded incumbent to match credibly).
- **Regulatory posture** as a neutral tech/analytics layer (lets us operate cross-border
  faster than a licensed intermediary).

Weak moats to *not* rely on: the UI, the calculator maths, published-rate data — all
easily replicated.

---

## 11. Regulatory & data governance (guardrails)

A consented-upload benchmarking platform that publishes **only aggregated, anonymised**
insights can generally operate **without a banking licence**, provided we do **not**:
take deposits, give regulated financial/investment advice, act as a payment institution,
or initiate payments. The obligations are about **privacy, data governance,
cybersecurity, and transparent consent** — not banking regulation.

### By jurisdiction
- **Singapore** — No MAS approval merely to *compare*, as long as we stay out of the four
  activities above. Must comply with **PDPA**; follow **MAS TRM Guidelines** (best
  practice) and cybersecurity hygiene. Explicit consent must state what we collect, why,
  retention, anonymisation, whether it improves benchmarks, and any sharing.
- **India** — Manual uploads: no banking licence, but comply with **DPDP Act 2023**.
  **Do not scrape** bank data; any direct account access must go through the regulated
  **Account Aggregator** ecosystem with consent.
- **Malaysia** — No licence merely to benchmark; comply with **PDPA 2010** and relevant
  **Bank Negara Malaysia** expectations.

### Activities that *raise* the regulatory bar (later, separate entity)
Connecting to bank APIs, initiating payments, recommending products, arranging/brokering
loans or deposits, opening accounts, or investment advice → may trigger licensing in SG/
India/Malaysia. Keep these out of the core platform.

### Data model (privacy-by-design)
- **Segregate two data classes.** *Identifying* (company/UEN/GST, account numbers,
  directors, addresses, beneficiary names, references) → strip/mask before storage or
  delete after processing, encrypted & separated if retained. *Benchmarking* (balances,
  transaction counts, FX volumes, average payment values, fees, utilisation) → retain in
  **anonymised** form for benchmarking, under a covering consent.
- **Publish aggregates only.** "Median SME transfer fee", "average FX spread" — never
  "ABC Pte Ltd pays SGD 2,430/month".
- **Data minimisation** — collect only fields needed to benchmark (no beneficiary names,
  invoice descriptions, references).
- **Encryption** in transit (TLS) and at rest (AES-256 or equivalent).
- **Access controls** — few staff can view raw statements; **audit trail** of uploads,
  consent given, processing, deletions.
- **Retention policy** — e.g. raw statements ≤90 days post-processing unless the user
  opts into ongoing benchmarking; anonymised metrics kept longer for trends.
- **Right to delete** — users can request deletion of uploads + identifiable data.
- **Third parties** — contractual safeguards; don't send identifiable banking data to
  cloud/AI providers without user consent and adequate provider compliance.

### Positioning to keep regulatory load low
Position as a **technology platform + marketplace**, not a consulting/advisory firm:
- **Layer 1 — Benchmarking platform:** software analyses consented data, produces reports,
  identifies savings.
- **Layer 2 — Marketplace:** introduces users to *independent* consultants who contract
  directly with the customer and carry their own compliance.
- **Layer 3 — Optional implementation:** consultants execute; banks deal directly with the
  customer.

Add disclaimers that results are **informational, not personalised financial advice**;
be transparent about how benchmarks are produced; **disclose any bank/consultant
referral fees**; avoid guaranteeing savings/outcomes.

### Governance before launch (checklist)
- Privacy Impact Assessment per country.
- Terms of Use, Privacy Policy, Data Processing Agreement.
- Consent management with **versioning + audit logs**.
- Independent **legal review in each jurisdiction**, especially before bank-API
  integration, success/referral fees, or expansion into loan/investment referral.

---

## 12. Metrics that matter

- **Activation:** % of visitors who compute a benchmark; % who see a positive saving.
- **Data flywheel:** consented statements/week; benchmark density per (product × corridor).
- **Trust:** upload rate; reveal-CTA click-through; NPS.
- **Conversion:** free → paid report; report → negotiator; negotiator **win rate**.
- **Unit economics:** realised savings per engagement; fee take; CAC vs LTV; consultant
  marketplace take rate.
- **Integrity:** savings-attribution dispute rate (must stay low).

---

## 13. Roadmap

| Phase | Goal | Key work |
| --- | --- | --- |
| **P0 — Prototype (this repo)** | Prove the flow & narrative | Benchmark engine, paste-parse, masked reveal, tiers, tests ✅ |
| **P1 — MVP** | One authoritative cell | Seed SME SGD→INR/PHP FX with panel data; real report; consent + audit log; PDF/CSV upload; lead capture backend |
| **P2 — Negotiator** | Monetise + collect realised rates | Baseline capture, attribution contract, playbooks, first concierge cohort |
| **P3 — Marketplace** | Scale advisory asset-light | Independent consultant network; referral disclosures |
| **P4 — Expand** | New products & geographies | Malaysia/India localisation; AA integration (India); percentile benchmarks |

---

## 14. Key risks & mitigations (summary)

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Can't get *actual* (vs card) rates | Critical | Realised data via negotiator + panel; show ranges; label indicative |
| Cold-start data thinness | High | Seed one cell with expert panel; deepen before widening |
| Upload/trust barrier | High | Typed-first, no-storage, aggregates-only, PII stripping |
| Savings attribution disputes | High | Signed baseline; contractual definition; fee on documented delta |
| Regulatory creep (advice/broker/payments) | High | Stay tech+marketplace; independent consultants; per-market legal review |
| Independence vs bank referral fees | Medium | Keep independence early; ring-fence & disclose if ever taken |
| Incumbent response | Medium | Own SME FX wedge; race to the data moat |
| Negotiator doesn't scale | Medium | Productise playbooks; humans only on high-value tickets |

---

### TL;DR
The wedge is real because banking cost is opaque and the overpayment is large and
recurring. The business lives or dies on **getting realised (not advertised) pricing
data** and **earning enough trust to be given statements** — both solved by the same
move: a **success-fee negotiator that doubles as the data-collection flywheel**, wrapped
in **privacy-by-design** and a **tech+marketplace** posture that keeps us clear of a
banking licence. Give the benchmark away; charge for acting on it; guard independence and
data like the assets they are.
