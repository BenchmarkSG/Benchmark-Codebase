# BankBenchmark.sg — Product Model (v2, go-live)

The single source of truth for what we compare and the parameters each product
needs. The catalog + input schemas live in [`server/benchmark.js`](server/benchmark.js)
and are served to the client via `GET /api/reference`, so the calculator renders
its form from the schema (no hard-coded fields).

## Concepts
- **Two product families**
  - `rate` — benchmark one stored rate against a market pool (best / typical) and
    compute a saving.
  - `crossborder` — derive the true **all-in FX cost %** from what the customer
    sent vs. received, priced against the **live mid-market rate** (ECB via
    Frankfurter, see [`server/fx.js`](server/fx.js)).
- **Field roles:** `metric` (the benchmarked number) · `context` (drives the
  maths / sizing) · `meta` (descriptive only).
- **rateType:** `apr` = cost, lower is better · `yield` = return, higher is better.
- **Questionnaires** (`treasury_efficiency`, `operational_efficiency`) are **not**
  benchmarks — they produce a 0–100 maturity score + a "talk to an expert" hand-off.

## Products

| id | Segment(s) | Family | Metric (unit) | Dir | Saving basis | Variants |
|----|-----------|--------|---------------|-----|--------------|----------|
| `housing_loan` | individual | rate | ROI (% p.a.) | ↓ | Outstanding amount | — |
| `personal_loan` | individual | rate | ROI (% p.a.) | ↓ | Outstanding amount | — |
| `vehicle_loan` | individual | rate | ROI (% p.a.) | ↓ | Outstanding amount | — |
| `fixed_deposit` | individual + sme | rate | Yield (% p.a.) | ↑ | Deposit amount | — |
| `cross_border` | individual + sme | crossborder | All-in cost (%) | ↓ | Annual volume | — |
| `current_account` | sme | rate | Credit interest/rebate (% p.a.) | ↑ | Avg daily balance | — |
| `overdraft` | sme | rate | ROI (% p.a.) | ↓ | Avg utilised balance | — |
| `short_term_finance` | sme | rate | ROI (% p.a.) | ↓ | Facility amount | import / export / supplier / bill_discounting |
| `unfunded_facility` | sme | rate | Commission (% p.a.) | ↓ | Facility amount | lc / bg / sblc |

Each product's `inputs` array defines the exact fields, types (`bank`,
`currency`, `amount`, `rate`, `tenor`, `enum`, `duration`), labels and options.

**Not every product exists in every market.** `onlyCountries` confines one to the
markets where the underlying product is real:

| Product | Offered in | Why |
|---|---|---|
| `current_account` | 🇸🇬 only | Benchmarks SME **credit interest**. Indian banks may not pay it by law; Thai current accounts are cheque accounts that pay none (BOT publishes no current-account rate at all). Confirm a market's central bank permits credit interest before adding it here. |
| `current_account_fees` | 🇮🇳 only | The Indian equivalent — with interest off the table, what an SME negotiates is the charges. Benchmarked as an annual sum, not a rate. |

Everything else is offered in all five markets. Rows for a pair that isn't
offered are invisible (the app never queries them) but wrong, and they go live
the moment someone widens the list — so `import-pool.mjs` rejects them on load
and `npm run prune:pool -- --dry` finds any already in the table.

## Cross-border cost
`costPct = (1 − received ÷ (sent × midRate)) × 100` — positive = lost to
spread + fees, negative = beat mid. `POST /api/benchmark` for a `crossborder`
product returns `yourCostPct`, the masked best market cost, `annualSaving` (× annual
volume) and `settlementHours`.

## Database mapping
- **`product_rates`** — the unified pool for **every** rate product. Columns:
  `country_code, product, bank, currency, rate, rate_type, variant`. `variant` is
  null except for funded/unfunded facility types.
- **`remittance_charges`** — cross-border cost + `settlement_time_hours`.
- **`treasury_profiles`** — questionnaire submissions (`answers` jsonb, `score`,
  `band`, contact fields). Public insert, admin read.
- Migrations: [`product_model_v2.sql`](supabase/product_model_v2.sql) (adds
  `variant`, `settlement_time_hours`, `treasury_profiles`).

## SQL run order (go-live)
`rates_schema.sql` → `admin.sql` → `product_rates.sql` → `user_profiles.sql`
→ `advisors.sql` → **`product_model_v2.sql`**, then `npm run seed:rates`.

## API surface
- `GET /api/reference` → `{ countries, products (with input schemas), questionnaires }`
- `POST /api/benchmark` → rate: `{ country, product, currency, variant, yourRate, amount }`
  · cross-border: `{ country, product, send_currency, receive_currency, sent_amount, received_amount, amount, time_taken_hours }`
- `POST /api/questionnaire/score` → `{ id, answers }` → `{ score, band, recommendExpert }`

## FX provider
Frankfurter (ECB reference rates) — free, no key, covers SGD/INR/MYR/IDR/THB/USD,
cached 6h. Swap via `FX_BASE_URL`.
