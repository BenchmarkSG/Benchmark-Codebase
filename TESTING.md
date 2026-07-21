# SDLC Testing — BankBenchmark.sg Prototype

This document records the testing performed against the prototype, following a
lightweight but structured SDLC test approach: **unit → integration → functional
(UI) → non-functional → UAT**, plus a defect log and known limitations.

> Scope note: this is a **prototype**. Tests validate the benchmark maths, the API
> contract, the statement parser, and the core user flows. Production hardening
> (auth, persistence, security pen-testing, load testing) is explicitly out of scope
> and tracked in [scope.md](scope.md).

---

## 1. Test strategy & levels

| Level | What | Tooling | Status |
| --- | --- | --- | --- |
| Unit | Pure benchmark maths + statement parser (`benchmark.js`) | `node:test` | ✅ Automated |
| Integration | Express endpoints over real HTTP | `node:test` + ephemeral server | ✅ Automated |
| Functional (UI) | End-user flows in the React app | Manual test cases (below) | ✅ Executed |
| Build/static | Production bundle compiles, no dead imports | `vite build` | ✅ Passing |
| Non-functional | Input validation, error handling, a11y, responsiveness | Manual + code review | ⚠️ Partial (prototype) |
| UAT | Acceptance vs. the stated product vision | Checklist (below) | ✅ Mapped |

**Run everything:**
```bash
npm run install:all
cd server && npm test        # 23 automated tests
cd ../client && npm run build # static/build check
npm run dev                   # manual UI pass at http://localhost:5173
```

---

## 2. Automated tests — results

`node --test` in `server/` → **23 passing, 0 failing**.

### 2.1 Unit — `server/test/unit.test.js`
| # | Test | Verifies |
| --- | --- | --- |
| U1 | `amortisedMonthly` known amortisation | 500k @ 2.45%/20y = **2,637.35/mo** (annuity formula correct) |
| U2 | `amortisedMonthly` zero interest | Falls back to straight division |
| U3 | `amortisedMonthly` zero/invalid tenor | No divide-by-zero (returns 0) |
| U4 | `computeBenchmark` mortgage floating | Positive saving, monthly repayments, `benchmarkMasked=true` |
| U5 | Fixed vs floating variant | Variants resolve to different benchmark rates |
| U6 | Yield product (savings) | `direction='higher'`, no repayment figure |
| U7 | FX margin volume-based | Saving annualised **×12** off the monthly volume |
| U8 | Unknown product | Returns `{ error }` (not a crash) |
| U9 | Negative amount | Clamped to 0 → no negative saving |
| U10 | Tenor out of range | Clamped to [1, 40] |
| U11 | `buildOtherAreas` | Excludes current product, returns 3 |
| U12 | Parser: sample statement | ≥4 fee lines detected, totals reconcile |
| U13 | Parser: percent-only line | No dollar saving (needs a base amount) |
| U14 | Parser: empty text | 0 items + guidance note |
| U15 | Parser: corridor detection | India vs Philippines resolve to different benchmarks |

### 2.2 Integration — `server/test/api.test.js`
| # | Endpoint | Verifies |
| --- | --- | --- |
| I1 | `GET /api/health` | `{ ok: true }` |
| I2 | `GET /api/reference` | Banks, products (with variants), corridors, segments present |
| I3 | `POST /api/benchmark` valid | 200, positive saving, masked benchmark |
| I4 | `POST /api/benchmark` bad product | **400** with error message |
| I5 | `POST /api/parse` valid | Detects line, `save = 25` for a 30→5 transfer fee |
| I6 | `POST /api/parse` missing text | **400** |
| I7 | `POST /api/reveal` valid email | 200 `received` |
| I8 | `POST /api/reveal` invalid email | **400** |

---

## 3. Functional (UI) test cases — manual

Executed against `npm run dev` (Vite proxy → Express :3000). All ✅ pass.

| # | Flow | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| F1 | Hero carousel auto-plays | Load page, wait | Slides change ~5s; arrows/dots work; no bank names shown | ✅ |
| F2 | CTA scrolls to calculator | Click "Start Free Comparison Now" | Smooth-scrolls to inline calculator (no popup) | ✅ |
| F3 | Manual benchmark (loan) | Individual → 20-Year Mortgage → Floating → 500k/20y → Compute | Your vs 🔒 best rate, annual + monthly saving, monthly repayments | ✅ |
| F4 | Segment filters products | Switch to "For SMEs" | Product list changes (overdraft, 3-month loan appear; mortgage hidden) | ✅ |
| F5 | Variant toggle | Mortgage → Fixed vs Floating | Benchmark rate/saving changes | ✅ |
| F6 | FX corridor | Product = FX margin → corridor SGD→India | Amount label becomes "Monthly FX volume"; saving ×12 | ✅ |
| F7 | Bank stays masked | Any compute | Best shown as "🔒 Best benchmark of N providers (hidden)" | ✅ |
| F8 | Paste-statement mode | Tab → "Paste statement" → Load sample → Analyse | Itemised fees, per-line savings, total, all providers masked | ✅ |
| F9 | Detailed Feedback popup | Click "Reveal the Bank & Get Detailed Feedback" | 3-tier modal (Starter/Pro/Concierge), red "Most popular" ribbon | ✅ |
| F10 | Request a Connection | Click on a tier → enter email → Submit | Inline "✓ Request received — we'll reach out to {email}" (no backend) | ✅ |
| F11 | Esc / backdrop closes modal | Press Esc / click backdrop | Modal closes; body scroll restored | ✅ |
| F12 | Partner banks carousel | Scroll to Partners | Dual marquee slides; pauses on hover | ✅ |
| F13 | Responsive | Resize to ~375px | Hero, calculator, grids stack; no horizontal scroll | ✅ |
| F14 | Colour system | Whole page | White + blue + red only; **no green/orange** | ✅ |

---

## 4. Non-functional checks

| Area | Finding |
| --- | --- |
| Input validation | Server clamps amount (≥0) and tenor ([1,40]); rejects unknown product (400) and non-string parse text (400). Email format checked on reveal. |
| Error handling | API failures surface a user-facing message in the calculator; no unhandled promise rejections observed. |
| Payload limits | `express.json({ limit: '256kb' })` guards against oversized statement pastes. |
| Accessibility | Modals use `role="dialog"`/`aria-modal`; carousel controls have `aria-label`; `prefers-reduced-motion` disables the marquee. Not yet audited with a screen reader. |
| Privacy-by-design | No persistence layer; `/api/reveal` explicitly does **not** store data or send mail (prototype). Consent copy shown on both calculator modes. |
| Performance | Client bundle ~57 kB gzip; API responses are synchronous in-memory maths (<1 ms). |

---

## 5. UAT — acceptance vs. product vision

| Vision requirement | Prototype coverage |
| --- | --- |
| Manual input **or** paste/upload of transactional data | ✅ Manual form + paste-and-parse (file upload = future) |
| Repository of bank pricing / rates | ✅ `server/data.js` (mortgage, personal, overdraft, 3M loan, FX corridors, deposits, transfer-fee legs) |
| Cross-border fees at initiation / intermediary / beneficiary | ✅ Parsed as three legs; benchmarked separately |
| FX conversion margin (SGD & USD vs majors) | ✅ 12 corridors incl. INR/PHP/BDT/PKR/CNY + USD pairs |
| Overdraft + 3-month loan rate | ✅ Both products present (SME/Corp segment) |
| Individual benchmarks: 20y mortgage, 5y personal loan, FX remittance corridors | ✅ Present |
| Immediate benchmark against "the best" **without disclosing the bank** | ✅ `benchmarkMasked`; identity hidden until reveal CTA |
| Reveal via CTA; free = % of savings, no-obligation | ✅ CTA → 3-tier modal; success-fee messaging |
| Virtual negotiator for additional % fee | ✅ "Concierge" tier |
| No personal data kept; crowdsource only transactional data | ✅ No persistence; consent copy; masking beneficiary/reference noted |

---

## 6. Defect log

| ID | Severity | Description | Status |
| --- | --- | --- | --- |
| D1 | Low | Unit test U1 initially asserted 2,644 vs true 2,637.35 (test expectation error, not code) | ✅ Fixed |
| D2 | Info | Server port moved 4000→3000; Vite proxy realigned | ✅ Fixed |

No open defects at time of writing.

---

## 7. Known limitations (prototype)

1. **Rates are illustrative**, not live market data — the hardest real-world problem is sourcing *actual* offered rates (banks publish only card/teaser rates). See [scope.md](scope.md) §"Concept of failure".
2. **Statement parser is regex-based** — a demo, not OCR/PDF ingestion or ML entity extraction.
3. **No persistence, auth, or real email** — `/api/reveal` and the tier email capture are stubs by design.
4. **No security testing** — CSRF/rate-limiting/secrets management are out of scope for the prototype.
5. **Benchmarks are single-point**, not distributions — production should show medians/percentiles from crowdsourced data.
