/* -----------------------------------------------------------------------------
 * FeeOptima — export the admin portal's tables to a single .xlsx
 *
 * For handing to someone who will fill in and verify rates away from the portal.
 * The sheets mirror what the portal shows, column for column, plus four blank
 * columns per row for the evidence a figure needs before it can be loaded:
 *
 *     Verified rate · Source URL · As of · Notes
 *
 * Rule that governs everything here: a rate is only loadable if someone can
 * point at the page it came from. The blank columns are not bureaucracy — a
 * number without a URL cannot be checked, and we have already had two rounds of
 * plausible-looking figures that turned out to be wrong (see
 * data/rate-templates/SG_gpt-REVIEW.md).
 *
 * Filled sheets come back in via scripts/import-pool.mjs — the "Product rates"
 * sheet is deliberately in that importer's column order, so it can be saved as
 * CSV and loaded without rearranging anything.
 *
 *   npm run export:admin            → data/admin-export-<date>.xlsx
 *   npm run export:admin -- <path>  → write somewhere else
 * --------------------------------------------------------------------------- */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { PRODUCTS, isProductInCountry, getProduct } from '../server/benchmark.js';
import { buildXlsx } from './lib/xlsx.mjs';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!url || !key) { console.error('✗ Set SUPABASE_URL and a Supabase key.'); process.exit(1); }
const db = createClient(url, key, { auth: { persistSession: false } });

const today = new Date().toISOString().slice(0, 10);
const outFile = process.argv[2] || `data/admin-export-${today}.xlsx`;

/** Page through a table — a plain select silently caps well below a full pool.
    `selects` may list progressively narrower column sets: a database that
    predates a migration is missing those columns, and exporting what it does
    have beats refusing to export at all. */
async function all(table, ...selects) {
  for (const [i, select] of selects.entries()) {
    const rows = [];
    let failed = false;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(select).range(from, from + 999);
      if (error) {
        const unknownColumn = error.code === '42703' || error.code === 'PGRST204';
        if (unknownColumn && i < selects.length - 1) { failed = true; break; }
        console.error(`✗ ${table}: ${error.message}`);
        process.exit(1);
      }
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    if (!failed) {
      if (i > 0) console.log(`  ! ${table}: some columns don't exist yet — exported without them (run the pending supabase/*.sql).`);
      return rows;
    }
  }
  return [];
}

const BLANKS = ['Verified rate', 'Source URL', 'As of (YYYY-MM-DD)', 'Notes'];
const date = (v) => (v ? String(v).slice(0, 10) : '');

// ---- 1. Product rates — the portal's "Product rates" table ------------------
const RATE_CORE = 'country_code, product, variant, bank, currency, rate, rate_type, is_indicative, updated_at';
const rates = await all('product_rates',
  `${RATE_CORE}, rate_basis, rate_low, rate_high, rate_index, index_value, spread`,
  `${RATE_CORE}, rate_basis, rate_low, rate_high`,
  RATE_CORE);
rates.sort((a, b) => `${a.country_code}${a.product}${a.bank}`.localeCompare(`${b.country_code}${b.product}${b.bank}`));

/* Two sheets, not one. The portal shows sourced and generated rows together,
   but they are opposite jobs: 165 real figures to re-check against the bank's
   page, versus 1,000-odd placeholders that are never served and exist only so
   the app renders. Handing someone a single 1,200-row sheet buries the work
   that matters. Columns A-M are exactly import-pool.mjs's header, so either
   sheet can be saved as CSV and loaded without rearranging anything. */
const RATE_HEADER = ['country', 'product', 'bank', 'rate', 'currency', 'rate_type', 'rate_basis',
  'rate_low', 'rate_high', 'rate_index', 'index_value', 'spread', 'variant', 'Last verified', ...BLANKS];
const RATE_WIDTHS = [9, 18, 28, 9, 9, 10, 11, 10, 10, 12, 12, 9, 12, 13, 13, 46, 18, 40];
const rateRow = (r) => [
  r.country_code, r.product, r.bank, Number(r.rate), r.currency, r.rate_type,
  r.rate_basis || 'exact', r.rate_low ?? '', r.rate_high ?? '',
  r.rate_index || '', r.index_value ?? '', r.spread ?? '', r.variant || '',
  date(r.updated_at), '', '', '', '',
];

const ratesSheet = {
  name: 'Sourced rates (verify)',
  header: RATE_HEADER, widths: RATE_WIDTHS,
  rows: rates.filter((r) => !r.is_indicative).map(rateRow),
};
const generatedSheet = {
  name: 'Generated (not shown)',
  header: RATE_HEADER, widths: RATE_WIDTHS,
  rows: rates.filter((r) => r.is_indicative).map(rateRow),
};

// ---- 2. Missing pools — what has no sourced data at all --------------------
const live = new Set(rates.filter((r) => !r.is_indicative).map((r) => `${r.country_code}|${r.product}`));
const countries = (await all('countries', 'code, name')).sort((a, b) => a.code.localeCompare(b.code));
const missing = [];
for (const c of countries) {
  for (const p of PRODUCTS) {
    if (!isProductInCountry(p, c.code)) continue;
    if (live.has(`${c.code}|${p.id}`)) continue;
    missing.push([c.code, c.name, p.id, p.label, p.segments.join(' + '), p.unit, '', '', '', '']);
  }
}
const missingSheet = {
  name: 'Missing pools',
  header: ['country', 'country name', 'product', 'product name', 'segment', 'unit', ...BLANKS],
  widths: [9, 14, 20, 26, 16, 20, 13, 46, 18, 40],
  rows: missing,
};

// ---- 3. Remittance — the portal's "Remittance charges" table ---------------
const remit = await all('remittance_charges',
  'direction, counterparty, amount, amount_currency, upfront_fee, intermediary_fee, lifting_fee, fee_currency, fx_spread_pct, is_indicative, updated_at, banks!inner(name, country_code)');
const remitSheet = {
  name: 'Remittance',
  header: ['country', 'bank', 'direction', 'to/from', 'amount', 'amount ccy',
    'upfront fee', 'intermediary fee', 'lifting fee', 'fee ccy', 'FX spread %',
    'Generated? (not real data)', 'Last verified', ...BLANKS],
  widths: [9, 26, 11, 10, 12, 11, 12, 16, 12, 9, 12, 22, 13, 13, 46, 18, 40],
  rows: remit.map((r) => [
    r.banks?.country_code || '', r.banks?.name || '', r.direction, r.counterparty,
    r.amount ?? '', r.amount_currency || '', r.upfront_fee ?? '', r.intermediary_fee ?? '',
    r.lifting_fee ?? '', r.fee_currency || '', r.fx_spread_pct ?? '',
    r.is_indicative ? 'GENERATED — replace' : '', date(r.updated_at), '', '', '', '',
  ]),
};

// ---- 4. How to use ---------------------------------------------------------
const readme = {
  name: 'How to use',
  header: ['Column', 'What to put in it'],
  widths: [30, 110],
  rows: [
    ['country', 'SG, IN, MY, ID or TH. Leave as-is on existing rows.'],
    ['product', 'The product id, exactly as written (housing_loan, fixed_deposit, …). Do not rename.'],
    ['bank', "The lender's name as it appears on its own website."],
    ['rate', 'The number only — 3.7, not "3.7% p.a.". Leave blank if you could not find it.'],
    ['rate_type', 'apr = annualised cost · yield = a return · flat = interest on the ORIGINAL sum (SG car loans).'],
    ['', 'A pool may not mix these. A flat rate next to an effective one makes the flat lender look twice as cheap.'],
    ['rate_basis', 'exact = one published figure · range = fill rate_low and rate_high instead · from = an advertised floor.'],
    ['rate_low / rate_high', 'Both, only when the lender published a range. `rate` is then their midpoint.'],
    ['rate_index / index_value / spread', 'Floating rates only: e.g. "3M SORA", 1.85, 0.30. All three or none; rate must equal index_value + spread.'],
    ['Sheet: Sourced rates', 'Real figures already in the product. Check each against the bank\u2019s own page and fill in the four evidence columns.'],
    ['Sheet: Generated (not shown)', 'Invented placeholders. Never served to users \u2014 ignore unless you want to replace one with a real figure.'],
    ['Source URL', 'REQUIRED. The page the figure is printed on — the bank’s own site, not a comparison site.'],
    ['', 'Comparison sites have twice given us figures that disagreed with the bank (MoneySmart had DBS at 2.84% against an actual 3.22%).'],
    ['As of', 'The date you read it. A rate with no date cannot be checked later.'],
    ['Notes', 'Anything conditional: minimum balance, promo end date, tier, "e-FD only", "salary credit required".'],
    ['', ''],
    ['Sheet: Missing pools', 'Country/product combinations with no sourced data at all. Anything filled here is new coverage.'],
    ['Sheet: Remittance', 'FX spread is scraped already. The blocker is the FEES — the four tariffs in data/rate-templates/remit-fees-TODO.md.'],
    ['', ''],
    ['Loading it back', 'Columns A-M of "Product rates" are the importer’s format. Save that sheet as CSV and run:'],
    ['', 'npm run import:pool -- <file>.csv --merge'],
    ['', 'Every row is checked on load: unknown product, a rate that is not a rate, a mixed pool, or a floating rate whose parts do not add up are all rejected.'],
  ],
};

const sheets = [ratesSheet, missingSheet, remitSheet, generatedSheet, readme];
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, buildXlsx(sheets));

console.log(`✓ ${outFile}`);
for (const s of sheets) console.log(`   ${s.name.padEnd(16)} ${String(s.rows.length).padStart(4)} rows`);
const gen = rates.filter((r) => r.is_indicative).length;
console.log(`\n   ${rates.length - gen} sourced rate(s), ${gen} generated placeholder(s), ${missing.length} pool(s) with nothing at all.`);
