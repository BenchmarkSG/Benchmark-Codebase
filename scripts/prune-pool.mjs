/* -----------------------------------------------------------------------------
 * FeeOptima — delete rate rows for products a country doesn't actually have
 *
 * The catalog decides which products exist in which market: a product carrying
 * `onlyCountries` is offered nowhere else, usually because the underlying
 * product doesn't exist there or can't pay/charge what we benchmark. Rows can
 * still end up in `product_rates` for those pairs — a loader that predates the
 * restriction, or a feed that maps a near-miss series onto the wrong product.
 *
 * They are invisible (the app never queries a product it doesn't offer in that
 * country) and therefore never get noticed, but they are wrong, and one line in
 * the catalog is all it takes to put them in front of a user. This prunes them.
 *
 *   npm run prune:pool -- --dry     list what would go (safe, no credentials needed
 *                                   beyond a read key)
 *   npm run prune:pool              delete it (needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * Prints every pair it removes, with counts, so the deletion is auditable.
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { PRODUCTS, isProductInCountry } from '../server/benchmark.js';

const DRY = process.argv.includes('--dry');
const url = process.env.SUPABASE_URL;
const writeKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const readKey = writeKey || process.env.SUPABASE_ANON_KEY;

if (!url || !readKey) {
  console.error('✗ Set SUPABASE_URL and a key (SERVICE_ROLE to delete, ANON to --dry).');
  process.exit(1);
}
if (!DRY && !writeKey) {
  console.error('✗ Deleting needs SUPABASE_SERVICE_ROLE_KEY. Re-run with --dry to preview.');
  process.exit(1);
}

const db = createClient(url, DRY ? readKey : writeKey, { auth: { persistSession: false } });

const { data: countries, error: cErr } = await db.from('countries').select('code');
if (cErr) { console.error('✗', cErr.message); process.exit(1); }

// Every (country, product) pair the app actually offers.
const offered = new Set();
for (const { code } of countries || []) {
  for (const p of PRODUCTS) if (isProductInCountry(p, code)) offered.add(`${code}|${p.id}`);
}

// Page through the table — a plain select caps out well below a full pool.
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from('product_rates').select('id, country_code, product, bank, is_indicative')
    .range(from, from + 999);
  if (error) { console.error('✗', error.message); process.exit(1); }
  rows.push(...(data || []));
  if (!data || data.length < 1000) break;
}

const orphans = rows.filter((r) => !offered.has(`${r.country_code}|${r.product}`));
if (!orphans.length) {
  console.log(`✓ Nothing to prune — all ${rows.length} rows belong to a product their country offers.`);
  process.exit(0);
}

const byPair = orphans.reduce((m, r) => {
  const k = `${r.country_code} ${r.product}`;
  m[k] = m[k] || { real: 0, ind: 0 };
  r.is_indicative ? m[k].ind++ : m[k].real++;
  return m;
}, {});

console.log(`${DRY ? 'Would prune' : 'Pruning'} ${orphans.length} row(s) not offered in their country:`);
for (const [pair, n] of Object.entries(byPair).sort()) {
  console.log(`  ${pair.padEnd(32)} real ${String(n.real).padStart(3)}  indicative ${String(n.ind).padStart(3)}`);
}

if (DRY) { console.log('\n(dry run — nothing deleted)'); process.exit(0); }

// Delete by primary key in batches, so one bad id can't widen the blast radius.
let gone = 0;
for (let i = 0; i < orphans.length; i += 200) {
  const ids = orphans.slice(i, i + 200).map((r) => r.id);
  const { error } = await db.from('product_rates').delete().in('id', ids);
  if (error) { console.error('✗', error.message); process.exit(1); }
  gone += ids.length;
}
console.log(`\n✓ Deleted ${gone} row(s).`);
