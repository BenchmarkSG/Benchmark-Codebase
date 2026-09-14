# What's automated, what isn't

A plain per-country list of every product the app offers, whether its rates
refresh on their own, and what it would take to automate the ones that don't.

Counts are real (sourced) rows in `product_rates`, read from the database on
**12 September 2026**. Indicative rows are ignored — they aren't served.

**15 of the 42 country × product pools are live. 165 real rows.**

---

## The three ways a rate gets in

| | How | Runs | Covers |
|---|---|---|---|
| **A** | **Regulator feed** — `bot-pool.mjs` (Bank of Thailand), `bnm-pool.mjs` (Bank Negara Malaysia) | Nightly, 02:00 UTC | TH 4 products, MY housing |
| **B** | **Bank-page scraper** — `scrape-pool.mjs`, one declared source per bank | Nightly, same job | IN 4, SG 2, ID 2, MY fixed deposit |
| **C** | **Manual import** — a person reads the figure, puts it in a CSV, `import-pool.mjs --merge` | When someone does it | Nothing currently |

A is the most robust (one endpoint, many banks). B breaks when a bank redesigns
a page — by design it fails loudly and keeps the last good row rather than
emptying the pool. C never breaks but never runs by itself.

---

## 🇹🇭 Thailand — 4 of 8 automated

Best covered market. BOT publishes every bank's rates through one API.

| Product | Automated | Source / what it would take |
|---|---|---|
| Housing loan | ✅ 17 banks | A — BOT MLR |
| Personal loan | ✅ 15 banks | A — BOT MRR |
| Overdraft | ✅ 17 banks | A — BOT MOR (the floor only; the negotiated spread on top isn't published) |
| Fixed deposit | ✅ 15 banks | A — BOT 12-month |
| Current account | ❌ **Not applicable** | Thai current accounts (บัญชีกระแสรายวัน) are cheque accounts and pay no credit interest — BOT's per-bank deposit publication has no current/demand-deposit field at all, only savings and fixed 3/6/12/24m. **Settled 12 Sep 2026:** the 16 rows were the individual *savings* rate mapped across as a proxy; they've been deleted and the job no longer writes them. Nothing to automate here. |
| Vehicle loan | ❌ | Not in BOT's publication. Needs a comparison-site partnership (MoneyGuru, rabbit finance) or manual import. |
| Cross-border | ❌ | See cross-cutting below. |
| Trade finance (funded + unfunded) | ❌ | See cross-cutting below. |

---

## 🇲🇾 Malaysia — 2 of 8 automated

| Product | Automated | Source / what it would take |
|---|---|---|
| Housing loan | ✅ 34 banks | A — BNM indicative effective lending rate |
| Fixed deposit | ✅ 5 banks | B — Hong Leong, AmBank, Alliance, Bank Rakyat, RHB. Best rate available to the customer (promo/e-FD where published). |
| Personal loan | ❌ | BNM publishes reference rates (BR/BLR), not personal-loan pricing. Each bank's own page must be scraped — but Maybank, Public Bank, CIMB, OCBC, UOB and HSBC all block automation. Realistically a comparison-site feed (RinggitPlus, iMoney) or manual import. |
| Vehicle loan | ❌ | Same as above — not in the BNM feed, quoted flat by the bank. |
| Fixed deposit — the blocked half | ❌ | Maybank, Public Bank, OCBC, UOB, HSBC unreadable; CIMB publishes its e-FD rate only as an image. **A person reading six numbers once a month closes this.** |
| Cross-border | ❌ | See cross-cutting below. |
| Overdraft, trade finance | ❌ | See cross-cutting below. |

---

## 🇮🇳 India — 4 of 9 automated

Every rate is scraped from the bank's own page; RBI has no per-bank API.

| Product | Automated | Source / what it would take |
|---|---|---|
| Housing loan | ✅ 9 banks | B — SBI, ICICI, Axis, Kotak, BoB, Union, Central Bank, HDFC, Canara |
| Personal loan | ✅ 9 banks | B |
| Vehicle loan | ✅ 6 banks | B |
| Fixed deposit | ✅ 10 banks | B |
| The missing lenders | ❌ | HDFC (main host), Federal and Bank of India block automation; PNB and BoB print no product rate. Manual import, ~15 min/month. |
| Current account fees | ❌ | Fee schedules are PDFs, per bank. Manual import. |
| Overdraft | ❌ | See cross-cutting below. |
| Cross-border, trade finance | ❌ | See cross-cutting below. |

---

## 🇸🇬 Singapore — 3 of 9 automated

| Product | Automated | Source / what it would take |
|---|---|---|
| Fixed deposit | ✅ 10 banks | B — DBS, OCBC, UOB, Maybank, CIMB, BoC, RHB, ICBC, Citibank, Hong Leong Finance |
| Personal loan | ✅ 7 lenders | B — lowest advertised **EIR**, not the flat headline rate |
| Housing loan | ❌ | **Schema done 13 Sep — now blocked on a source.** The floating-rate schema (`rate_index` + `index_value` + `spread`) is live, so "3M SORA + 0.30%" can be stored and shown properly. But nobody publishes the spreads: DBS and UOB show no package pricing, MoneySense has no rate section, Redbrick serves a blog listing for every URL, and MoneySmart's comparison table has no rate column. Needs a broker/aggregator partnership, or a person entering spreads monthly. |
| Vehicle loan | ✅ 1 lender | **Flat basis, decided 13 Sep.** Hong Leong Finance, 2.68% flat, scraped nightly. SG car loans are advertised flat — interest on the original sum for the whole tenor — and HLF prints both bases, which is why flat won: the flat rate is 2.68% at every tenor while the effective rate runs 5.81% (1y) to 5.14% (7y). One number versus seven. The importer refuses to mix flat and effective in one pool, and the screen labels it. Other lenders (DBS, UOB, Maybank, OCBC) publish nothing or block. |
| Current account | ❌ | **Also a basis decision.** Base rate is ~0.05%; bonus tiers reach 4%+ on conditions (salary credit, card spend, insure/invest). Decide what the pool compares before collecting anything. |
| Cross-border, overdraft, trade finance | ❌ | See cross-cutting below. |

> MAS's datastore API is **retired**, not down — so unlike Thailand and Malaysia
> there is no regulator feed to fall back on. Singapore will always be scraping.

---

## 🇮🇩 Indonesia — 2 of 8 automated

| Product | Automated | Source / what it would take |
|---|---|---|
| Housing loan | ✅ 5 banks | B — SBDK (base lending rate) from each bank's own disclosure page |
| Personal loan | ✅ 5 banks | B — SBDK Non-KPR |
| Both, caveat | ⚠️ | SBDK is a **base rate**, not the rate a customer is offered. The screen doesn't say so yet. |
| The missing banks | ❌ | BNI, BTN and Permata publish SBDK but block automation (403 / empty render). OJK's portal carries national aggregates only, not per-bank. Manual monthly import. |
| Fixed deposit | ❌ | No API; LPS caps aren't per-bank promos. Manual import, then scrapers for the banks that publish. |
| Vehicle loan | ❌ | No bank publishes a rate page — financing is quoted flat per tenor by multifinance companies. Comparison-site feed or manual. |
| Cross-border, overdraft, trade finance | ❌ | See cross-cutting below. |

---

## Cross-cutting — the same answer in all five countries

| Product | Why it's not automated anywhere | What it would take |
|---|---|---|
| **Cross-border transfer** | The mid-market rate *is* automated (ECB). The per-bank cost is FX margin + fees, and the fee tariffs are PDFs or rates drawn in components a browser can't read. The scraper and importer are **already built** (`scrape-remit.mjs`, `import-remit.mjs`) and the FX spreads already measure correctly. | **A person reads four fee tariffs** (`data/rate-templates/remit-fees-TODO.md`), then the pipeline runs itself. This is the cheapest big win on the list. |
| **Overdraft (SME)** | The board rate is semi-public; the negotiated spread that actually matters is not. Thailand's MOR floor is the only piece any regulator publishes. | Advisor deal book — advisors log real quotes. No feed exists. |
| **Short-term / trade finance** | Priced per RFQ against tenor, counterparty risk and collateral. No regulator or aggregator carries it. | Advisor deal book, then a licensed feed (ICC Trade Register). |
| **Unfunded facility (L/C, BG, SBLC)** | Commissions are bilateral and confidential. | Same as above. |

---

## If you want the most coverage for the least work

1. ~~Settle Thailand's current account.~~ **Done 12 Sep 2026** — Thai current
   accounts pay no credit interest, so there was never a pool here. The 16 rows
   (individual savings rates wearing the wrong label) are gone, `bot-pool.mjs`
   no longer writes them, and `import-pool.mjs` now refuses any row for a
   product its country doesn't offer. `npm run prune:pool -- --dry` re-checks.
2. **Read the four remittance fee tariffs.** Everything downstream is built and
   tested; this unlocks cross-border in five countries at once.
3. **Decide the three Singapore bases** (housing / vehicle / current account).
   Each is one decision, and each turns a blocked product into a scrapeable one.
4. **One monthly manual pass** over the banks that block automation — CIMB
   Malaysia, HDFC/Federal/BoI India, BNI/BTN/Permata Indonesia. Perhaps 30
   minutes a month, and it never breaks.
