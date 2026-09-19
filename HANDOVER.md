# FeeOptima — Complete Handover

**For:** any AI assistant or developer picking this codebase up cold.
**Written:** 18 September 2026. **Repo:** `benchmarksg`, branch `main`.

> **If your context window is small, read §1–§4 first.** They contain the rules that
> prevent expensive mistakes. Everything after §4 is reference.

---

## 1. What this product is

**FeeOptima** tells a bank customer whether they are overpaying, and by how much.

The user enters their own rate (e.g. "my housing loan is 9%"), and the app compares it
against a pool of real published rates from other banks in their market. It shows the gap
in money per year, then sells three ways to act on it.

**Five markets:** Singapore (SG), India (IN), Malaysia (MY), Indonesia (ID), Thailand (TH).
**Two segments:** individual, SME (SMEs and corporates share one tab).
**Ten products:** housing/personal/vehicle loan, fixed deposit, cross-border transfer,
current account, current-account fees, overdraft, short-term finance, unfunded facility.

### The money model

| Tier | Price | What the customer gets |
|---|---|---|
| Reveal | ~$1 promo / $9 standard | The **name** of the best bank + its rate |
| Option 1 | Free (after reveal) | A ready-to-send negotiation email they send themselves |
| Option 2 | S$99 | A specialist coaches them through the negotiation on a call |
| Option 3 | S$199 | An ex-banker runs the negotiation for them |

**The bank's NAME is the product.** Everything else (the gap, the best rate, the saving)
is free. This single fact drives the most important rule in §2.

---

## 2. HARD RULES — breaking these is worse than shipping nothing

These are not style preferences. Each one is here because it was violated once and cost
something real.

### 2.1 Never invent a rate, fee, or spread

If a number is not sourced from a published page or a regulator feed, it does not go in
front of a customer. Not as a placeholder, not "to make the demo look full", not as a
"reasonable estimate".

- `RATES_REAL_ONLY` (env, **defaults `true`**) makes the server serve only rows with
  `is_indicative = false`. An unsourced pool returns *"No benchmark data for this
  selection yet."* — which is correct behaviour, not a bug to work around.
- `scripts/seed-rates.mjs` generates fake rows for local development. They are **always**
  written `is_indicative = true`. Its `NO_SYNTHETIC` map lists product/market pairs that
  must never be generated at all.
- Empty is better than wrong. A missing benchmark is a gap; a fabricated one is a lie a
  customer may act on with their bank.

**This was violated once with Indian RBI data and it is the reason every guard above
exists.**

### 2.2 Never load a number that a language model read off a page

A model summarising a page will confidently transpose a digit or pick the wrong column.
Every figure must be extracted by **deterministic parsing** — exact table, exact row,
exact column index — and must be **re-verifiable against the live page**.

- If a selector stops matching, the scraper must **fail loudly and skip**, never guess.
- If you cannot re-verify a figure right now, do not load it.
- Pattern to copy: `scripts/scrape-pool.mjs`, `scripts/scrape-remit.mjs`.

### 2.3 Secrets

| Secret | Rule |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses all RLS. **Local `.env` and GitHub Actions secrets only.** Never in the client, never in Vercel's web runtime. |
| `STRIPE_SECRET_KEY` | Server-only. Never prefixed `VITE_`. |
| Any `VITE_*` var | **Baked into the JS bundle at build time and public.** Only put publishable values here. |

Never commit a real `.env`. Only `*.env.example` files are tracked.

### 2.4 The paywall: `bestBank` must never leave a free endpoint

`/api/benchmark` is public and unauthenticated. It must strip `bestBank` before responding:

```js
const { bestBank: _paid, ...publicResult } = result;
res.json(publicResult);
```

There are **two** code paths that must do this — the rate path and `handleCrossBorder()`.
The cross-border one was missed for months and leaked `"bestBank": "Hong Leong Bank"` to
anyone with `curl` the moment real data was loaded. Both are now asserted in
`server/test/api.test.js`. **If you add a third path, assert it there too.**

The name is served only by `/api/reveal`, and only against a payment the server verified.

**The other half of that rule: `/api/reveal` must rebuild the SAME pool `/api/benchmark`
built.** It recomputes from scratch and returns only a name, so any parameter the benchmark
used and the reveal doesn't means the buyer is handed the winner of a different comparison.
Cross-border is the trap — it is priced per corridor and per amount sent (a bank's USD
spread says nothing about its INR spread; a flat S$20 fee is 2% of S$1,000 and 0.2% of
S$10,000). The reveal passed neither for months. The corridor now travels in the journey
context as `inputs` (the raw form values, which `saved_benchmarks.inputs` also stores, so it
survives the Stripe redirect and a reopen from the dashboard) and is asserted in
`server/test/api.test.js`. **Add a parameter to a benchmark and you must add it to the
reveal.**

Proof of purchase is a Stripe session id (bought anonymously) or a `saved_benchmarks` row
whose `stage` is in `REVEALED_STAGES`. A signed-in buyer who has claimed the purchase holds
neither once they recompute the same benchmark, so `findPaidBenchmarkId()` looks the row up
— otherwise they are shown the three options with no bank on them, for something they own.

### 2.5 Never show one bank's logo next to another bank's name

On a screen someone paid for, a wrong logo is a false statement about who offers the rate.
`logoForBank()` in `client/src/components/BankLogos.jsx` matches in exactly two ways, both
exact: both names reduce to the same key under `normalise()`, or a human wrote the pair
into `ALIAS_PAIRS`. **No substring matching, no edit distance, no "close enough."** An
ambiguous key returns `null` and the name shows alone, which is fine.

### 2.6 Git attribution

End every commit message with:
```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```
End every PR description with:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## 3. Stack and layout

```
benchmarksg/
├── client/              React 18 + Vite SPA
│   ├── src/
│   │   ├── components/  Hero, BenchmarkCalculator, JourneyModal, Navbar, BankLogos…
│   │   ├── dashboard/   UserDashboard, AdvisorDashboard
│   │   ├── admin/       AdminApp (rate management)
│   │   ├── support/     SupportApp (call queue), playbooks.js (call scripts)
│   │   ├── lib/         api.js, supabase.js, whatsapp.js, complaints.js, site.js…
│   │   └── context/     AuthContext
│   └── public/images/bankLogos/   50+ logo files
├── server/              Express 4, ESM
│   ├── app.js           all routes
│   ├── benchmark.js     PRODUCTS catalog + all benchmarking maths
│   ├── ratesRepo.js     Supabase reads, RATES_REAL_ONLY guard
│   ├── payments.js      Stripe Checkout
│   ├── fx.js            mid-market FX (ECB via Frankfurter)
│   └── test/            node:test, 62 tests
├── scripts/             data pipeline (see §9)
├── supabase/            SQL migrations — ⚠ NOT IN GIT, see §7
└── data/rate-templates/ scraper CSV output
```

**Deployment:** Vercel, auto-deploys from `main`. Live at **https://feeoptima.vercel.app**
(`feeoptima.com` has **no DNS** — do not point anything at it).

**Git remotes differ:** fetch = `Benchmark-SG/v1-prototype`, push = `DhruvanshKumar/Benchmark-v1`.

---

## 4. Current state (18 Sep 2026)

Everything described here is **committed and deployed**. Last commits:

```
3129aab chore: canonical domain, hero copy, flat navbar controls
3349660 feat: support portal — full lead detail, complaint ladders, WhatsApp-first
939ac5e feat: reveal screen redesign, and WhatsApp as the primary channel
f9f649a feat: show the revealed bank's logo, and match it reliably
13483ce data: real cross-border pricing from the Wise Comparison API
3b3a25a security: stop the free benchmark leaking the paid bank on cross-border
```

### Rate coverage — 17 of 42 possible cells are live

```
product                     SG      IN      MY      ID      TH
housing_loan              GAP       9      34       5      17
personal_loan                7       9    GAP       5      15
vehicle_loan                 1       6    GAP    GAP    GAP
fixed_deposit               10      10       5    GAP      15
cross_border                 4    GAP       4    GAP    GAP
current_account           ---     n/a     n/a     n/a     n/a
current_account_fees       n/a    ---     n/a     n/a     n/a
overdraft                 GAP    GAP    GAP    GAP      17
short_term_finance        ---    ---    ---    ---    ---
unfunded_facility         ---    ---    ---    ---    ---
```

- Numbers = banks with **real** sourced rates.
- `GAP` = **sourceable** with scraper work. 13 cells.
- `---` = **no public source exists anywhere.** 12 cells. See §8.3.

---

## 5. Environment variables

### Root `.env` (server + scripts) — never committed

```bash
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>            # server reads with this
SUPABASE_SERVICE_ROLE_KEY=<secret>      # scripts only, NEVER in Vercel
STRIPE_SECRET_KEY=sk_test_...           # or sk_live_ in prod
BOT_API_KEY=<Bank of Thailand client id>
CALENDLY_TOKEN=<personal access token>  # scripts/sync-calendly.mjs only
PUBLIC_BASE_URL=https://feeoptima.vercel.app
ALLOWED_ORIGINS=https://feeoptima.vercel.app
# RATES_REAL_ONLY=true                  # default; only set false in a migration window
```

### `client/.env.local` (Vite) — never committed, all values are PUBLIC

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_CALENDLY_URL=https://calendly.com/<org>/<event>
VITE_PUBLIC_SITE_URL=https://feeoptima.vercel.app
VITE_WHATSAPP_NUMBER=6591234567         # ⚠ PLACEHOLDER — see §8.1
VITE_ADMIN_EMAIL=admin@benchmark.com
VITE_SUPPORT_EMAIL=usersupport@feeoptima.com
```

### ⚠ Must be set in the Vercel dashboard (not yet done)

```
PUBLIC_BASE_URL      = https://feeoptima.vercel.app
ALLOWED_ORIGINS      = https://feeoptima.vercel.app
VITE_PUBLIC_SITE_URL = https://feeoptima.vercel.app
```

**Why `PUBLIC_BASE_URL` matters more than it looks:** Stripe returns every payer to
`PUBLIC_BASE_URL`, regardless of which hostname they started on. The in-progress benchmark
rides across that hop in `sessionStorage`, which is **per-origin and per-tab**. If this
points at a different Vercel alias than the one people browse, every payer lands on a page
that cannot restore their benchmark and sees *"payment confirmed but couldn't restore your
benchmark"*. That banner is this variable being wrong, nothing else.

`VITE_*` vars are baked in at build time → **a redeploy is required**, not just a var change.

---

## 6. Database (Supabase + RLS)

| Table | Purpose |
|---|---|
| `banks` | 15 per market. `id`, `country_code`, `name`, `category`, `display_order` |
| `product_rates` | The rate pool. `bank` is **free text** from the source, not an FK |
| `remittance_charges` | Cross-border. FK `bank_id` → `banks`. `counterparty` = **currency** code |
| `loan_products`, `market_rates` | Aggregate/reference data |
| `user_profiles` | `phone` is intended as the WhatsApp number |
| `saved_benchmarks` | A user's saved results; `stage` gates the paid reveal |
| `leads` | Callback requests. `slot_start`, `called_at`, `stage` |
| `lead_notes`, `lead_contacts` | **Append-only** call log. Support can add, never edit/delete |
| `advisors`, `advisor_blackouts` | Expert directory + unavailability |
| `complaint_contacts` | Bank complaint escalation, levels 1–2. Empty until human-verified |
| `support_staff` | Who may read the support queue |

**Permission model:** support staff **add, never edit or delete.** This is enforced by
append-only tables plus `SECURITY DEFINER` functions, with no UPDATE/DELETE policy for
support at all — so RLS denies both outright. Only admin can change history.

---

## 7. ⚠ Migrations are NOT in git

**`.gitignore` line 16 is `*.sql`**, commented *"kept out of version control per request"* —
so this was a deliberate choice, not an accident. The consequence is that the entire
`supabase/` folder has never been committed: **every migration exists only on the original
developer's laptop.** If that machine is lost, the schema is unrecoverable and the running
database cannot be rebuilt or replicated.

The files were checked and contain **no secrets** (128 KB of pure DDL: tables, RLS policies,
`SECURITY DEFINER` functions), and there are no `*.sql` files anywhere else in the repo, so
the rule currently protects nothing. Reversing it is one line:

```gitignore
-*.sql
+/data/**/*.sql          # data dumps only — schema lives in supabase/ and IS tracked
```

**This decision belongs to the project owner.** Until it is reversed, whoever holds the repo
must also be given the `supabase/` folder out of band, or the schema is lost.

### Applied ✅
`rates_schema`, `product_rates`, `product_model_v2`, `rate_basis`, `rate_freshness`,
`market_rates`, `admin`, `advisors`, `advisor_calendly`, `advisor_blackouts`, `dashboards`,
`bookings`, `user_profiles`, `account_settings`, `feedback`, `newsletter`, `rate_proposals`,
`support`, `lead_notes`, `complaints`, `fix_india_current_account`

### NOT applied ❌ — run these in the Supabase SQL editor

| File | What breaks without it |
|---|---|
| `supabase/whatsapp.sql` | WhatsApp opt-in/verification is collected by the UI then **silently discarded** |
| `supabase/floating_rate.sql` | `import:pool` warns; floating-rate index/spread columns missing |
| `supabase/call_booking.sql` | Option 2 self-scheduling. Without it the booking screen **falls back to Calendly automatically** — nothing breaks, but the slot picker, the pre-payment hold and the blackout honouring do not exist |

---

## 8. Open work, in priority order

### 8.1 `VITE_WHATSAPP_NUMBER` is a placeholder — real person's number

It is currently `6591234567`, copied from `.env.example`. `client/src/lib/whatsapp.js` has a
`PLACEHOLDERS` blocklist so every WhatsApp affordance **hides** rather than messaging a
stranger — but nothing WhatsApp-related works until a real business number is set.

### 8.2 Cross-border savings are overstated by ~47%

**Two different mid-market rates are being compared.** The bank pool's spread is measured
against **Wise's mid at collection time**; the customer's own cost is measured against the
**ECB daily fix** (`server/fx.js`).

On 18 Sep those were `0.783055` and `0.78411` — a **0.135% gap**, against bank spreads of
0.59–0.87%. So ~a fifth of the signal is reference noise, and it does not cancel.

Worked example: S$10,000 → US$7,750 on S$100,000 annual volume. **The app quotes S$410.
Measured consistently it is S$279.**

**Fix:** store the reference mid on each `remittance_charges` row and price the customer's
leg against that same figure. **Do this before cross-border is sold to anyone.**

### 8.3 The 13 sourceable rate gaps

`SG housing_loan` · `MY personal_loan` · `MY/ID/TH vehicle_loan` · `ID fixed_deposit` ·
`IN/ID/TH cross_border` · `SG/IN/MY/ID overdraft`

Notes from investigation:
- **Overdraft** is the biggest win (4 cells, SME-facing). Thailand works because BOT
  publishes a per-bank *Minimum Overdraft Rate*. **Malaysia's BLR is a floor, not a
  customer rate** — mapping it to overdraft would repeat an error already reverted in
  `bot-pool.mjs` (a savings rate dressed up as SME current-account interest).
- **Cross-border IN/ID:** Wise's comparison API returns **zero providers**. TH returns two
  banks but **no zero-markup quote**, so there is no mid to measure against — the corridor
  is skipped rather than guessed.
- **SG housing_loan** is hardest: Singapore mortgages are a formula (SORA + spread), not a
  number.
- **Indonesia lead:** POJK 13/2024 requires every conventional bank to publish its **SBDK**
  (prime lending rate) broken into Korporasi / Ritel / **KPR** / Non-KPR. KPR → housing_loan
  and Non-KPR → personal_loan are defensible mappings. OJK moved the data to
  `https://data.ojk.go.id/SJKPublic` (reachable, but the API behind it was not found on a
  first pass). Each bank also publishes its own SBDK page.

### 8.4 The 12 gaps that cannot be fixed by scraping

`short_term_finance` (×5), `unfunded_facility` (×5), `SG current_account`,
`IN current_account_fees`.

These are **priced per deal and published by nobody** — not banks, not regulators, not
aggregators. Trade finance is quoted per RFQ against tenor and collateral; L/C and guarantee
commissions are bilateral and confidential.

There is no scraper that fixes this. The only honest routes are the **advisor deal book**
(advisors log real negotiated quotes) or a **licensed feed** (ICC Trade Register, Wise).
Do not fill these with plausible numbers — see §2.1.

### 8.5 Calendly

**Option 2 (specialist call) no longer uses it.** It has its own scheduler:
`supabase/call_booking.sql` + `client/src/components/SlotPicker.jsx`. The client falls back
to the Calendly embed automatically if that migration has not been run, so this is safe to
deploy before running it — and safe to roll back by dropping the functions.

**Option 3 (named expert) still uses Calendly**, because an external advisor's real
Google/Outlook calendar is the one thing our own scheduler cannot see. A specialist call
sells "a FeeOptima specialist", so there is no individual calendar to read and team-level
working hours are the right model. An expert is a person, and booking them against hours we
do not control would double-book them. Moving Option 3 across needs per-advisor Google
Calendar OAuth — a real project, not an afternoon.

What the in-house one does that Calendly could not:

1. **Blackouts are honoured.** `booking_blackouts` (team-level, whole-day or a time range)
   removes slots from the list. Calendly's v2 API has no availability-override endpoint, so
   a window blocked in the admin portal stayed bookable in the widget — see
   `supabase/advisor_blackouts.sql`. That was a live double-booking risk.
2. **The time is known at booking time.** `leads.slot_start` / `slot_end` are written by
   `hold_call_slot()` itself. Nothing to resolve later, no `CALENDLY_TOKEN`, no nightly
   `sync-calendly.mjs`. The old path left rows with `booked = true` and no URI at all, and
   those times are unrecoverable.
3. **A real hold.** Option 2 takes the slot before payment, so an abandoned checkout used to
   park a Calendly booking with no money behind it — Calendly has no provisional hold.
   `hold_call_slot()` sets `hold_expires_at` (default 15 min). Availability counts confirmed
   bookings and LIVE holds, so an expired hold frees its slot with no cleanup job to run.
4. **Capacity is real.** `booking_hours.capacity` is how many calls the team takes at once.
   Two customers racing for the last seat are serialised by `pg_advisory_xact_lock` on the
   slot instant, and the loser is told to pick another — verified against a real Postgres.
5. **`.ics` instead of an email invite.** `client/src/lib/ics.js`, covered by
   `server/test/ics.test.js` (it is the only test runner in the repo). Its duration comes
   from the availability the customer chose from, so changing `slot_minutes` moves the
   invite with it.

**The picker is one card, not a grid.** A `<select>` of open times plus — only when we hold
no number for them — the WhatsApp number the specialist rings. The hold is taken when the
button is pressed, never on the select's `change`: a select fires that on every arrow key,
which on the old "pick = hold" contract would take and drop a hold per keystroke.

**Configuration lives in the database, not in code.** `booking_settings` (timezone, slot
length, notice, horizon, hold length) and `booking_hours` (weekday windows + capacity).
Both are seeded with **Mon–Fri 09:00–18:00 Asia/Singapore, one call at a time** — that is a
guess about the working day, not data. Change it. An empty `booking_hours` means an empty
picker.

**Still to do:** an admin UI for hours and blackouts (today they are edited in the SQL
editor); the WhatsApp reminder before the call; reschedule/cancel by the customer after
payment (today that is a support action, because a refund hangs off it).

### 8.6 Smaller items

- **Rotate the admin password.** `rohitjamwal` is burned and survives in ~6 historical
  commits. Scrub with `git filter-repo` before making the repo public.
- **Logo licensing unresolved.** Wikipedia hosts many bank logos under **fair use**, which
  does not cover commercial reuse. ~14 files were added recently;
  `scripts/fetch-bank-logos.mjs` prints full provenance for review.
- `EMAIL_FROM=hello@feeoptima.com` — that domain has **no DNS**, so no SPF/DKIM. Those
  emails are likely being rejected or spam-filed.
- `LegalPage.jsx:54` still says "negotiation concierge".
- `IN vehicle_loan` has one broken scraper source (pool not written so it cannot shrink).
- 5 banks still have no logo on purpose: Hong Leong Finance (SG — a *separate company* from
  Hong Leong Bank MY), MBSB, Thai Credit, CLICX (no article), Bank Muamalat (no infobox logo).

---

## 9. Command reference

```bash
npm run dev                  # server + client together
npm test --prefix server     # 62 tests, node:test
npm run build --prefix client

# Rate pipeline
npm run pool:th              # Bank of Thailand → 64 rows / 17 banks / 4 products
npm run pool:my              # Bank Negara Malaysia → 34 housing_loan rows
npm run scrape:pool          # 68 per-bank sources → data/rate-templates/scraped-<CC>.csv
npm run import:pool -- data/rate-templates/scraped-SG.csv
npm run wise:remit           # Wise comparison API → remit-<CC>.csv
npm run import:remit -- data/rate-templates/remit-SG.csv
npm run rates:stale          # find rates that need refreshing
npm run prune:pool           # remove generated rows superseded by real ones

# Utilities
node scripts/inspect-page.mjs <url>     # print every rate-bearing table — use this
                                        # BEFORE adding a scraper source, and count
                                        # the columns yourself. Never guess an index.
node scripts/fetch-bank-logos.mjs --dry
npm run create:admin
ALLOW_WEAK_PASSWORD=1 SUPPORT_PASSWORD='...' node scripts/create-support.mjs
```

---

## 10. Gotchas that cost real time

Each of these was discovered the hard way.

**React StrictMode double-invokes effects in dev.** A cleanup-based cancel flag aborts
in-flight work on the second pass and the reveal never loads. Use a `useRef` run-once guard.

**`sessionStorage` is per-origin AND per-tab.** `localStorage` is per-origin. Any hop across
Vercel aliases loses both. See §5.

**Sign-out must clear purchases.** `bb_reveal_sessions` in `localStorage` once survived
sign-out, so signing out and recalculating gave the paid reveal free. `AuthContext` now
calls `forgetPurchases()` on `signOut`, `signOutEverywhere`, **and** the `SIGNED_OUT` event.

**`checkoutReturn.js` stores a page id, never a URL** — storing a URL is an open-redirect.

**`counterparty` is a CURRENCY code (`USD`), never a country (`US`).** The seeder wrote
country codes and silently made all 150 rows unmatchable against the form's
`receive_currency`.

**A negative FX markup is real.** Some banks price *inside* the mid. `fx_spread_pct` is a
cost, so these are clamped to 0 — which understates how good the bank is, which understates
the saving quoted. That is the safe direction. **Dropping them would be far worse**: it
removes the cheapest providers and inflates every benchmark.

**The bank-logo carousel mirrors `public.banks` exactly** (same names, same
`display_order`), so every logo on the marquee is a bank a visitor can actually benchmark.
The rate pools reach wider than those 15, so extra logos live in a **separate reveal-only
list** (`EXTRA_LOGOS`). Do not merge them.

**Wikipedia rate-limits `api.php`.** Use `Special:FilePath` for downloads (it also renders
SVG→PNG) and put ≥2.5s between requests.

**`pdftotext -layout`** for deterministic PDF extraction — never a model summarising a PDF.
This caught a regulator deadline that search results reported as "one year" when the current
scheme says 90 days.

**zsh does not word-split unquoted variables.** `for c in "A B"; do set -- $c` gives
`$1="A B"`, not `$1=A $2=B`. Bit me; use a script instead of shell loops for this.

**A `flat` rate is not an effective rate.** On the same loan a flat rate reads about half as
large. Every Singapore car loan is quoted flat. `rate_type` must be carried and labelled.

**You cannot check whether a number is on WhatsApp.** Meta retired the On-Premises
`/v1/contacts` check on 23 Oct 2025 and the Cloud API ships no replacement on purpose — an
open registration check is a phone-number enumeration oracle. Third-party services that
offer it drive an unofficial WhatsApp Web client, break Meta's terms, and get numbers
banned. **Only a message proves it.** The app therefore asks the customer to *assert* the
number is on WhatsApp (a claim) and offers a one-tap `wa.me` link carrying a code (the
evidence). The claim must never be stored as verification — that is why
`supabase/whatsapp.sql` has three separate columns.

---

## 11. Working style expected here

- **Verify, don't assume.** Query the database, fetch the page, screenshot the render.
  Several bugs above were found only because output was checked rather than trusted.
- **When something cannot be done, say so plainly** and explain why, rather than
  substituting something that merely looks complete. Half this document is gaps.
- **Prefer failing loudly to degrading quietly.** A scraper that skips a broken source is
  right; one that guesses is not.
- **Comments explain *why*, especially where the obvious approach is wrong.** The codebase
  is written this way throughout — match it.
- The user rejected multiple-choice prompts earlier in this project; **present options in
  prose instead.**
