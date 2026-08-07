# Product Rate Data (Supabase-backed)

The benchmark data lives entirely in a **cloud Postgres database on Supabase** —
`server/data.js` has been removed. The homepage calculator and all `/api`
endpoints fetch from Supabase at runtime, so **admin-portal edits immediately
change what visitors see**. The data model covers the five product questions in
the brief, for **Singapore, India, Malaysia, Indonesia and Thailand**.

## Homepage calculator flow

`GET /api/reference` → `{ countries, products }` (product metadata lives in
`server/benchmark.js`). `POST /api/benchmark { country, product, currency,
yourRate, amount }` fetches the matching rows from Supabase (via `ratesRepo`),
computes best / median / market-typical (bank identities masked), and returns the
saving. Products map to tables:

| Calculator product | Source |
|---|---|
| Overdraft (local + USD) | `overdraft_rates` (mid of min/max) |
| Short-term loan (local ccy) | `loan_products` short_term_local · interest_rate |
| Short-term loan (USD) | `loan_products` short_term_usd · interest_rate |
| Import LC (issuance fee) | `loan_products` import_lc · arrangement_fee (×4 → annual) |
| Export LC discounting | `loan_products` export_lc_discount · interest_rate |
| Cross-border FX spread | `remittance_charges` outward · fx_spread_pct |

If Supabase isn't configured, `/api/benchmark` returns a clear **503** (there is
no local fallback any more).

> ⚠️ **The seeded figures are INDICATIVE / SYNTHETIC** — deterministic sample data
> used to build and demo the product. Every row is flagged `is_indicative = true`.
> Replace with sourced/licensed market data before presenting them as real
> published rates. This preserves the data-governance stance in `scope.md`.

## What maps to what

| Brief question | Table | Notes |
|---|---|---|
| Q1 Overdraft rates (SGD/USD, top banks) | `overdraft_rates` | local ccy + USD, rate_min/max |
| Q2 Cross-border remittance charges (out to US / in from UK, 1M) | `remittance_charges` | upfront, intermediary, lifting fees + FX spread |
| Q3 Short-term loans (local + USD), Import LC, Export LC discounting | `loan_products` | `product_type` distinguishes them; interest + fees |
| Q4 Negotiation thresholds (save 25k/yr/product), switch cost/effort | `negotiation_thresholds` | threshold amount, switching cost, weeks, worthwhile |
| Q5 Same for IN / MY / ID / TH (INR/MYR/IDR/THB) | all tables | keyed by `countries.code` + `banks.country_code` |

Reference tables: `countries` (SG/IN/MY/ID/TH + currency) and `banks` (top-15 per
country, incl. Japanese / Indian / European banks for Q3).

## One-time setup

1. **Create the tables** — Supabase → SQL Editor → run these in order:
   [`rates_schema.sql`](supabase/rates_schema.sql) → [`admin.sql`](supabase/admin.sql)
   → [`product_rates.sql`](supabase/product_rates.sql) →
   [`user_profiles.sql`](supabase/user_profiles.sql) →
   [`advisors.sql`](supabase/advisors.sql) →
   [`product_model_v2.sql`](supabase/product_model_v2.sql). (RLS: public read,
   service-role/admin write.) See [PRODUCT_MODEL.md](PRODUCT_MODEL.md) for the model.
2. **Seed the data** — set env and run the generator:
   ```bash
   export SUPABASE_URL="https://<ref>.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="<service_role secret>"   # Settings → API
   npm run seed:rates
   ```
   Preview without a DB first with `npm run seed:rates:dry` (prints row counts +
   samples). A full run writes ~1,350 `product_rates` rows + 150 remittance rows.
3. **Point the API at Supabase** — set the server env (see `server/.env.example`):
   ```
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_ANON_KEY=<anon public key>
   ```
   Restart the server. `GET /api/health` reports `"ratesSource":"supabase"` once
   connected (otherwise `"local"`).

## API endpoints (the system fetching it itself)

All read from Supabase (cached 5 min), with `?country=` defaulting to `SG`:

- `GET /api/countries`
- `GET /api/banks?country=SG`
- `GET /api/rates/overdraft?country=SG&currency=SGD`
- `GET /api/rates/remittance?country=SG&direction=outward`
- `GET /api/rates/loans?country=SG&type=import_lc`
- `GET /api/rates/thresholds?country=SG`
- `GET /api/rates/benchmark?country=SG&product=overdraft&currency=SGD`
  → masked best / median / market-typical (bank identities hidden until a
  connection request, per the product's reveal-on-CTA model).

`product` / `type` values: `overdraft`, `short_term_local`, `short_term_usd`,
`import_lc`, `export_lc_discount`.

## How the numbers are generated

`scripts/seed-rates.mjs` derives every figure deterministically from country base
rates + a per-bank category tilt (local banks priced slightly higher; foreign /
Japanese / European slightly keener) + a stable hash-based jitter. Because it's
deterministic, re-running reproduces the same dataset. Q4 thresholds are computed
from an assumed achievable improvement per product (e.g. overdraft ≈ 1.5%), so
`threshold_amount = target_saving / improvement`.

## Replacing with real data later

Keep the schema; change only the source. Either (a) point `scripts/seed-rates.mjs`
at your sourced dataset and re-run, or (b) upsert from your data pipeline. Set
`is_indicative = false` on rows you've verified. No API or frontend changes needed.
