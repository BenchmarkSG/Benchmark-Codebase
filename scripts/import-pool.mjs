/* -----------------------------------------------------------------------------
 * BankBenchmark.sg — manual per-bank rate importer (W1)
 *
 * Writes REAL per-bank rates into public.product_rates from a CSV you assemble
 * from a published-but-not-machine-accessible source (e.g. India's monthly RBI
 * MCLR release, Indonesia's OJK SBDK). Robust and source-agnostic — no scraper to
 * break. Rows are marked is_indicative = false (real), same as the BOT/BNM pools.
 *
 * CSV columns (header row required):
 *   country,product,bank,rate[,currency][,rate_type][,variant][,rate_basis][,rate_low][,rate_high]
 *   • country   SG | IN | MY | ID | TH
 *   • product   housing_loan | personal_loan | vehicle_loan | fixed_deposit |
 *               current_account | overdraft | short_term_finance | unfunded_facility
 *   • bank      display name (quote it if it contains a comma)
 *   • rate      % p.a. (> 0) — as the lender publishes it. "6.25", "8.00-9.50" (a
 *               range: stored as the midpoint, shown as ~8.75%) and "from 7.5"
 *               (a floor: shown as "from 7.50%") are all accepted; see
 *               lib/rate-text.mjs for what is read and supabase/rate_basis.sql
 *               for why.
 *   • rate_basis / rate_low / rate_high  optional — set by scrape-pool.mjs.
 *               Giving rate_low AND rate_high makes the row a range (rate may
 *               then be blank or must equal the midpoint).
 *   • currency  optional — defaults to the country's local currency
 *   • rate_type optional — defaults from the product (apr for loans/OD, yield for
 *               deposits/current account)
 *   • variant   optional — funded/unfunded facility type
 *
 * For each (country, currency, product) present in the CSV it REPLACES the pool
 * (delete + insert), so re-importing an updated file is idempotent. Groups with no
 * valid row are left untouched.
 *
 * With --merge it instead REPLACES ONLY THE BANKS NAMED IN THE FILE and leaves
 * every other bank in the pool alone. This is how hand-entered rows (a bank
 * that blocks the scraper, read off its page by a person) live alongside the
 * nightly scraped rows: the nightly job merges, so it never wipes a manual
 * row, and a manual file never wipes the scraped banks. A bank that should
 * leave a pool is removed in the admin portal, not by omission from a file.
 *
 * Usage:
 *   npm run import:pool -- path/to/rates.csv            (needs SUPABASE creds)
 *   npm run import:pool -- path/to/rates.csv --merge    (upsert the named banks only)
 *   npm run import:pool:dry -- path/to/rates.csv        (validate + preview, no DB)
 * --------------------------------------------------------------------------- */
import { readFileSync } from 'node:fs';
import { parseRate, formatRate } from './lib/rate-text.mjs';
import { getProduct, isProductInCountry } from '../server/benchmark.js';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MERGE = args.includes('--merge');
const file = args.find((a) => !a.startsWith('--'));
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CCY = { SG: 'SGD', IN: 'INR', MY: 'MYR', ID: 'IDR', TH: 'THB' };
const APR = new Set(['housing_loan', 'personal_loan', 'vehicle_loan', 'overdraft', 'short_term_finance', 'unfunded_facility']);
const YIELD = new Set(['fixed_deposit', 'current_account']);
const PRODUCTS = new Set([...APR, ...YIELD]);
/* How the number is expressed. 'apr' is an annualised cost, 'yield' a return,
   and 'flat' interest charged on the ORIGINAL sum for the whole tenor — the way
   Singapore car loans are advertised, and roughly half the effective rate for
   the same money. A pool may not mix them (see the check below): comparing a
   flat rate against an effective one makes the flat lender look twice as cheap
   as it is. */
const RATE_TYPES = new Set(['apr', 'yield', 'flat']);

const round3 = (n) => Math.round(n * 1000) / 1000;
const BASES = new Set(['exact', 'range', 'from']);
const numOrNaN = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v));

// Minimal CSV parser (handles quoted fields with commas / doubled quotes).
function parseCSV(text) {
  const rows = [];
  const parseLine = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') q = true;
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return { header: [], rows };
  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  for (const line of lines.slice(1)) {
    const cells = parseLine(line);
    const o = {}; header.forEach((h, i) => (o[h] = cells[i]));
    rows.push(o);
  }
  return { header, rows };
}

function build(raw) {
  const out = [], errors = [];
  let blank = 0;
  raw.forEach((r, i) => {
    const ln = i + 2; // 1-based + header
    const country = String(r.country || '').toUpperCase().trim();
    const product = String(r.product || '').toLowerCase().trim();
    const bank = String(r.bank || '').replace(/\s+/g, ' ').trim();
    let rateText = String(r.rate ?? '').trim();
    if (!CCY[country]) return errors.push(`line ${ln}: unknown country "${r.country}"`);
    if (!PRODUCTS.has(product)) return errors.push(`line ${ln}: unknown product "${r.product}"`);
    // A product can be confined to certain markets (`onlyCountries` in the
    // catalog) because it doesn't exist elsewhere — Thai current accounts pay no
    // credit interest, Indian ones may not by law. Rows for a pair the app
    // doesn't offer are invisible until someone widens the catalog, and then
    // they're suddenly live and wrong. Refuse them at the door.
    if (!isProductInCountry(getProduct(product), country)) {
      return errors.push(`line ${ln}: ${product} isn't offered in ${country} (see onlyCountries in server/benchmark.js)`);
    }
    if (!bank) return errors.push(`line ${ln}: missing bank`);

    // How the lender published the figure. Either the rate cell says it
    // ("8.00-9.50", "from 7.5") or the explicit columns do; they must agree.
    const basisCol = String(r.rate_basis || '').toLowerCase().trim() || undefined;
    if (basisCol && !BASES.has(basisCol)) return errors.push(`line ${ln}: rate_basis must be exact | range | from (got "${r.rate_basis}")`);
    // Floating pricing: what the loan tracks and the bank's margin over it
    // (supabase/floating_rate.sql). All three columns or none — half a formula
    // is worse than none, because `rate` would then look fixed. When the rate
    // cell is left empty the sum fills it, which is how a lender publishes it:
    // the spread is the quoted part, the all-in figure is arithmetic.
    const idxName = String(r.rate_index || '').trim();
    const idxValue = numOrNaN(r.index_value), spread = numOrNaN(r.spread);
    const floating = idxName !== '' || Number.isFinite(idxValue) || Number.isFinite(spread);
    let floatRate = null;
    if (floating) {
      if (!idxName || !Number.isFinite(idxValue) || !Number.isFinite(spread)) {
        return errors.push(`line ${ln}: a floating rate needs rate_index, index_value AND spread (got "${r.rate_index || ''}", ${r.index_value ?? ''}, ${r.spread ?? ''})`);
      }
      floatRate = round3(idxValue + spread);
      if (rateText === '') rateText = String(floatRate);
    }

    const lo = numOrNaN(r.rate_low), hi = numOrNaN(r.rate_high);
    let parsed;
    if (Number.isFinite(lo) || Number.isFinite(hi)) {
      if (!(Number.isFinite(lo) && Number.isFinite(hi))) return errors.push(`line ${ln}: rate_low and rate_high must both be given`);
      if (basisCol && basisCol !== 'range') return errors.push(`line ${ln}: rate_low/rate_high given but rate_basis is "${basisCol}"`);
      if (!(lo > 0 && hi > lo)) return errors.push(`line ${ln}: need 0 < rate_low < rate_high (got ${lo}, ${hi})`);
      parsed = { basis: 'range', value: round3((lo + hi) / 2), low: round3(lo), high: round3(hi) };
      if (rateText !== '' && Math.abs(Number(rateText) - parsed.value) > 0.001) {
        return errors.push(`line ${ln}: rate "${rateText}" is not the midpoint of ${lo}–${hi} (${parsed.value})`);
      }
    } else {
      // An empty rate is a template row nobody has filled in yet (see
      // make-import-template.mjs), not a mistake — count it and move on. A
      // non-empty value that isn't a readable rate IS a mistake.
      if (rateText === '' || /^not found$/i.test(rateText)) { blank++; return; }
      try { parsed = parseRate(rateText, { basis: basisCol }); }
      catch (e) { return errors.push(`line ${ln}: rate — ${e.message}`); }
    }
    // `rate` stays the comparable figure, so it must equal the parts it claims
    // to be made of — otherwise the pool and the formula on screen disagree.
    if (floating && Math.abs(parsed.value - floatRate) > 0.001) {
      return errors.push(`line ${ln}: rate ${parsed.value} ≠ index_value + spread (${idxValue} + ${spread} = ${floatRate})`);
    }

    const currency = String(r.currency || CCY[country]).toUpperCase().trim();
    const rate_type = String(r.rate_type || (YIELD.has(product) ? 'yield' : 'apr')).toLowerCase().trim();
    if (!RATE_TYPES.has(rate_type)) {
      return errors.push(`line ${ln}: rate_type must be ${[...RATE_TYPES].join(' | ')} (got "${r.rate_type}")`);
    }
    const variant = r.variant ? String(r.variant).trim() : null;
    out.push({ country_code: country, product, bank, currency, rate: parsed.value, rate_type, variant, is_indicative: false,
      rate_basis: parsed.basis, rate_low: parsed.low, rate_high: parsed.high,
      rate_index: floating ? idxName : null,
      index_value: floating ? round3(idxValue) : null,
      spread: floating ? round3(spread) : null });
  });
  return { out, errors, blank };
}

async function main() {
  if (!file) { console.error('✗ Usage: npm run import:pool -- <path/to/rates.csv> [--dry]'); process.exit(1); }
  let text; try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`✗ Cannot read ${file}: ${e.message}`); process.exit(1); }

  const { rows } = parseCSV(text);
  const { out, errors, blank } = build(rows);
  if (errors.length) { console.error(`✗ ${errors.length} invalid row(s):`); errors.slice(0, 20).forEach((e) => console.error('  ' + e)); }
  if (blank) console.log(`  ${blank} row(s) still blank — skipped (fill the rate column to include them).`);
  if (!out.length) { console.error('✗ No valid rows to import.'); process.exit(1); }

  // Group = the (country, currency, product) scope we replace.
  const groups = new Map();
  for (const r of out) {
    const k = `${r.country_code}|${r.currency}|${r.product}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }
  // A pool is one comparison, so every rate in it must mean the same thing. A
  // flat rate beside an effective one would hand the win to whichever lender
  // happened to quote flat, by a factor of about two.
  const mixed = [...groups].filter(([, rs]) => new Set(rs.map((r) => r.rate_type)).size > 1);
  if (mixed.length) {
    console.error('✗ A pool cannot mix rate types — flat and effective rates are not comparable:');
    for (const [k, rs] of mixed) {
      const kinds = [...new Set(rs.map((r) => r.rate_type))].join(' + ');
      console.error(`  ${k.replace(/\|/g, ' ')} — ${kinds}`);
    }
    process.exit(1);
  }

  console.log(`→ ${out.length} valid rows across ${groups.size} (country,currency,product) group(s)${MERGE ? ' — merge: only the banks named here are replaced' : ' — each pool is replaced wholesale'}:`);
  for (const [k, rs] of groups) {
    const nb = rs.filter((r) => r.rate_basis !== 'exact').length;
    console.log(`   ${k.replace(/\|/g, ' ')} — ${rs.length} banks${nb ? ` (${nb} published as a range or floor)` : ''}`);
  }

  if (DRY) {
    console.log('  (dry run — nothing written)');
    for (const r of out.slice(0, 8)) console.log(`    ${r.country_code} ${r.product.padEnd(14)} ${r.bank.padEnd(24)} ${formatRate(r.rate, r.rate_basis)}`);
    if (out.length > 8) console.log(`    … ${out.length - 8} more`);
    return;
  }
  if (!url || !key) { console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry).'); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // The basis columns arrive with supabase/rate_basis.sql. Until it has been run
  // the table can still take exact rows (the columns are simply not sent), but
  // a range or a floor has nowhere to record what it is. Such pools are held
  // back — checked BEFORE their rows are deleted, so a missing migration can
  // never empty a pool — while the exact-only pools in the same file still
  // load. The run then exits non-zero so a nightly job shows red.
  const probeCol = async (col) => {
    const { error } = await db.from('product_rates').select(col).limit(1);
    // PostgREST reports an unknown column as 42703, or PGRST204 from its cache.
    if (error && (error.code === '42703' || error.code === 'PGRST204')) return false;
    if (error) { console.error(`✗ probe ${col}: ${error.message}`); process.exit(1); }
    return true;
  };
  const hasBasis = await probeCol('rate_basis');
  const hasFloat = await probeCol('rate_index');
  if (!hasBasis) console.log('  ! product_rates has no rate_basis column yet — run supabase/rate_basis.sql in the Supabase SQL editor.');
  if (!hasFloat) console.log('  ! product_rates has no rate_index column yet — run supabase/floating_rate.sql in the Supabase SQL editor.');

  // Strip what the database can't store yet, so an un-migrated column never
  // blocks the rows that don't need it. A row that DOES need it is held back
  // instead of being written without the half that gives it meaning.
  const strip = (r) => {
    const out = { ...r };
    if (!hasBasis) { delete out.rate_basis; delete out.rate_low; delete out.rate_high; }
    if (!hasFloat) { delete out.rate_index; delete out.index_value; delete out.spread; }
    return out;
  };
  const heldBack = [];

  for (const [k, rows] of groups) {
    const [country_code, currency, product] = k.split('|');
    const needsBasis = !hasBasis && rows.filter((r) => r.rate_basis !== 'exact').length;
    const needsFloat = !hasFloat && rows.filter((r) => r.rate_index).length;
    if (needsBasis || needsFloat) {
      heldBack.push(k);
      const why = needsBasis
        ? `${needsBasis} row(s) are a range or a floor; held back until rate_basis.sql has run`
        : `${needsFloat} row(s) are floating (index + spread); held back until floating_rate.sql has run`;
      console.error(`  ✗ ${k.replace(/\|/g, ' ')} — ${why} (nothing deleted)`);
      continue;
    }
    const rs = rows.map(strip);
    let del = db.from('product_rates').delete()
      .eq('country_code', country_code).eq('currency', currency).eq('product', product);
    // Merge: clear only the (bank, variant) pairs this file carries. A variant
    // is part of the key — an import-finance row must not remove an LC row.
    if (MERGE) {
      del = del.in('bank', [...new Set(rs.map((r) => r.bank))]);
      const variants = [...new Set(rs.map((r) => r.variant))];
      if (variants.length === 1) del = variants[0] == null ? del.is('variant', null) : del.eq('variant', variants[0]);
    }
    const { error: delErr } = await del;
    if (delErr) { console.error(`✗ delete ${k}: ${delErr.message}`); process.exit(1); }
    const { error: insErr } = await db.from('product_rates').insert(rs);
    if (insErr) { console.error(`✗ insert ${k}: ${insErr.message}`); process.exit(1); }
    console.log(`  ✓ ${k.replace(/\|/g, ' ')} — ${rs.length} rows${MERGE ? ' merged' : ''}`);
  }
  const written = out.length - heldBack.reduce((n, k) => n + groups.get(k).length, 0);
  console.log(`✓ Imported ${written} real per-bank rows across ${groups.size - heldBack.length} group(s).`);
  if (heldBack.length) {
    console.error(`✗ ${heldBack.length} pool(s) held back — run the migration named above, then re-import this file.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
