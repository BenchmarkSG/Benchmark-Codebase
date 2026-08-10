# Data gaps — products we can't fetch automatically (and the way out)

This is the honest inventory of what our automation **does not** cover, country by
country, and what to do about each. Read it alongside [MARKET_DATA.md](MARKET_DATA.md)
(what *is* automated).

## First, two data layers — don't confuse them

Our benchmark uses two different kinds of number, and automation only reaches one
of them today:

| Layer | What it is | Feeds | Automated today? |
|-------|-----------|-------|------------------|
| **Benchmark pool** | The set of **per-bank** rates a user's rate is compared against (the "best of N providers"). | `product_rates` in Supabase, seeded by [seed-rates.mjs](scripts/seed-rates.mjs). | **No** — curated, **except 🇹🇭 Thailand** (BOT per-bank, live via [bot-pool.mjs](scripts/bot-pool.mjs)) and **🇲🇾 Malaysia** (BNM housing loan, live via [bnm-pool.mjs](scripts/bnm-pool.mjs)). |
| **Market reference** | A single **aggregate** "📊 market typical" line shown beside the result. | `market_rates`, written by [market-rates.mjs](scripts/market-rates.mjs). | **Partly** — central-bank aggregates only (SG/MY/TH). |

So even for a product marked "automated" below, automation usually feeds only the
*reference line* — the actual per-bank **pool** it scores against is still curated
everywhere but Malaysia. Every gap in this file is really a gap in the pool.

## The way-out toolbox (referenced as W1–W7 in the tables)

| Code | Strategy | Best for | Cost / caveat |
|------|----------|----------|---------------|
| **W1** | **Admin-curated, monthly** — enter board + promo rates from public bank pages via the admin portal. *(What we do today.)* | Everything, as a baseline. | Labour; only as fresh as the last update. |
| **W2** | **Scrape published rate pages** — per-bank scrapers for promo FD, home-loan board rates, fee schedules. | Products banks publish prominently (FD promos, home-loan boards). | Brittle; check `robots.txt`/ToS. |
| **W3** | **Aggregator feed / partnership** — comparison sites already normalise per-bank rates (see per-country list). | Retail loans, deposits, cards. | Partnership = clean; scraping = grey-area. |
| **W4** | **Regulator disclosure data (non-API)** — per-bank rates regulators mandate but publish as web tables / Excel / PDF, not REST. | *(none, in practice)* | **Investigated & shelved (Aug 2026):** IN has no per-bank source; the accessible OJK portal is national-*aggregate*, not per-bank. Use **W1** (import tool) instead. |
| **W1i** | **Manual per-bank import** — assemble a CSV from a published-but-not-machine-accessible source and load it via [import-pool.mjs](scripts/import-pool.mjs). Real (`is_indicative=false`) rows. | IN MCLR, ID SBDK — anywhere W4 fails. | ~15 min/country/month; robust (nothing to break). |
| **W6** | **Advisor / partner deal book** — advisors log real quotes and closed deals. | Negotiated, unpublished pricing (trade finance, OD spreads). | Manual; sparse until advisor network grows. |
| **W7** | **Specialist / licensed feed** — Wise Comparison API (remittance margins), ICC Trade Register (trade-finance pricing), commercial vendors. | Cross-border margins, trade finance. | Licensing cost. |

---

## 🇸🇬 Singapore

**Automated today (reference line only):** fixed deposit, housing loan, personal
loan, current account — all **aggregate proxies** from MAS, and MAS was under
maintenance at time of writing. No product has an automated **per-bank pool**.

| Product | Segment | Why it can't be auto-fetched | Recommended way out |
|---------|---------|------------------------------|---------------------|
| Vehicle loan | Individual | No MAS series; banks don't break out auto loans. | **W3** (MoneySmart/SingSaver) → **W1** fallback. |
| Fixed deposit (per-bank) | Both | MAS gives a market average, not each bank's promo. | **W2** (FD promo pages are public + structured) → **W3**. |
| Housing / personal loan (per-bank) | Individual | MAS "prime lending" is a single proxy; realised per-bank rates aren't published. | **W3** (realised rates), **W1** baseline. |
| Current account (SME fees / credit interest) | SME | No central-bank series; pricing lives in per-bank fee schedules. | **W2** (fee schedules) → **W1**. |
| Overdraft (SME) | SME | No clean MAS SME-OD series; spread is negotiated. | **W6** + **W1**. |
| Short-term / trade finance (funded) | SME | Not published anywhere; RFQ-priced. | **W6** → **W7** (ICC). |
| Unfunded facility (L/C, BG, SBLC) | SME | Commissions are bilateral, never published. | **W6** → **W7** (ICC). |
| Cross-border transfer (per-bank margin) | Both | Mid-market rate **is** automated (ECB, [server/fx.js](server/fx.js)); each bank's FX margin + fee is not. | **W7** (Wise Comparison API) → **W2**. |

---

## 🇲🇾 Malaysia — real *per-bank* housing-loan pool

**Fully automated, per-bank:** BNM publishes each bank's **indicative effective
lending rate**, so `housing_loan` populates the real `product_rates` **pool** daily
via [bnm-pool.mjs](scripts/bnm-pool.mjs) (~34 banks). BR/BLR are reference floors
(not what customers pay), so they aren't mapped to products. The rest stay gaps:

| Product | Segment | Why it can't be auto-fetched | Recommended way out |
|---------|---------|------------------------------|---------------------|
| Personal loan | Individual | BNM publishes lending *reference* rates (BR/BLR), not per-bank personal-loan pricing. | **W3** (RinggitPlus / iMoney). |
| Fixed deposit | Both | BNM publishes lending rates, not per-bank FD promos. | **W3** (RinggitPlus / iMoney) → **W2**. |
| Vehicle loan | Individual | Not in the BNM base-rate feed. | **W3** → **W1**. |
| Current account / overdraft (SME) | SME | Fees/credit interest not in BNM series. | **W2** → **W1** / **W6**. |
| Short-term / trade finance | SME | RFQ-priced, unpublished. | **W6** → **W7**. |
| Unfunded facility (L/C, BG, SBLC) | SME | Bilateral commissions. | **W6** → **W7**. |
| Cross-border transfer (per-bank margin) | Both | Mid automated (ECB); per-bank margin not. | **W7** → **W2**. |

---

## 🇹🇭 Thailand — the richest per-bank pool (5 of 9 products)

**Fully automated, per-bank (like Malaysia):** BOT publishes each bank's rates, so
these **five** now populate the real `product_rates` **pool** daily via
`scripts/bot-pool.mjs` — not just the reference line:
**MLR→housing_loan, MRR→personal_loan, MOR→overdraft, 12M→fixed_deposit,
savings→current_account** (domestic commercial banks). `current_account` uses the
individual savings rate as a credit-interest proxy. Only the products below remain
gaps.

| Product | Segment | Why it can't be auto-fetched | Recommended way out |
|---------|---------|------------------------------|---------------------|
| Vehicle loan | Individual | Not in BOT's loan-rate publication. | **W3** (MoneyGuru / rabbit finance) → **W1**. |
| Overdraft **spread** beyond MOR | SME | MOR (the floor) is now automated; the negotiated spread over it isn't. | **W6**. |
| Current-account **fees** (beyond credit interest) | SME | Only savings/deposit rates are published, not fee schedules. | **W2** (fee schedules) → **W1**. |
| Trade finance (funded + unfunded) | SME | RFQ-priced, unpublished. | **W6** → **W7**. |
| Cross-border transfer (per-bank margin) | Both | Mid automated (ECB); per-bank margin not. | **W7** → **W2**. |

---

## 🇮🇳 India

**Automated today:** none — and **W4 is not viable here** (investigated Aug 2026).
RBI has no rate API; it publishes only the **aggregate one-year *median* MCLR**
monthly (a single national number, in bulletins/press — not per-bank). Per-bank
MCLR lives only on each bank's own site or behind paywalled aggregators (Dataful,
BankBazaar). `data.gov.in` carries no clean lending-rate resource. So there is no
clean, machine-readable, per-bank source to parse.

| Product | Segment | Why it can't be auto-fetched | Realistic way out |
|---------|---------|------------------------------|-------------------|
| Housing / personal / vehicle loan | Individual | RBI publishes only the aggregate median MCLR; per-bank is on 20+ bank sites (JS/PDF) or paywalled aggregators. | **W1** (admin pastes the monthly per-bank MCLR) or **W3** (license Dataful / BankBazaar). |
| Fixed deposit | Both | No API; FD rates are on each bank's site. | **W2** (FD pages) → **W3**. |
| Current account / overdraft (SME) | SME | No API; OD spread negotiated. | **W1** + **W6**. |
| Trade finance (funded + unfunded) | SME | RFQ-priced, unpublished. | **W6** → **W7**. |
| Cross-border transfer (per-bank margin) | Both | Mid automated (ECB); per-bank margin not. | **W7** → **W2**. |

> **Realistic move for India:** the per-bank data *is* published monthly (RBI's SCB
> lending-rate release + each bank's MCLR page), just not machine-accessibly. The
> robust path is a **W1 monthly import** — an admin pastes/uploads the figures into
> `product_rates` — not a scraper that will break. A licensed feed (W3, Dataful) is
> the only "hands-off" option.

---

## 🇮🇩 Indonesia

**Automated per-bank today:** none — **W4 for a per-bank pool is not viable**
(investigated Aug 2026, deeper than first thought). OJK's data portal
(`data.ojk.go.id/SJKPublic`) *is* reachable (behind an F5 WAF — needs a browser
User-Agent + a primed session cookie), and its DevExtreme JSON endpoint works. **But
its interest-rate datasets are `LevelData: Nasional` — national aggregates, not
per-bank.** The true **per-bank SBDK** (with the KPR/housing segment) lives on a
separate `ojk.go.id/.../Suku-Bunga-Dasar.aspx` page (which timed out on every fetch)
and on 100+ individual bank sites — none cleanly scriptable.

| Product | Segment | Why it can't be auto-fetched (cleanly) | Realistic way out |
|---------|---------|----------------------------------------|-------------------|
| Housing loan | Individual | Per-bank SBDK-KPR isn't in the accessible portal (that's national-aggregate); the per-bank page/bank sites aren't scriptable. | **W1** (monthly import — [import-pool.mjs](scripts/import-pool.mjs)). |
| Personal / vehicle loan | Individual | Same — no accessible per-bank source. | **W1** or **W3** (Cermati / Lifepal). |
| Fixed deposit | Both | No API; LPS caps aren't per-bank promos. | **W1** → **W2**. |
| Current account / overdraft (SME) | SME | No API; spread negotiated. | **W1** + **W6**. |
| Trade finance (funded + unfunded) | SME | RFQ-priced, unpublished. | **W6** → **W7**. |
| Cross-border transfer (per-bank margin) | Both | Mid automated (ECB); per-bank margin not. | **W7** → **W2**. |

> **Realistic move for Indonesia:** per-bank data isn't cleanly scrapeable, so the
> robust path is a **W1 monthly import** of OJK SBDK figures via
> [import-pool.mjs](scripts/import-pool.mjs). *Optional:* the OJK portal's
> **national-aggregate** credit-rate dataset (id 513) could feed a market *reference*
> line for ID (like MAS for SG) — automatable, but a single national number, not a pool.

---

## Cross-cutting: products with no public source *anywhere*

Some products are unpublished by design in **every** market — no regulator or
aggregator carries them, because they're negotiated per deal:

| Product | Why no source exists | Only real way out |
|---------|---------------------|-------------------|
| Short-term / trade finance (funded) | Priced per RFQ against tenor, counterparty risk, collateral. | **W6** advisor deal book → **W7** ICC Trade Register. |
| Unfunded facility (L/C, BG, SBLC) | Commissions are bilateral, confidential. | **W6** → **W7**. |
| SME overdraft **spread** | Board rate is public-ish; the negotiated spread that matters is not. | **W6**. |
| Cross-border **per-bank margin** | The visible fee ≠ the real cost; margin is baked into the FX rate. | **W7** Wise Comparison API. |

For these, the **advisor deal book (W6)** is the primary strategy — advisors log the
real negotiated quotes and closed deals, which is the only place this pricing exists.
A licensed feed (**W7**, e.g. ICC Trade Register / Wise) covers what advisors can't.

---

## Suggested build order

0. ✅ **Thailand per-bank pool (BOT)** — *done*. [bot-pool.mjs](scripts/bot-pool.mjs)
   writes real per-bank loan & deposit rates into `product_rates` daily.
0. ✅ **Malaysia per-bank housing-loan pool (BNM)** — *done*.
   [bnm-pool.mjs](scripts/bnm-pool.mjs) writes ~34 banks' effective lending rates
   into `product_rates` daily (keyless).
3. ✅ **W1 monthly import for IN + ID** — *tool built* ([import-pool.mjs](scripts/import-pool.mjs)).
   Paste/CSV of per-bank MCLR / SBDK → real `product_rates`. The robust way to make
   India and Indonesia real; the data is published monthly per-bank, just not
   machine-accessibly. (A per-bank OJK scraper was investigated and shelved — the
   accessible portal is national-aggregate, not per-bank.)
4. **W2 FD-promo scrapers.** FD promos are the most structured, most-published
   retail product — good ROI across SG/MY/TH/IN/ID.
5. **W7 for cross-border + trade finance.** License Wise Comparison for remittance
   margins; approach ICC for trade-finance benchmarks — only after 1–4 land.
