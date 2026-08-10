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

// --- reference: top-15 banks per country -------------------------------------
// Per-country provider directory. category drives both the display grouping and
// the pricing tilt. 'fintech' entries are directory-only (see DIRECTORY_ONLY):
// they appear as a provider option but aren't put in the benchmark rate pool.
const BANKS = {
  SG: [['DBS','local'],['POSB','local'],['OCBC','local'],['UOB','local'],['Standard Chartered','european'],['Citibank','foreign'],['HSBC','european'],['Maybank','foreign'],['Bank of China','foreign'],['CIMB','foreign'],['RHB','foreign'],['Trust Bank','digital'],['GXS Bank','digital'],['MariBank','digital'],['State Bank of India','indian']],

  // India — top public-sector, private, and fintechs
  IN: [
    ['State Bank of India','public'],['Punjab National Bank','public'],['Bank of Baroda','public'],['Canara Bank','public'],['Union Bank of India','public'],['Bank of India','public'],['Indian Bank','public'],['Central Bank of India','public'],['Indian Overseas Bank','public'],['UCO Bank','public'],
    ['HDFC Bank','private'],['ICICI Bank','private'],['Axis Bank','private'],['Kotak Mahindra Bank','private'],['IndusInd Bank','private'],['Yes Bank','private'],['IDFC First Bank','private'],['Federal Bank','private'],['RBL Bank','private'],['Bandhan Bank','private'],
    ['Paytm','fintech'],['PhonePe','fintech'],['Google Pay','fintech'],['Razorpay','fintech'],['CRED','fintech'],['BharatPe','fintech'],['Groww','fintech'],['Zerodha','fintech'],['Slice','fintech'],['Jupiter','fintech'],
    ['Standard Chartered','european'],['HSBC','european'],['Citibank','foreign'],['DBS Bank India','foreign'],
  ],

  // Malaysia — established banks + the new digital banks
  MY: [
    ['Maybank','local'],['CIMB','local'],['Public Bank','local'],['RHB','local'],['Hong Leong Bank','local'],['AmBank','local'],['Bank Islam','local'],['Affin Bank','local'],['Alliance Bank','local'],['Bank Rakyat','local'],
    ['GXBank','digital'],['Boost Bank','digital'],['AEON Bank','digital'],['KAF Digital Bank','digital'],['Ryt Bank','digital'],
    ['OCBC','foreign'],['UOB','foreign'],['Bank of China','foreign'],['Standard Chartered','european'],['HSBC','european'],
  ],

  // Indonesia — top banks + digital / neobanks
  ID: [
    ['Bank Mandiri','local'],['Bank Central Asia','local'],['Bank Rakyat Indonesia','local'],['Bank Negara Indonesia','local'],['Bank Tabungan Negara','local'],['CIMB Niaga','local'],['Bank Danamon','local'],['Panin Bank','local'],['OCBC NISP','local'],['Permata Bank','local'],
    ['Bank Jago','digital'],['SeaBank','digital'],['Allo Bank','digital'],['blu by BCA Digital','digital'],['Jenius (BTPN)','digital'],['Bank Neo Commerce','digital'],['LINE Bank','digital'],['TMRW by UOB','digital'],['Superbank','digital'],['Krom Bank','digital'],
    ['Maybank Indonesia','foreign'],['Standard Chartered','european'],['HSBC','european'],
  ],

  // Thailand — commercial banks + digital / virtual banks
  TH: [
    ['Bangkok Bank','local'],['Kasikornbank','local'],['Siam Commercial Bank','local'],['Krungthai Bank','local'],['Bank of Ayudhya','local'],['TMBThanachart','local'],['Kiatnakin Phatra','local'],['CIMB Thai','local'],['Government Savings Bank','local'],['UOB Thailand','foreign'],
    ['LINE BK','digital'],['Dime!','digital'],['SCBX Virtual Bank','digital'],['Krungthai-Gulf Virtual Bank','digital'],['TrueMoney','fintech'],
    ['Standard Chartered','european'],['HSBC','european'],['ICBC Thai','foreign'],
  ],
};

// Category pricing tilt: how a bank tends to price vs the country base (± p.a.).
const CAT_ADJ = { local: 0.35, foreign: -0.15, european: -0.25, japanese: -0.35, indian: 0.15, digital: -0.6, public: 0.2, private: 0.3, fintech: -0.5 };

// Categories listed as a provider option but NOT benchmarked (no published pool).
const DIRECTORY_ONLY = new Set(['fintech']);

const FUNDED = ['import_finance', 'export_finance', 'supplier_finance', 'bill_discounting'];
const UNFUNDED = ['lc', 'bg', 'sblc'];

// Unified rate pool config. base = local-currency % per country; usd = USD %.
// rateType 'apr' (lower better) | 'yield' (higher better). variants split a
// product into sub-pools (funded / unfunded facility types).
const RATE_PRODUCTS = [
  { product: 'housing_loan',       rateType: 'apr',   ccy: ['local'],        base: { SG: 3.5, IN: 8.8, MY: 4.2, ID: 9.0, TH: 6.0 } },
  { product: 'personal_loan',      rateType: 'apr',   ccy: ['local'],        base: { SG: 8.5, IN: 12.5, MY: 7.5, ID: 12.0, TH: 9.0 } },
  { product: 'vehicle_loan',       rateType: 'apr',   ccy: ['local'],        base: { SG: 3.2, IN: 9.5, MY: 3.8, ID: 8.5, TH: 5.0 } },
  { product: 'fixed_deposit',      rateType: 'yield', ccy: ['local'],        base: { SG: 3.0, IN: 6.8, MY: 3.2, ID: 5.5, TH: 1.8 } },
  { product: 'current_account',    rateType: 'yield', ccy: ['local'],        base: { SG: 0.8, IN: 3.0, MY: 1.5, ID: 2.5, TH: 0.5 } },
  { product: 'overdraft',          rateType: 'apr',   ccy: ['local', 'USD'], base: { SG: 6.6, IN: 9.6, MY: 6.9, ID: 9.9, TH: 7.1 }, usd: 7.9 },
  { product: 'short_term_finance', rateType: 'apr',   ccy: ['local', 'USD'], base: { SG: 5.0, IN: 8.2, MY: 5.4, ID: 8.6, TH: 5.6 }, usd: 6.6,
    variants: FUNDED, variantAdj: { import_finance: 0, export_finance: -0.1, supplier_finance: 0.15, bill_discounting: -0.2 } },
  { product: 'unfunded_facility',  rateType: 'apr',   ccy: ['USD'],          usd: 1.0,
    variants: UNFUNDED, variantAdj: { lc: -0.2, bg: 0, sblc: 0.2 } },
];

// Negotiation-threshold products (admin data) → achievable improvement per annum.
const IMPROVEMENT = {
  overdraft: 0.015, short_term_finance: 0.012, unfunded_facility: 0.006,
  cross_border: 0.007, housing_loan: 0.004, personal_loan: 0.010,
};

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
        const isYield = p.rateType === 'yield';
        const catTilt = catAdj * (isYield ? -1 : 1); // keener banks pay more / charge less
        for (const mode of p.ccy) {
          const currency = mode === 'USD' ? 'USD' : ccyLocal;
          const baseRate = mode === 'USD' ? p.usd : p.base[c.code];
          if (baseRate == null) continue;
          for (const v of p.variants || [null]) {
            const vAdj = v && p.variantAdj ? (p.variantAdj[v] || 0) : 0;
            const jitter = (unit(id + p.product + currency + (v || '')) - 0.5) * 1.2;
            productRates.push({
              country_code: c.code, product: p.product, bank: name, currency,
              rate: round(baseRate + catTilt + vAdj + jitter, 3), rate_type: p.rateType, variant: v,
            });
          }
        }
      }

      // Cross-border remittance (outgoing to US, incoming from UK), notional 1,000,000 local
      remittance.push({ bank_id: id, direction: 'outgoing', counterparty: 'US', amount: 1000000, amount_currency: ccyLocal, upfront_fee: round(25 + unit(id + 'rou') * 35), intermediary_fee: round(18 + unit(id + 'roi') * 22), lifting_fee: round(10 + unit(id + 'rol') * 15), fee_currency: 'USD', fx_spread_pct: round(0.35 + unit(id + 'rox') * 0.95, 2), settlement_time_hours: round(6 + unit(id + 'rot') * 66) });
      remittance.push({ bank_id: id, direction: 'incoming', counterparty: 'UK', amount: 1000000, amount_currency: ccyLocal, upfront_fee: round(10 + unit(id + 'riu') * 20), intermediary_fee: round(15 + unit(id + 'rii') * 20), lifting_fee: round(8 + unit(id + 'ril') * 12), fee_currency: 'USD', fx_spread_pct: round(0.3 + unit(id + 'rix') * 0.85, 2), settlement_time_hours: round(2 + unit(id + 'rit') * 46) });
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
