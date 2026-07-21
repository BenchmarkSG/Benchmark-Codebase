# BankBenchmark.sg — Prototype

Independent bank-benchmarking landing prototype for individuals, SMEs & corporates.
**React (Vite)** front end + **Express** back end.

## What's inside

- **Hero** — UOB-TMRW-style blue banner carousel (auto-slides, arrows + dots) with a
  fanned phone-app mockup stack. No bank names shown.
- **Inline benchmark calculator** (no popup) with two modes:
  - **Manual** — segment / product / variant (mortgage fixed-floating) / FX corridor /
    amount / tenor → instant savings, with the **winning bank masked** until a reveal CTA.
  - **Paste statement** — paste fee lines; the server parses & benchmarks each
    (transfer legs, FX margin, overdraft, loan) and totals the savings.
- **Detailed Feedback popup** — 3 tiers (Starter / Pro / Concierge) with a
  **"Request a Connection"** email capture (prototype: no mail backend).
- **How It Works**, **Partner Banks** marquee, Products, Real Savings, Individual/SME
  split, Why Choose Us, Negotiation Concierge, Founding Members, Footer.
- Theme: **white + blue + red** only.
- **Privacy-by-design**: no persistence; consent copy on the calculator.

See [scope.md](scope.md) for the strategy/critical analysis and [TESTING.md](TESTING.md)
for the SDLC test record.

## Run it

```bash
# 1. install everything
npm install                 # root (concurrently)
npm run install:all         # server + client deps

# 2. start both dev servers
npm run dev                 # Express :4000  +  Vite :5173
```

Open http://localhost:5173 — the Vite dev server proxies `/api/*` to the Express
server on port 4000.

### Run individually
```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET`  | `/api/reference` | Banks, products (+variants), FX corridors & segments |
| `POST` | `/api/benchmark` | `{ bank, product, variant, corridor, amount, tenorYears }` → instant masked savings |
| `POST` | `/api/parse` | `{ text }` → detected fee lines, each benchmarked + total saving |
| `POST` | `/api/reveal` | `{ email }` → stub lead capture (no persistence/mail) |
| `GET`  | `/api/health` | Health check |

Server code is split for testability: `data.js` (rate repository) → `benchmark.js`
(pure logic) → `app.js` (Express) → `index.js` (listen).

**Tests:** `cd server && npm test` → 23 unit + integration tests (`node:test`).

> All rates/figures are **illustrative** and for prototype/demo purposes only.
