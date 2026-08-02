/* -----------------------------------------------------------------------------
 * BankBenchmark.sg — rate data generator + seeder
 *
 * Generates INDICATIVE / SYNTHETIC benchmark data for the five product areas in
 * the product brief and writes it to Supabase:
 *   Q1 overdraft rates (local ccy + USD)          -> overdraft_rates
 *   Q2 cross-border remittance charges (out/in)   -> remittance_charges
 *   Q3 short-term loans (local + USD), import LC,
 *      export LC discounting                       -> loan_products
 *   Q4 negotiation thresholds (save 25k/yr/product)-> negotiation_thresholds
 *   Q5 the same, for SG / IN / MY / ID / TH        -> all tables, per country
 *
 * All figures are deterministic and clearly flagged is_indicative = true.
 * Replace with sourced/licensed data before treating as real published rates.
 *
 * Usage:
 *   1. Run supabase/rates_schema.sql AND supabase/product_rates.sql in your
 *      Supabase SQL editor first (this seeder writes to both).
 *   2. Set env vars (Supabase → Settings → API):
 *        export SUPABASE_URL="https://<ref>.supabase.co"
 *        export SUPABASE_SERVICE_ROLE_KEY="<service_role secret>"
 *   3. node scripts/seed-rates.mjs
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const DRY = process.argv.includes('--dry');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!url || !key)) {
  console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role, not anon).');
  console.error('  (Tip: run with --dry to preview the generated data without a database.)');
  process.exit(1);
}
const db = DRY ? null : createClient(url, key, { auth: { persistSession: false } });

// --- deterministic pseudo-random in [0,1) from a string seed -----------------
const unit = (seed) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// --- reference: countries -----------------------------------------------------
const COUNTRIES = [
  { code: 'SG', name: 'Singapore', currency: 'SGD', currency_symbol: 'S$', display_order: 1 },
  { code: 'IN', name: 'India', currency: 'INR', currency_symbol: '₹', display_order: 2 },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', currency_symbol: 'RM', display_order: 3 },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', currency_symbol: 'Rp', display_order: 4 },
  { code: 'TH', name: 'Thailand', currency: 'THB', currency_symbol: '฿', display_order: 5 },
];

// --- reference: top-15 banks per country (mix satisfies Q3's JP/IN/EU banks) --
const BANKS = {
  SG: [['DBS','local'],['POSB','local'],['OCBC','local'],['UOB','local'],['Standard Chartered','european'],['Citibank','foreign'],['HSBC','european'],['Maybank','foreign'],['Bank of China','foreign'],['CIMB','foreign'],['RHB','foreign'],['MUFG Bank','japanese'],['Mizuho','japanese'],['State Bank of India','indian'],['BNP Paribas','european']],
  IN: [['State Bank of India','local'],['HDFC Bank','local'],['ICICI Bank','local'],['Axis Bank','local'],['Kotak Mahindra Bank','local'],['Punjab National Bank','local'],['Bank of Baroda','local'],['Yes Bank','local'],['Standard Chartered','european'],['HSBC','european'],['Citibank','foreign'],['DBS Bank India','foreign'],['MUFG Bank','japanese'],['Deutsche Bank','european'],['BNP Paribas','european']],
  MY: [['Maybank','local'],['CIMB','local'],['Public Bank','local'],['RHB','local'],['Hong Leong Bank','local'],['AmBank','local'],['Bank Islam','local'],['Affin Bank','local'],['Standard Chartered','european'],['HSBC','european'],['OCBC','foreign'],['UOB','foreign'],['Bank of China','foreign'],['MUFG Bank','japanese'],['BNP Paribas','european']],
  ID: [['Bank Mandiri','local'],['Bank Central Asia','local'],['Bank Rakyat Indonesia','local'],['Bank Negara Indonesia','local'],['CIMB Niaga','local'],['Bank Danamon','local'],['Permata Bank','local'],['Panin Bank','local'],['Maybank Indonesia','foreign'],['OCBC Indonesia','foreign'],['UOB Indonesia','foreign'],['Standard Chartered','european'],['HSBC','european'],['MUFG Bank','japanese'],['BNP Paribas','european']],
  TH: [['Bangkok Bank','local'],['Kasikornbank','local'],['Siam Commercial Bank','local'],['Krungthai Bank','local'],['Bank of Ayudhya','local'],['TMBThanachart','local'],['Kiatnakin Phatra','local'],['LH Bank','local'],['UOB Thailand','foreign'],['CIMB Thai','foreign'],['Standard Chartered','european'],['HSBC','european'],['ICBC Thai','foreign'],['MUFG Bank','japanese'],['BNP Paribas','european']],
};

// Category pricing tilt: how a bank tends to price vs the country base (± p.a.).
const CAT_ADJ = { local: 0.35, foreign: -0.15, european: -0.25, japanese: -0.35, indian: 0.15, digital: -0.6 };

// Country base rates (% p.a.) for local-currency products.
const BASE = {
  SG: { od: 6.6, stl: 5.0 }, IN: { od: 9.6, stl: 8.2 }, MY: { od: 6.9, stl: 5.4 },
  ID: { od: 9.9, stl: 8.6 }, TH: { od: 7.1, stl: 5.6 },
};
const USD = { od: 7.9, stl: 6.6, exportDiscount: 7.2 };

// Improvement a benchmarked SME can realistically negotiate, per product (Q4).
const IMPROVEMENT = {
  overdraft: 0.015, remittance: 0.007, short_term_local: 0.012,
  short_term_usd: 0.010, import_lc: 0.006, export_lc_discount: 0.011,
};

// Individual products (product_rates table). rateType 'apr' = lower better,
// 'yield' = higher better. Base rate per country (% p.a.).
const IND_PRODUCTS = {
  mortgage:      { rateType: 'apr',   base: { SG: 3.5, IN: 8.8, MY: 4.2, ID: 9.0, TH: 6.0 } },
  personal_loan: { rateType: 'apr',   base: { SG: 8.5, IN: 12.5, MY: 7.5, ID: 12.0, TH: 9.0 } },
  savings:       { rateType: 'yield', base: { SG: 1.8, IN: 3.2, MY: 2.5, ID: 3.5, TH: 1.5 } },
  fixed_deposit: { rateType: 'yield', base: { SG: 3.0, IN: 6.8, MY: 3.2, ID: 5.5, TH: 1.8 } },
};

function build() {
  const countries = COUNTRIES;
  const banks = [], overdraft = [], remittance = [], loans = [], thresholds = [], productRates = [];

  for (const c of COUNTRIES) {
    const ccy = c.currency;
    (BANKS[c.code] || []).forEach(([name, category], i) => {
      const id = `${c.code.toLowerCase()}-${slug(name)}`;
      banks.push({ id, country_code: c.code, name, category, display_order: i + 1 });
      const adj = CAT_ADJ[category] ?? 0;
      const v = (s) => (unit(id + s) - 0.5) * 1.4; // ±0.7 spread

      // Q1 — overdraft (local + USD)
      const odMin = round(BASE[c.code].od + adj + v('od'), 2);
      overdraft.push({ bank_id: id, currency: ccy, rate_min: odMin, rate_max: round(odMin + 0.8 + unit(id + 'ods') * 1.2, 2) });
      const odUsdMin = round(USD.od + adj + v('odu'), 2);
      overdraft.push({ bank_id: id, currency: 'USD', rate_min: odUsdMin, rate_max: round(odUsdMin + 0.7 + unit(id + 'odus') * 1.1, 2) });

      // Q3 — short-term loans + trade finance
      loans.push({ bank_id: id, product_type: 'short_term_local', currency: ccy, interest_rate: round(BASE[c.code].stl + adj + v('stl'), 2), tenor_months: 3, arrangement_fee: round(0.25 + unit(id + 'stlf') * 0.4, 2), other_fees: round(unit(id + 'stlo') * 0.15, 2), notes: 'Working-capital limit against current assets' });
      loans.push({ bank_id: id, product_type: 'short_term_usd', currency: 'USD', interest_rate: round(USD.stl + adj + v('stu'), 2), tenor_months: 3, arrangement_fee: round(0.25 + unit(id + 'stuf') * 0.4, 2), other_fees: round(unit(id + 'stuo') * 0.15, 2), notes: 'USD working-capital, SOFR-linked' });
      loans.push({ bank_id: id, product_type: 'import_lc', currency: 'USD', interest_rate: null, tenor_months: 3, arrangement_fee: round(0.125 + unit(id + 'ilc') * 0.25, 3), other_fees: round(0.05 + unit(id + 'ilco') * 0.1, 3), notes: 'Issuance commission per quarter + handling' });
      loans.push({ bank_id: id, product_type: 'export_lc_discount', currency: 'USD', interest_rate: round(USD.exportDiscount + adj + v('elc'), 2), tenor_months: 3, arrangement_fee: round(0.1 + unit(id + 'elcf') * 0.2, 3), other_fees: round(0.05 + unit(id + 'elco') * 0.1, 3), notes: 'Discounting of USD export L/C (e.g. issued by Citi US)' });

      // Q2 — remittance (outward to US, inward from UK), notional 1,000,000 local
      remittance.push({ bank_id: id, direction: 'outward', counterparty: 'US', amount: 1000000, amount_currency: ccy, upfront_fee: round(25 + unit(id + 'rou') * 35), intermediary_fee: round(18 + unit(id + 'roi') * 22), lifting_fee: round(10 + unit(id + 'rol') * 15), fee_currency: 'USD', fx_spread_pct: round(0.35 + unit(id + 'rox') * 0.95, 2) });
      remittance.push({ bank_id: id, direction: 'inward', counterparty: 'UK', amount: 1000000, amount_currency: ccy, upfront_fee: round(10 + unit(id + 'riu') * 20), intermediary_fee: round(15 + unit(id + 'rii') * 20), lifting_fee: round(8 + unit(id + 'ril') * 12), fee_currency: 'USD', fx_spread_pct: round(0.3 + unit(id + 'rix') * 0.85, 2) });

      // Individual products (mortgage, personal loan, savings, FD)
      for (const [product, def] of Object.entries(IND_PRODUCTS)) {
        const isYield = def.rateType === 'yield';
        // For a return, keener banks (foreign/digital) pay MORE; for a cost, they charge less.
        const catAdj = (CAT_ADJ[category] ?? 0) * (isYield ? -1 : 1);
        const jitter = (unit(id + product) - 0.5) * 1.2;
        productRates.push({
          country_code: c.code, product, bank: name, currency: ccy,
          rate: round(def.base[c.code] + catAdj + jitter, 2), rate_type: def.rateType,
        });
      }
    });

    // Q4 — negotiation thresholds (target: save 25,000 local per annum per product)
    const target = 25000;
    for (const [product, impr] of Object.entries(IMPROVEMENT)) {
      const switching_cost = round(3000 + unit(c.code + product) * 5000);
      const switching_weeks = 4 + Math.floor(unit(c.code + product + 'w') * 6);
      const worthwhile = target * 2 > switching_cost; // <2yr payback
      thresholds.push({
        country_code: c.code, product, target_saving: target, saving_currency: ccy,
        threshold_amount: Math.round(target / impr),
        switching_cost, switching_weeks, worthwhile,
        notes: `Negotiating clears ${target} ${ccy}/yr once facility/volume exceeds threshold (assumes ~${(impr * 100).toFixed(2)}% achievable improvement).`,
      });
    }
  }
  return { countries, banks, overdraft, remittance, loans, thresholds, productRates };
}

async function wipe() {
  // Delete children before parents (FKs). Rate tables have updated_at.
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
  console.log(`  ✓ ${table.padEnd(24)} ${rows.length} rows`);
}

async function main() {
  console.log('→ Generating indicative benchmark data…');
  const data = build();

  if (DRY) {
    console.log('  (dry run — nothing written)\n');
    for (const [k, v] of Object.entries(data)) console.log(`  ${k.padEnd(12)} ${v.length} rows`);
    console.log('\n  Sample overdraft:', JSON.stringify(data.overdraft[0]));
    console.log('  Sample loan:     ', JSON.stringify(data.loans.find((l) => l.product_type === 'import_lc')));
    console.log('  Sample threshold:', JSON.stringify(data.thresholds[0]));
    console.log('  Sample savings:  ', JSON.stringify(data.productRates.find((p) => p.product === 'savings')));
    return;
  }

  console.log('→ Clearing existing rows…');
  await wipe();
  console.log('→ Inserting…');
  await insertAll(data.countries, 'countries');
  await insertAll(data.banks, 'banks');
  await insertAll(data.overdraft, 'overdraft_rates');
  await insertAll(data.remittance, 'remittance_charges');
  await insertAll(data.loans, 'loan_products');
  await insertAll(data.thresholds, 'negotiation_thresholds');
  await insertAll(data.productRates, 'product_rates');
  console.log('✓ Done. All figures are indicative — replace with sourced data for production.');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
