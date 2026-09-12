# Brief for extracting the remaining bank rates

Paste everything below the line into ChatGPT (with browsing on). Save each
CSV block it returns as `data/rate-templates/manual-<CC>.csv`, then:

```
npm run import:pool:dry -- data/rate-templates/manual-IN.csv     # validate
# open 3–4 rows' source_url and confirm quoted_text is really on the page
npm run import:pool     -- data/rate-templates/manual-IN.csv --merge
```

`--merge` matters: without it the file would replace the whole pool and wipe
the scraped banks. Never import a row whose quoted_text you did not see on the
page yourself — a model reading a table has put the wrong column under a real
bank's name before.

---

You are helping me collect **published retail bank interest rates** for a
benchmarking tool. Accuracy matters far more than coverage: a wrong number
under a real bank's name is worse than a blank.

## Rules — read these before anything else

1. **Official bank websites only.** Read each rate from the bank's own domain
   (e.g. hdfcbank.com, bcafinance.co.id, maybank2u.com.my). Do **not** use
   comparison sites, blogs, news articles, PDFs summarised by third parties, or
   your own memory. If you cannot open the bank's page, write `NOT FOUND` in
   the rate column and say why in `notes`. Never fill a number from memory.
2. **Copy, don't compute.** Put the rate in the `rate` column **exactly as the
   bank writes it**, in one of three forms only:
   - a single figure → `6.25`
   - a published range → `8.00-9.50` (low-high, as printed; do not average)
   - a published floor ("from", "starting at", "onwards", "mulai dari") → `from 7.50`
   Do not convert flat rates to effective rates or the reverse. Do not pick a
   "typical" number out of a table — use the row the basis below tells you to.
3. **Show your evidence on every row.** `source_url` is the exact page. `quoted_text`
   is the sentence or table row you read the figure from, copied verbatim
   (include the row label and the number). `as_of` is the date printed on the
   page ("w.e.f. 01.04.2026", "Rates effective 1 Sep 2026") or blank if none.
4. **One row per bank per product**, using the bank names exactly as listed
   below. Include a `NOT FOUND` row for every bank you could not read — do not
   drop banks silently.
5. **Say what kind of rate it is** in `notes`: `flat` or `effective/EIR/reducing`,
   fixed or floating, and the customer/tier it applies to. If the page shows
   both a flat and an effective rate, put the **effective** one in `rate` and
   the flat one in `notes` — except where the basis below says otherwise.
6. If anything is ambiguous (two tables, a promotion with conditions, a rate
   that depends on a credit score), choose per the basis below, and describe
   the ambiguity in `notes`. When in doubt, `NOT FOUND` with a note beats a guess.

## Output format

One CSV code block **per country**, with exactly this header line:

```
country,product,bank,rate,currency,rate_type,rate_basis,rate_low,rate_high,source_url,quoted_text,as_of,notes
```

- `country`: SG | IN | ID | MY | TH.  `currency`: SGD | INR | IDR | MYR | THB.
- `product`: `housing_loan` | `personal_loan` | `vehicle_loan` | `fixed_deposit`.
- `rate_type`: `apr` for loans, `yield` for deposits.
- Leave `rate_basis`, `rate_low`, `rate_high` **blank** — they are derived from
  the `rate` column.
- Wrap `bank`, `source_url`, `quoted_text` and `notes` in double quotes; if a
  quoted field contains a double quote, double it (`""`).
- Percent signs are optional in `rate`; commas as decimals ("11,75") are fine.

## What to collect, and the basis for each

### 🇮🇳 India — currency INR

Banks: "HDFC Bank", "Federal Bank", "Bank of India", "Punjab National Bank",
"Bank of Baroda", "Axis Bank", "ICICI Bank", "Canara Bank", "Indian Bank",
"Central Bank of India", "IndusInd Bank", "Yes Bank", "RBL Bank",
"Bandhan Bank", "Indian Overseas Bank", "UCO Bank", "Standard Chartered", "HSBC",
"DBS Bank India".

- `housing_loan` — the bank's **standard floating home-loan rate for a salaried
  borrower**, loan up to ₹35 lakh. If the bank publishes by credit score, use
  the **full published range** across scores (e.g. `8.00-8.85`); if it
  publishes only a headline, use it (`from 7.50`). Not fixed-rate schemes,
  not special/limited offers unless that is all the bank publishes (say so).
- `personal_loan` — the bank's standard personal loan for salaried customers:
  the **published effective-rate range** if there is one, else the floor.
- `vehicle_loan` — **new car loan** for an individual: published range, else
  floor. Not two-wheeler, not used-car, not electric-vehicle concessions.
- `fixed_deposit` — only for these banks (the rest are already covered): ICICI
  Bank, Bank of India, Federal Bank, Union Bank of India, Canara Bank, Yes Bank,
  RBL Bank, Bandhan Bank, Indian Overseas Bank, UCO Bank. Basis: **1-year
  domestic term deposit, general public (not senior citizen), below ₹3 crore,
  callable**. Use the row that is exactly 1 year (e.g. "1 year to less than 2
  years" or "365 days"), not a special-tenor scheme (e.g. "400 days").

### 🇸🇬 Singapore — currency SGD

Banks: "DBS", "OCBC", "UOB", "Maybank", "Standard Chartered", "HSBC",
"Citibank", "CIMB", "Bank of China", "RHB", "Hong Leong Finance", "HL Bank",
"Trust Bank", "GXS Bank", "MariBank".

- `vehicle_loan` — **new car loan** for an individual. Singapore banks quote a
  flat rate ("2.78% p.a.") and sometimes an EIR beside it. Put the **flat**
  rate in `rate` here (that is the market convention) and the EIR in `notes`;
  write `flat` in `notes` on every row.
- `housing_loan` — the bank's **2-year fixed-rate package** for a completed
  private property (year-1 rate), if the bank publishes a figure. Floating
  packages are quoted as "3M SORA + 0.75%" — do **not** turn those into a
  number; record the formula in `notes` and put `NOT FOUND` in `rate` if no
  fixed figure is published.
- `personal_loan` — only for OCBC, CIMB, Citibank, MariBank, Maybank (the
  others are done): the lender's **lowest advertised EIR** in `rate`, the flat
  rate in `notes`.

### 🇮🇩 Indonesia — currency IDR

Banks: "Bank Mandiri", "Bank Central Asia", "Bank Rakyat Indonesia",
"Bank Negara Indonesia", "Bank Tabungan Negara", "CIMB Niaga", "Bank Danamon",
"Panin Bank", "OCBC NISP", "Permata Bank", "Maybank Indonesia".

- `vehicle_loan` — **new car financing (KKB / kredit mobil baru)** for an
  individual, the bank's or its finance arm's published rate. These are flat
  rates that vary by tenor: use the **1-year tenor** if a table is shown, else
  the headline floor; write `flat` and the tenor in `notes`.
- `fixed_deposit` — **12-month rupiah time deposit (deposito), standard
  counter rate**, for a placement of Rp 100 million or less. Not a promotional
  or digital-only rate unless it is the only one published (say so).
- `housing_loan` and `personal_loan` — only for Bank Rakyat Indonesia, Bank
  Negara Indonesia, Bank Tabungan Negara, Permata Bank, Panin Bank: from each
  bank's **Suku Bunga Dasar Kredit (SBDK)** table, the **KPR** column for
  housing and the **Non-KPR** column for personal. These tables have seven
  columns in a fixed order — Korporasi, Ritel, Menengah, Kecil, Mikro, KPR,
  Non-KPR — copy the whole row into `quoted_text` so the column can be checked.

### 🇲🇾 Malaysia — currency MYR

Banks: "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong Bank", "AmBank",
"Bank Islam", "Affin Bank", "Alliance Bank", "Bank Rakyat", "OCBC", "UOB",
"Standard Chartered", "HSBC", "Bank of China".

- `fixed_deposit` — **12-month MYR fixed deposit board rate** (the standard
  published rate, not a campaign) in `rate`. If the bank also publishes a
  promotional 12-month rate on its own site, put it in `notes` with its
  minimum placement and end date.
- `personal_loan` — the bank's standard personal financing for an individual:
  published range or floor. Malaysian banks quote flat rates ("from 4.88%
  p.a.") — put the flat rate in `rate`, write `flat` in `notes`, and add the
  effective rate if the page shows one.
- `vehicle_loan` — **new car hire purchase**, published range or floor, flat;
  write `flat` in `notes`.

### 🇹🇭 Thailand — currency THB

Banks: "Bangkok Bank", "Kasikornbank", "Siam Commercial Bank", "Krungthai Bank",
"Bank of Ayudhya", "TMBThanachart", "Kiatnakin Phatra", "CIMB Thai",
"Government Savings Bank", "UOB Thailand".

- `vehicle_loan` — **new car hire purchase** for an individual, the bank's or
  its auto-finance arm's published flat rate (range or floor); write `flat`
  and the tenor in `notes`.

## Before you send

- Every row has a `source_url` on the bank's own domain and a verbatim
  `quoted_text`.
- No `rate` cell contains anything but `6.25`, `8.00-9.50`, `from 7.50` or
  `NOT FOUND`.
- Every bank listed appears exactly once per product requested.
- Anything you were unsure about is explained in `notes`, not resolved by
  guessing.
