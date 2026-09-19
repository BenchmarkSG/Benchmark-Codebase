/* -----------------------------------------------------------------------------
 * BankBenchmark.sg — rate data generator + seeder (product model v2)
 *
 * Generates INDICATIVE / SYNTHETIC benchmark data and writes it to Supabase:
 *   • product_rates — the unified rate pool for every rate product, split by
 *     currency + variant (housing/personal/vehicle loan, fixed deposit, current
 *     account, overdraft, short-term finance [funded], unfunded facility).
 *   • remittance_charges — cross-border cost + settlement time (out/in).
 *   • negotiation_thresholds — admin reference data.
 *
 * All figures are deterministic and clearly flagged is_indicative = true.
 * Replace with sourced/licensed data before treating as real published rates.
 *
 * Usage:
 *   1. Run these SQL files first (Supabase → SQL editor), in order:
 *        rates_schema.sql · admin.sql · product_rates.sql · product_model_v2.sql
 *   2. Set env vars (Supabase → Settings → API):
 *        export SUPABASE_URL="https://<ref>.supabase.co"
 *        export SUPABASE_SERVICE_ROLE_KEY="<service_role secret>"
 *   3. node scripts/seed-rates.mjs        (add --dry to preview only)
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
// The product catalog is the single source of truth for which markets a product
// is offered in. Importing it here means the generator can't drift from what the
// API enforces — the previous split is how India ended up seeded with
// current-account credit interest that the RBI prohibits banks from paying.
import { PRODUCTS, getProduct, isProductInCountry } from '../server/benchmark.js';

const DRY = process.argv.includes('--dry');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!url || !key)) {
  console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role, not anon).');
  console.error('  (Tip: run with --dry to preview the generated data without a database.)');
  process.exit(1);
}
const db = DRY ? null : createClient(url, key, { auth: { persistSession: false } });

// The rate model — bases, category tilts, jitter — lives in one place so the
// gap filler (scripts/fill-gaps.mjs) writes the SAME number into the same pool.
// See scripts/lib/rate-model.mjs for why that matters.
import {
  COUNTRIES, BANKS, CAT_ADJ, DIRECTORY_ONLY, FUNDED, UNFUNDED,
  NO_SYNTHETIC, RATE_PRODUCTS, indicativeRate, round, slug, unit,
} from './lib/rate-model.mjs';

// Negotiation-threshold products (admin data) → achievable improvement per annum.
const IMPROVEMENT = {
  overdraft: 0.015, short_term_finance: 0.012, unfunded_facility: 0.006,
  cross_border: 0.007, housing_loan: 0.004, personal_loan: 0.010,
};

// Fail loudly if the generator and the catalog have drifted apart — a renamed
// product would otherwise seed a pool nothing reads, and a mismatched rateType
// would seed a pool scored the wrong way round (best = cheapest vs highest).
function checkCatalog() {
  const problems = [];
  for (const p of RATE_PRODUCTS) {
    const meta = getProduct(p.product);
    if (!meta) { problems.push(`'${p.product}' is not in the product catalog`); continue; }
    if (meta.rateType !== p.rateType) {
      problems.push(`'${p.product}' rateType is '${p.rateType}' here but '${meta.rateType}' in the catalog`);
    }
    for (const code of Object.keys(p.base || {})) {
      if (!isProductInCountry(meta, code)) {
        problems.push(`'${p.product}' has a base rate for ${code}, but the catalog doesn't offer it there`);
      }
    }
  }
  // The other direction: a rate product in the catalog that nothing seeds would
  // simply show "no benchmark data" forever, with no clue why.
  const covered = new Set(RATE_PRODUCTS.map((p) => p.product));
  for (const meta of PRODUCTS) {
    if (meta.family !== 'rate' || covered.has(meta.id)) continue;
    const why = NO_SYNTHETIC.get(meta.id);
    if (why) console.warn(`• skipping '${meta.id}' — ${why}`);
    else problems.push(`'${meta.id}' is a rate product in the catalog but nothing seeds it`);
  }
  if (problems.length) {
    console.error('✗ Generator is out of step with server/benchmark.js:');
    for (const m of problems) console.error(`  - ${m}`);
    process.exit(1);
  }
}

function build() {
  const banks = [], remittance = [], thresholds = [], productRates = [];

  for (const c of COUNTRIES) {
    const ccyLocal = c.currency;
    (BANKS[c.code] || []).forEach(([name, category], i) => {
      const id = `${c.code.toLowerCase()}-${slug(name)}`;
      banks.push({ id, country_code: c.code, name, category, display_order: i + 1 });
      // Fintechs/wallets are pickable as "your provider" but don't publish a
      // comparable lending/deposit pool, so they're excluded from benchmarking.
      if (DIRECTORY_ONLY.has(category)) return;
      const catAdj = CAT_ADJ[category] ?? 0;

      // Unified rate pool
      for (const p of RATE_PRODUCTS) {
        // The catalog decides where a product exists. Skipping here is what stops
        // a base rate for a market that bars the product from being written.
        if (!isProductInCountry(getProduct(p.product), c.code)) continue;
        for (const mode of p.ccy) {
          const currency = mode === 'USD' ? 'USD' : ccyLocal;
          if ((mode === 'USD' ? p.usd : p.base[c.code]) == null) continue;
          for (const v of p.variants || [null]) {
            productRates.push({
              country_code: c.code, product: p.product, bank: name, currency,
              rate: indicativeRate({
                bankId: id, category, product: p.product, currency, variant: v,
                countryCode: c.code, isUsd: mode === 'USD',
              }),
              rate_type: p.rateType, variant: v,
            });
          }
        }
      }

      /* Cross-border remittance, notional 1,000,000 local.
         `counterparty` is the CURRENCY on the other side, never a country: the
         corridor filter in getCrossBorderCostPool compares it with the form's
         receive_currency, and import-remit.mjs validates it as /^[A-Z]{3}$/.
         Seeding 'US'/'UK' here made every seeded row unmatchable. */
      remittance.push({ bank_id: id, direction: 'outgoing', counterparty: 'USD', amount: 1000000, amount_currency: ccyLocal, upfront_fee: round(25 + unit(id + 'rou') * 35), intermediary_fee: round(18 + unit(id + 'roi') * 22), lifting_fee: round(10 + unit(id + 'rol') * 15), fee_currency: 'USD', fx_spread_pct: round(0.35 + unit(id + 'rox') * 0.95, 2), settlement_time_hours: round(6 + unit(id + 'rot') * 66) });
      remittance.push({ bank_id: id, direction: 'incoming', counterparty: 'GBP', amount: 1000000, amount_currency: ccyLocal, upfront_fee: round(10 + unit(id + 'riu') * 20), intermediary_fee: round(15 + unit(id + 'rii') * 20), lifting_fee: round(8 + unit(id + 'ril') * 12), fee_currency: 'USD', fx_spread_pct: round(0.3 + unit(id + 'rix') * 0.85, 2), settlement_time_hours: round(2 + unit(id + 'rit') * 46) });
    });

    // Negotiation thresholds (target: save 25,000 local per annum per product)
    const target = 25000;
    for (const [product, impr] of Object.entries(IMPROVEMENT)) {
      const switching_cost = round(3000 + unit(c.code + product) * 5000);
      const switching_weeks = 4 + Math.floor(unit(c.code + product + 'w') * 6);
      thresholds.push({
        country_code: c.code, product, target_saving: target, saving_currency: ccyLocal,
        threshold_amount: Math.round(target / impr),
        switching_cost, switching_weeks,
        worthwhile: switching_cost < target, // one-off cost recouped within a year
        notes: `Negotiating clears ${target} ${ccyLocal}/yr once volume exceeds the threshold (~${(impr * 100).toFixed(2)}% achievable).`,
      });
    }
  }
  return { countries: COUNTRIES, banks, remittance, thresholds, productRates };
}

async function wipe() {
  // Delete children before parents (FKs).
  for (const t of ['negotiation_thresholds', 'overdraft_rates', 'remittance_charges', 'loan_products', 'product_rates']) {
    const { error } = await db.from(t).delete().gte('updated_at', '1970-01-01');
    if (error) throw new Error(`wipe ${t}: ${error.message}`);
  }
  await db.from('banks').delete().neq('id', '__none__');
  await db.from('countries').delete().neq('code', '__none__');
}

async function insertAll(rows, table, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
  console.log(`  ✓ ${table.padEnd(22)} ${rows.length} rows`);
}

async function main() {
  checkCatalog(); // exits non-zero if this file has drifted from the catalog
  console.log('→ Generating indicative benchmark data…');
  const data = build();

  if (DRY) {
    console.log('  (dry run — nothing written)\n');
    for (const [k, v] of Object.entries(data)) console.log(`  ${k.padEnd(14)} ${v.length} rows`);
    console.log('\n  Sample unfunded: ', JSON.stringify(data.productRates.find((p) => p.product === 'unfunded_facility')));
    console.log('  Sample FD:       ', JSON.stringify(data.productRates.find((p) => p.product === 'fixed_deposit')));
    console.log('  Sample funded:   ', JSON.stringify(data.productRates.find((p) => p.product === 'short_term_finance')));
    console.log('  Sample remittance:', JSON.stringify(data.remittance[0]));
    return;
  }

  console.log('→ Clearing existing rows…');
  await wipe();
  console.log('→ Inserting…');
  await insertAll(data.countries, 'countries');
  await insertAll(data.banks, 'banks');
  await insertAll(data.remittance, 'remittance_charges');
  await insertAll(data.thresholds, 'negotiation_thresholds');
  await insertAll(data.productRates, 'product_rates');
  console.log('✓ Done. All figures are indicative — replace with sourced data for production.');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
