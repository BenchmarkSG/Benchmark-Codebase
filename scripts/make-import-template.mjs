/* -----------------------------------------------------------------------------
 * FeeOptima — fill-ready CSV templates for the real-rate importer
 *
 * The robust path to real per-bank rates (W1i in DATA_GAPS.md) is a human
 * reading a published rate sheet into a CSV, because no regulator in SG/IN/ID
 * exposes per-bank product pricing over an API. This generates that CSV already
 * populated with the correct country, product and bank roster, so the only
 * column left to fill is `rate` — and a typo can't invent a bank the app has
 * never heard of.
 *
 * Rows land as REAL (is_indicative = false) once loaded:
 *     node scripts/make-import-template.mjs SG
 *     …fill the rate column…
 *     npm run import:pool:dry -- data/rate-templates/SG.csv    # validate
 *     npm run import:pool     -- data/rate-templates/SG.csv    # write
 *
 * Blank rates are skipped by the importer, so a partially filled file is fine —
 * but note it REPLACES the pool for each (country, product) it contains, so
 * fill every bank you intend to keep before loading.
 *
 * Write the rate the way the lender publishes it: "6.25" for a figure,
 * "8.00-9.50" for a range (stored as the midpoint, shown as ~8.75%), "from 7.5"
 * for a floor (shown as "from 7.50%"). The three trailing columns are optional
 * — rate_low/rate_high may carry a range's ends instead of the rate cell.
 *
 * Usage:
 *   node scripts/make-import-template.mjs <CC> [product ...]
 *     CC        SG | IN | MY | ID | TH
 *     product   defaults to the published retail set (see PUBLISHED below)
 * --------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync } from 'node:fs';
import { BANKS, COUNTRIES } from './lib/roster.mjs';
import { getProduct, isProductInCountry } from '../server/benchmark.js';

// Products a bank actually publishes a rate for. Trade finance (short-term
// finance, unfunded facilities) and negotiated SME overdraft spreads are priced
// bilaterally and appear on no public rate sheet — a template for them would
// only invite guesswork, so they're opt-in by name rather than default.
const PUBLISHED = ['housing_loan', 'personal_loan', 'vehicle_loan', 'fixed_deposit', 'current_account'];
const DIRECTORY_ONLY = new Set(['fintech']);
const OUT_DIR = 'data/rate-templates';

const [cc, ...requested] = process.argv.slice(2);
const country = COUNTRIES.find((c) => c.code === (cc || '').toUpperCase());
if (!country) {
  console.error(`Usage: node scripts/make-import-template.mjs <${COUNTRIES.map((c) => c.code).join('|')}> [product ...]`);
  process.exit(1);
}

const products = (requested.length ? requested : PUBLISHED).filter((p) => {
  if (!getProduct(p)) { console.warn(`  ! skipping unknown product "${p}"`); return false; }
  return true;
});

const banks = (BANKS[country.code] || []).filter(([, cat]) => !DIRECTORY_ONLY.has(cat));
const lines = ['country,product,bank,rate,currency,rate_type,rate_basis,rate_low,rate_high'];
const counts = {};
for (const product of products) {
  if (!isProductInCountry(product, country.code)) continue; // e.g. IN pays no current-account interest
  const { rateType } = getProduct(product);
  counts[product] = banks.length;
  for (const [name] of banks) {
    // Quote the bank so a comma in a legal name can't shift the columns.
    lines.push(`${country.code},${product},"${name}",,${country.currency},${rateType},,,`);
  }
}

if (!Object.keys(counts).length) {
  console.error(`✗ No requested product is offered in ${country.name}.`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const file = `${OUT_DIR}/${country.code}.csv`;
writeFileSync(file, `${lines.join('\n')}\n`);

console.log(`✓ ${file} — ${lines.length - 1} rows to fill (${banks.length} providers)`);
for (const [p, n] of Object.entries(counts)) console.log(`    ${p.padEnd(18)} ${n}`);
console.log(`\n  Fill the "rate" column from each bank's published rate sheet ("6.25", "8.00-9.50" or "from 7.5"), then:`);
console.log(`    npm run import:pool:dry -- ${file}`);
