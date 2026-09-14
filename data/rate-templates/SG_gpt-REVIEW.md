# SG_gpt.csv — review verdict: DO NOT IMPORT

Checked 12 Sep 2026 against the banks' own live pages (`node scripts/scrape-pool.mjs SG`).
Not one row was loaded. The reasons below are ordered by how much damage each
would have done.

## 1. The `rate` column holds the ADVERTISED FLAT RATE, not the EIR

This is the serious one. Every Singapore personal loan is marketed as a low
"flat" rate with the true effective rate in brackets beside it. The pool is
built on the EIR (see `DATA_GAPS.md`, SG personal-loan basis). Quoted live from
the pages today:

| Bank | Page says | CSV `rate` | CSV `rate_high` | Loaded in DB |
|---|---|---|---|---|
| DBS | "from 1.48% p.a. (EIR 3.22% p.a.)" | 1.48 | 3.22 | 3.22 |
| UOB | "from 1.00% p.a. (EIR 1.93% p.a.)" | 1.00 | 1.93 | 1.93 |
| Standard Chartered | "From 0.90% p.a. (EIR from 1.75% p.a.)" | 0.90 | 1.75 | 1.75 |
| HSBC | "as low as 1.3% p.a. (EIR 2.5% p.a.)" | 1.30 | 2.50 | 2.50 |
| OCBC | EIR 4.19% p.a. | 1.98 | 4.19 | 4.19 |

The CSV put the headline rate where the comparable rate belongs. Importing it
would have roughly halved every SG personal-loan figure and told users their
bank was uncompetitive against a rate nobody actually pays.

Two rows aren't even the flat rate — they're wrong in both columns:
Trust Bank (CSV 2.22/2.43; live "from 1.00%, EIR from 2.28%") and
GXS (CSV 2.99/5.65; live "from 2.88% (EIR 5.45%)").

## 2. Blocks of identical values — invented, not sourced

- `housing_loan`: eight banks (OCBC, UOB, StanChart, Citi, HSBC, Maybank, BoC,
  CIMB, RHB) all carry exactly 1.50 / 1.50–3.00. One placeholder, replicated.
- `vehicle_loan`: six banks all carry exactly 2.78 "from".

No two Singapore banks publish identical home-loan pricing. 2.78% is also a
*flat* car-loan rate — same trap as §1.

## 3. Fixed deposits: 4 of 9 comparable rows are wrong

| Bank | CSV | Live 12-month |
|---|---|---|
| Citibank | 2.00 | **0.70** (≈3× out) |
| UOB | 1.55 | **1.40** |
| Maybank | 1.55 | **1.45** |
| Bank of China | 1.70 | **1.65** |

Correct: DBS 1.00, OCBC 1.40, CIMB 1.70, RHB 1.65. The file also misses Hong
Leong Finance (1.50) and ICBC (1.45), which are in the pool.

## 4. Wrong product

GXS 1.75 and MariBank 1.20 are filed as `fixed_deposit`. Both are **savings
account** rates — GXS's own page: "GXS Savings Account … Earn up to 1.75% p.a."
Instant-access money in a 12-month FD pool is not a comparison.

## 5. Schema

- `rate_basis` must be `exact` | `range` | `from`. The file uses `fixed`,
  `variable`, `pa`, `base`, `N/A` — only `from` is valid.
- `N/A` is not a skip token (the importer skips blank and `NOT FOUND`), so those
  38 rows would throw rather than be ignored.
- No `source_url` / `quoted_text` / `as_of` columns, which `EXTRACTION_PROMPT.md`
  requires. Without a URL nothing here can be checked except by redoing it.
- `current_account` rows put the base rate in `rate` (0.05) and the bonus-tier
  maximum in `rate_high` (up to 4.10). Two different products in one row.

## What the file IS good for

The bank list. It names SG institutions worth adding once their rates can be
read: Citibank, Maybank, CIMB and SBI for personal loans; Standard Chartered,
HSBC and SBI for deposits. Attempts today:

- **Maybank SG, Citibank SG, CIMB SG** — bot-blocked (HTTP2 error / empty render),
  same wall as Maybank Malaysia.
- **HSBC SG** — publishes four separate 12-month promo tables (1.35 / 1.30 /
  1.00 / 0.95) with a S$30,000 fresh-funds minimum. Which tier applies isn't
  determinable from the page, and S$30k sits outside the pool's retail band.
  Held. (The CSV's 1.05 matches none of the four.)
- **Standard Chartered SG** — the time-deposit page renders no rate table.
