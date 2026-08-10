# Automated market-reference rates (SG · MY · TH · IN · ID)

## What can and can't be automated
Individual banks **do not expose their pricing via API** — their developer
platforms are consent-based account/payment APIs, not public board/promo-rate
feeds. So per-bank rates in `product_rates` stay curated **except where the
central bank publishes them per bank**: **Malaysia** (BNM base/lending rates) and
**Thailand** (BOT per-bank loan & deposit rates — see the per-bank pool below).

What *is* automatable is **central-bank data**, and it varies by country:

| Country | Source | Automated | What you get |
|---------|--------|-----------|--------------|
| 🇸🇬 Singapore | **MAS** | ✅ (no key) | Aggregate Domestic Interest Rates (FD, prime lending, savings). Occasional maintenance. |
| 🇲🇾 Malaysia | **BNM** | ✅ (no key) | **Per-bank** base rate / BLR / indicative effective lending rate + OPR. |
| 🇹🇭 Thailand | **BOT** | ✅ (needs key) | Per-bank loan rates — **MOR→overdraft, MLR→housing, MRR→personal** — + 12M deposit → FD, and policy rate. Gateway `gateway.api.bot.or.th`; register an app at `portal.api.bot.or.th` and subscribe it to **Interest Rates**. |
| 🇮🇳 India | RBI | ❌ | No official public rate API — directory only (scrape/license for rates). |
| 🇮🇩 Indonesia | BI / OJK | ❌ | No official public rate API — directory only. |
| — FX mid-market | ECB (Frankfurter) | ✅ | Cross-border product, [server/fx.js](server/fx.js). No key. |

Aggregate figures anchor the benchmark's "📊 market reference" line per product.
They're market averages (except Malaysia, which is genuinely per-bank), not a
substitute for the curated per-bank pool.

## The pipeline
`scripts/market-rates.mjs` iterates a source registry and upserts the aggregate
**reference line** into `public.market_rates`.

```bash
npm run market:verify        # probe every source, print live status + samples (no DB)
npm run market:verify MY     # just one country (SG / MY / TH)
npm run market:fetch         # pull latest + upsert market_rates (needs SUPABASE creds)
npm run market:fetch MY      # just one country
```

### Real per-bank pools (`product_rates`, not just the reference line)
Two markets publish per-bank rates we write **straight into the benchmark pool**,
so the compared-against set is real data, not synthetic:

- **🇹🇭 Thailand — `scripts/bot-pool.mjs`** (`npm run pool:th`). Each bank's BOT
  loan & deposit rates → MLR→`housing_loan`, MRR→`personal_loan`, MOR→`overdraft`,
  12M fixed→`fixed_deposit`, savings→`current_account` (credit-interest proxy).
  Domestic commercial banks only (~18). Needs `BOT_API_KEY`. **5 of 9 products.**
- **🇲🇾 Malaysia — `scripts/bnm-pool.mjs`** (`npm run pool:my`). Each bank's BNM
  indicative effective lending rate → `housing_loan` (~34 banks). Keyless. (BR/BLR
  are reference floors, not products, so they're not mapped; MY personal/OD/FD have
  no per-bank source and stay synthetic.)

```bash
npm run pool:th:dry   # preview TH per-bank rows (needs BOT_API_KEY)
npm run pool:my:dry   # preview MY per-bank rows (no key)
npm run pool:th       # replace TH/THB pool  (needs SUPABASE creds)
npm run pool:my       # replace MY/MYR housing_loan pool (needs SUPABASE creds)
```

Both replace **only** their country's rows for the mapped products, drop 0/blank
rates, and write nothing if the source is unavailable (never empty the pool). Run
them **after** any `seed:rates` (the seeder rewrites `product_rates` with synthetic
data; these restore the real pools on top). The daily Action runs both in order,
so it self-heals.

### Manual per-bank import — India & Indonesia (no clean API)
India (RBI) and Indonesia (OJK) publish per-bank rates **monthly but not machine-
accessibly** — RBI gives only an aggregate median MCLR; OJK's open portal is
national-aggregate, and per-bank SBDK sits behind a WAF/timeout or on 100+ bank
sites (both investigated Aug 2026 — no clean per-bank feed exists). So their real
per-bank data goes in via a CSV you assemble each month and load with
[import-pool.mjs](scripts/import-pool.mjs):

```bash
npm run import:pool:dry -- scripts/import-pool.sample.csv   # validate + preview
npm run import:pool     -- path/to/rates.csv                # write (needs SUPABASE creds)
```

CSV: `country,product,bank,rate` (+ optional `currency,rate_type,variant`). It
writes real (`is_indicative=false`) rows and replaces each `(country,currency,
product)` group it contains — so re-importing an updated file is idempotent. See
[import-pool.sample.csv](scripts/import-pool.sample.csv) for the format. This is the
robust path where no API exists; nothing to break.

### First run
1. Run [`supabase/market_rates.sql`](supabase/market_rates.sql) (after `admin.sql`).
2. `npm run market:verify` — confirms which sources are up and prints their real
   columns. For **SG**, if a mapped column shows missing, fix `MAS_MAP` in the
   script (MAS was under maintenance at time of writing, so its column names are
   best-effort until verify confirms them).
3. `export SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…` then `npm run market:fetch`.

Every source degrades gracefully: MAS maintenance, an unset BOT key, or a network
blip just skips that country and leaves the DB untouched — the run still succeeds.

### Config (env)
- SG: `MAS_API_BASE`, `MAS_DIR_RESOURCE`, `MAS_DATE_FIELD`.
- TH: `BOT_API_KEY` (required to enable BOT — your subscribed app's **Client ID**;
  sent in the `Authorization` header, no secret needed). `BOT_API_BASE` defaults to
  `https://gateway.api.bot.or.th`. The app must be subscribed to the **Interest Rates**
  product (Loan + Deposit + Policy Rate endpoints).
- MY: none — BNM needs no key.

### Keeping it fresh (GitHub Action)
[`.github/workflows/market-rates.yml`](.github/workflows/market-rates.yml) runs
`npm run market:fetch` **daily at 02:00 UTC** (and on-demand). Add repo secrets
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; add `BOT_API_KEY` as a secret to
enable Thailand. Central banks update these series monthly, so daily is ample.

## Provider directories (the bank lists)
The per-country provider lists live in `scripts/seed-rates.mjs` (`BANKS`) and are
written to the `banks` table by `npm run seed:rates`. They power the calculator's
country-aware provider picker (grouped by category):

- 🇮🇳 India — top public-sector, private, and fintech providers.
- 🇮🇩 Indonesia — top banks + digital / neobanks.
- 🇲🇾 Malaysia / 🇹🇭 Thailand — commercial banks + digital / virtual banks.

**Fintechs/wallets are directory-only** — pickable as "your provider" but not put
in the benchmark pool (they don't publish a comparable lending/deposit set).

## How it surfaces
- `market_rates` (public read, admin write) holds `{ country, product, metric,
  value, unit, source, as_of }`.
- [server/ratesRepo.js](server/ratesRepo.js) `getMarketReference()` reads it
  (cached, never throws); `/api/benchmark` attaches `marketReference` when present.
- The calculator renders the "📊 market reference" line, and its provider picker
  is now country-aware.
