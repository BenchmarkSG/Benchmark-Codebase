# Rate data automation — status by country

**As of 12 September 2026.** Read alongside [DATA_GAPS.md](DATA_GAPS.md) for the technical
detail and [AUTOMATION_COVERAGE.md](AUTOMATION_COVERAGE.md) for the flat per-product list.

This answers one question: **for each market, where do our benchmark rates come
from, and does that happen by itself?**

---

## At a glance

| Country | Products live | How the data arrives | Refreshes by itself? |
|---------|:-------------:|----------------------|----------------------|
| 🇹🇭 **Thailand** | **4 of 8** | Central bank API | ✅ Daily, 02:00 UTC |
| 🇮🇩 **Indonesia** | 2 of 8 | Scraped from banks' published SBDK tables | ✅ Daily, 02:00 UTC |
| 🇸🇬 **Singapore** | 2 of 9 | Scraped — bank pages + a verified comparison page | ✅ Daily, 02:00 UTC |
| 🇮🇳 **India** | **4 of 9** | Scraped from banks' published rate sheets and loan pages | ✅ Daily, 02:00 UTC |
| 🇲🇾 **Malaysia** | 2 of 8 | Central bank API + scraped bank deposit pages | ✅ Daily, 02:00 UTC |

**Every pool that is live now refreshes on its own.** Two days ago, India and
Singapore had scrapers nobody ran; they are now on the same nightly job as
Thailand and Malaysia. "Products live" counts pools serving **real, sourced
rates** — everything else returns *"No benchmark data for this selection yet."*
rather than a number.

**14 of 42 country×product pools are live, up from 6 four days ago.** Real
rows: 164. India housing, personal and vehicle loans and Singapore personal
loans carry ranges and floors; see "Loans published as ranges and floors" below.

The denominator is 42, not 5×10: `current_account` is offered only in 🇸🇬 and
`current_account_fees` only in 🇮🇳, so eight of the fifty grid cells are products
those markets don't have.

---

## What changed since 9 September

| | Before | Now |
|---|---|---|
| 🇹🇭 Thailand current account | 16 rows, unseen | **Removed** — they were BOT's *individual savings* rate standing in for SME credit interest. Thai current accounts pay none, and BOT publishes no such rate. See below. |
| 🇸🇬 Singapore fixed deposit | 2 banks | **10 banks** — DBS, OCBC, UOB, Maybank, CIMB, RHB, Bank of China, ICBC, Citibank, Hong Leong Finance |
| 🇮🇳 India fixed deposit | 4 banks | **10 banks** — adds Axis, Kotak, IndusInd, Bank of Baroda, Central Bank, Indian Bank |
| 🇮🇳 India housing / personal / vehicle loans | nothing | **9 / 9 / 6 banks**, read from the banks' own pages as ranges and floors |
| 🇸🇬 Singapore personal loan | nothing | **7 lenders** — lowest advertised effective rate |
| 🇮🇩 Indonesia | nothing | **Home loan + personal loan, 5 banks each** — BCA, Mandiri, CIMB Niaga, OCBC, Danamon |
| 🇲🇾 Malaysia fixed deposit | nothing | **5 banks** — Hong Leong 3.70, AmBank 3.70, Alliance 2.45, Bank Rakyat 2.30, RHB 1.80 |
| Nightly refresh | Thailand, Malaysia only | All five countries |
| Malaysia personal-loan reference | Showed the *housing* rate (3.36%) | Fixed — code and the wrong row removed |

The unlock was rendering pages in a headless browser: most banks now draw their
rate tables in JavaScript, which the earlier fetcher couldn't see. Kotak, Indian
Bank, Bank of Baroda, Bank Mandiri, CIMB Niaga and OCBC Indonesia all became
readable that way.

---

## Loans published as ranges and floors — live since 11 Sep

Home, personal and vehicle loans in Singapore and India are not published as a
single number. A bank prints either a **range** ("8.00% – 9.40%", by credit
score or loan size) or a **floor** ("from 7.50%", "7.60% p.a. onwards"). Until
today the app had no way to hold either, so those products stayed empty.

**The rule now in place:** a range is shown as its **midpoint with a "~"**
("~8.70%"); a floor is kept as published and shown as **"from"** ("from
7.50%"). Nothing is invented — each figure is exactly what the lender printed,
and a range keeps both ends on record. The calculator marks the best rate that
way, puts "~" on the market-typical figure whenever the pool contains a midpoint
or a floor, and prints one line saying what the mark means.

| Pool | Banks (as published) | Best |
|---|---|---|
| 🇮🇳 India housing loan | SBI from 7.25 · ICICI ~8.95 (8.50–9.40) · Axis ~8.43 (8.00–8.85) · Kotak from 7.60 · Bank of Baroda from 7.20 · Union Bank from 7.15 · Central Bank ~7.98 (7.20–8.75) · HDFC ~10.48 (7.75–13.20) · Canara ~8.65 (7.30–10.00) | Union Bank, from 7.15% |
| 🇮🇳 India personal loan | SBI ~12.50 (10.00–15.00) · ICICI ~13.24 (9.99–16.50) · Kotak from 10.99 · HSBC ~10.10 (9.70–10.50) · IDFC First from 9.99 · Union Bank from 8.75 · Central Bank ~11.50 · HDFC from 9.99 · Canara ~12.20 (9.70–14.70) | Union Bank, from 8.75% |
| 🇮🇳 India vehicle loan | SBI ~9.28 (8.70–9.85) · IDFC First from 8.99 · Union Bank from 7.50 · Central Bank ~8.48 (7.65–9.30) · HDFC from 8.15 · Canara ~9.33 (7.95–10.70) | Union Bank, from 7.50% |
| 🇸🇬 Singapore personal loan | DBS from 3.22 · UOB from 1.93 · Standard Chartered from 1.75 · HSBC from 2.50 · Trust from 2.28 · GXS from 5.45 · OCBC from 4.19 (lowest advertised *effective* rate — every bank prints a flat rate beside it, and the flat figure is not comparable) | Standard Chartered, from 1.75% |

Every one of these is read from the **bank's own page**, nightly, by the same
scraper. The Indian comparison sites were checked and rejected — one car-loan
table is dated 2019, and both disagree with the banks on several rows.

The second pass on 11 September used Claude and ChatGPT to *find* pages, not
to supply numbers: every figure they returned was checked against the live
page before loading. That check mattered — the Central Bank of India rows
cited the bank's test server and were off by 10–35 basis points from the
production page. HDFC, Central Bank, Canara and OCBC came in that way; the
rows that could not be checked (BNI, BTN, Permata, Maybank) are held in a
file with instructions, not loaded.

These went live on the evening of 11 September: the database gained three
columns recording how each rate was published (`supabase/rate_basis.sql`, run
by Dhruvansh), the two scraped files were imported by hand, and from tonight
the nightly job refreshes them with everything else.

> ⚠️ **Be straight about what "best" means now.** A bank that publishes a wide
> range is represented by its midpoint; a bank that publishes only its floor
> keeps the floor — so the floor always looks cheaper side by side. ICICI's
> "8.50% – 9.40%" reads ~8.95% next to Union Bank's "from 7.15%", although
> ICICI's best-profile borrowers pay 8.50%. The "~" and "from" marks exist so
> a reader can see this. It is honest, but "best of N" is now "best published
> floor or midpoint of N".

---

## How each country works

### 🇹🇭 Thailand — central bank API

Bank of Thailand publishes every domestic bank's loan and deposit rates.
Housing loan, personal loan, overdraft, fixed deposit — 15–17 banks each.
Foreign branches are excluded deliberately. Current account is **not** one of
them: BOT publishes no current-account rate, because Thai current accounts don't
pay interest (see below).

*Open question:* the housing pool uses **MLR**; Thai retail mortgages usually
price off **MRR**. Worth confirming before launch.

### 🇲🇾 Malaysia — central bank API for home loans, scraped pages for deposits

Bank Negara publishes each bank's indicative effective lending rate — 34 banks,
our deepest pool. Nothing else Malaysian is published through an API.

**Fixed deposits** (from 12 September): basis is **the best rate available to
the customer** — the promotional or e-FD rate where the bank publishes one,
the board rate otherwise, for an individual placing RM1,000–10,000. Five banks
read cleanly from their own pages: Hong Leong (eFD campaign 3.70%), AmBank
(eFD promotion 3.70%), Alliance (counter 2.45%), Bank Rakyat (2.30%), RHB
(board 1.80%). Standard Chartered's 3.75% is excluded — it needs Priority
Banking and RM60,000. CIMB is held: its eFD campaign advertises "up to 3.75%"
but publishes the 12-month figure only as an image, so loading its 1.90% board
rate would misstate it. Maybank, Public Bank, OCBC, UOB and HSBC cannot be
read by a machine. Campaign rates are time-boxed; when one ends the scraper
notices and the bank's last good row stays until it is re-read.

*Fixed this week:* the personal-loan comparison line was borrowing the
housing-loan figure and telling a customer on a 7% personal loan that the market
typical was 3.36%. Removed.

### 🇮🇩 Indonesia — scraped SBDK tables

Indonesian regulation (POJK 13/2024) obliges every bank to publish a *Suku Bunga
Dasar Kredit* table in a fixed seven-column format. Five banks' tables are
readable; we take the **KPR** (housing) and **Non-KPR** (consumer) columns.

> ⚠️ **One caveat the product must carry.** SBDK is a *base* lending rate — it
> excludes the borrower's individual risk premium, so it sits below what a
> customer actually pays. A saving computed against it will be overstated. It is
> loaded because it is the only comparable per-bank figure Indonesia publishes,
> and the Thai housing pool rests on a reference rate of the same kind; both
> should say so on screen.

Not reachable: BNI (times out), BRI and BTN (PDF only), Permata and Panin (block
automated access).

### 🇸🇬 Singapore — scraped, with one verified intermediary

**Fixed deposit** basis: **best published 12-month SGD rate a standard retail
customer can get with a placement of up to S$20,000, promotional rate where
one is published.** The placement matters — DBS pays 1.00% below S$20,000 and
0.05% above it.

**Personal loan** basis: **the lender's lowest advertised effective interest
rate (EIR)**, read from each lender's own page — DBS, UOB, Standard Chartered,
HSBC, Trust and GXS. Every Singapore bank prints a flat rate ("from 1.48%
p.a.") beside its EIR ("3.22% p.a."); only the EIR is comparable to a
reducing-balance rate. OCBC blocks automation, CIMB and MariBank render
nothing outside their apps, Citibank's page is empty.

DBS and Hong Leong Finance are read from their own pages. The other eight come
from MoneySmart's monthly comparison page, which was **checked against every
bank we can read directly — DBS, Hong Leong Finance, HSBC, Standard Chartered —
and matched all four exactly** before being trusted. The banks themselves are
not readable: OCBC blocks even a real browser, UOB publishes no rate table,
Maybank refuses the connection.

Excluded on the basis, each for a reason: HSBC (needs S$30,000 fresh funds and
Premier status), Standard Chartered (6-month promotion only), SBI (needs
S$50,000), HL Bank (no 12-month offer).

*Proof it works:* Hong Leong Finance repriced from 1.45% to 1.50% on 10
September. The scraper picked it up the same day.

### 🇮🇳 India — scraped rate sheets

Basis: **1-year retail fixed deposit, general public, below ₹3 crore, callable.**
Ten banks. No Indian regulator publishes per-bank product rates, so the banks'
own pages are the source. Real Indian pricing clusters tightly — six of ten banks
pay exactly 6.25% — so the "best of N" saving is honest but small.

Not reachable for deposits: Bank of India (bot challenge), ICICI (page doesn't
render the 1-year row), Federal (two conflicting tables with no labels).

**Loans** — housing (6 banks), personal (6) and vehicle (3), each read from
the bank's own page as the range or floor it publishes; basis per pool is in
the "ranges and floors" section above. Not reachable: **HDFC** (blocks
automation outright), **Federal** and **Bank of India** (bot challenges),
**PNB** and **Bank of Baroda** (product pages print no rate, apart from BoB's
home loan), **Axis** personal and car loan pages (404), Central Bank ("under
construction"), Indian Bank (404), Yes Bank and UCO (connection errors). These
are the banks a person has to read for us — see the last section.

---

## Thailand's current account — settled 12 September

`bot-pool.mjs` used to map BOT's per-bank **savings** rate onto `current_account`
as a "credit-interest proxy", writing 16 rows a night. That was wrong:

- Thai current accounts (บัญชีกระแสรายวัน) are cheque accounts and pay no
  credit interest. BOT's per-bank deposit endpoint has no current/demand-deposit
  field at all — only `saving_*` and `fix_3/6/12/24_mths_*`.
- A 0.10–1.00% personal savings rate is not what an SME earns on a current
  account, so the pool would have been a benchmark against a product that
  doesn't exist.

The catalog confines `current_account` to 🇸🇬, so those rows were never served —
but one line widening that list would have put all of them on screen. Three
things changed so it can't recur:

| | |
|---|---|
| `bot-pool.mjs` | The savings→current_account mapping is gone; the job now writes 4 products. |
| `import-pool.mjs` | Rejects any CSV row for a product its country doesn't offer. |
| `prune-pool.mjs` | New. `npm run prune:pool -- --dry` lists rows for unoffered pairs; without the flag it deletes them. |

The same sweep removed 30 stale indicative `current_account` rows for 🇲🇾 and 🇮🇩,
left behind from before the product was confined to Singapore. 46 rows in total.

---

## Safety rules the nightly job follows

- **A pool is never shrunk by accident.** A pool's rates are written only if
  *every* source feeding it parsed. One bank redesigning its page means that
  pool is skipped for the night and someone is told — not a 10-bank pool
  silently becoming 9. And the nightly import only ever replaces the banks it
  scraped, so a rate someone entered by hand (for a bank that blocks
  automation) is never wiped by the job.
- **Nothing is inferred.** Each source names the exact table, row and column.
  If any stops matching, that source fails loudly. A page change yields "zero
  rows", never a wrong number under a real bank's name.
- **Generated data cannot reach users.** The API serves only rows traceable to a
  source. The old placeholder rows still exist in the database but are filtered
  out of every response.

---

## What is still missing, and what it would take

| Gap | What it needs | Effort |
|-----|---------------|--------|
| 🇲🇾 Maybank, Public Bank, CIMB deposits | Maybank and Public Bank block automation; CIMB publishes its e-FD rate as an image | A person reads three pages |
| 🇸🇬 Home loans | Banks publish SORA-linked packages (an index plus a spread — the data model has no such thing) and put fixed-package rates only in brokers' hands | Floating-rate schema first |
| 🇸🇬 Vehicle loans | Only Hong Leong Finance publishes a figure (2.68% flat); DBS and UOB pages carry none, Maybank and OCBC block. And Singapore car loans are quoted flat, which the calculator cannot yet compare | A flat-rate `rate_type`, then one source |
| 🇮🇩 Vehicle loans | No Indonesian bank publishes a rate page; financing is quoted flat per tenor by finance companies | Manual, or an aggregator |
| 🇮🇳 Federal, Bank of India, PNB, Axis (personal/car) | Block automation or print no product rate | Manual entry |
| 🇮🇩 BNI, BTN, Permata SBDK | Pages block automation; figures extracted by hand await a human check (`manual-unverified.csv`) | 10 minutes with a browser |
| 🇹🇭 Vehicle loans | Not published by BOT | Manual, or an aggregator |
| Cross-border transfers (per-bank) | The FX-spread half is scraped for Mandiri, BCA, OCBC Indonesia and Bangkok Bank; the flat-fee half is on tariff PDFs no machine can read, and a spread-only pool would flatter every bank. Singapore, Malaysia and India banks publish no readable rate board at all. | A person reads four tariffs (`data/rate-templates/remit-fees-TODO.md`), then it runs nightly |
| Trade finance (LC, BG, SBLC) — over half the old placeholder rows | **Published nowhere by anyone.** Negotiated per deal. | A commercial data partnership, or hide the products |
| Floating-rate loans (SORA / repo-linked) | The data model has no index-plus-spread concept | Schema change |

---

## Filling the rest by hand

Every gap above except trade finance and floating-rate loans is a bank page a
person can read even where a script cannot. The path is the same for all of
them: a fill-ready CSV (`npm run import:template -- IN`), the rate written
exactly as the bank prints it ("6.25", "8.00-9.50", "from 7.5"), a dry run to
validate, then `npm run import:pool -- <file> --merge` so the new rows sit
beside the scraped ones. A brief for extracting those rates — with the rules
that make the output checkable — is in
[data/rate-templates/EXTRACTION_PROMPT.md](data/rate-templates/EXTRACTION_PROMPT.md).
Each row it produces carries the page URL and the exact sentence the figure
came from, so a spot check takes a minute per row.

---

## Recommendation

1. **Launch Thailand, Malaysia (home loans), Singapore, India and Indonesia on
   the products that are live** — they are real, sourced, and refresh nightly.
2. **Put the base-rate caveat on screen** for Indonesia and Thailand before
   launch; it is one sentence.
3. **Decide on trade finance** — hide, or label as indicative. It cannot be
   sourced.
