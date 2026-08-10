/* -----------------------------------------------------------------------------
 * BankBenchmark.sg — manual per-bank rate importer (W1)
 *
 * Writes REAL per-bank rates into public.product_rates from a CSV you assemble
 * from a published-but-not-machine-accessible source (e.g. India's monthly RBI
 * MCLR release, Indonesia's OJK SBDK). Robust and source-agnostic — no scraper to
 * break. Rows are marked is_indicative = false (real), same as the BOT/BNM pools.
 *
 * CSV columns (header row required):
 *   country,product,bank,rate[,currency][,rate_type][,variant]
 *   • country   SG | IN | MY | ID | TH
 *   • product   housing_loan | personal_loan | vehicle_loan | fixed_deposit |
 *               current_account | overdraft | short_term_finance | unfunded_facility
 *   • bank      display name (quote it if it contains a comma)
 *   • rate      % p.a. (> 0)
 *   • currency  optional — defaults to the country's local currency
 *   • rate_type optional — defaults from the product (apr for loans/OD, yield for
 *               deposits/current account)
 *   • variant   optional — funded/unfunded facility type
 *
 * For each (country, currency, product) present in the CSV it REPLACES the pool
 * (delete + insert), so re-importing an updated file is idempotent. Groups with no
 * valid row are left untouched.
 *
 * Usage:
 *   npm run import:pool -- path/to/rates.csv        (needs SUPABASE creds)
 *   npm run import:pool:dry -- path/to/rates.csv    (validate + preview, no DB)
 * --------------------------------------------------------------------------- */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const file = args.find((a) => !a.startsWith('--'));
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CCY = { SG: 'SGD', IN: 'INR', MY: 'MYR', ID: 'IDR', TH: 'THB' };
const APR = new Set(['housing_loan', 'personal_loan', 'vehicle_loan', 'overdraft', 'short_term_finance', 'unfunded_facility']);
const YIELD = new Set(['fixed_deposit', 'current_account']);
const PRODUCTS = new Set([...APR, ...YIELD]);

const round3 = (n) => Math.round(n * 1000) / 1000;

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
  raw.forEach((r, i) => {
    const ln = i + 2; // 1-based + header
    const country = String(r.country || '').toUpperCase().trim();
    const product = String(r.product || '').toLowerCase().trim();
    const bank = String(r.bank || '').replace(/\s+/g, ' ').trim();
    const rate = Number(r.rate);
    if (!CCY[country]) return errors.push(`line ${ln}: unknown country "${r.country}"`);
    if (!PRODUCTS.has(product)) return errors.push(`line ${ln}: unknown product "${r.product}"`);
    if (!bank) return errors.push(`line ${ln}: missing bank`);
    if (!Number.isFinite(rate) || rate <= 0) return errors.push(`line ${ln}: rate must be a number > 0 (got "${r.rate}")`);
    const currency = String(r.currency || CCY[country]).toUpperCase().trim();
    const rate_type = String(r.rate_type || (YIELD.has(product) ? 'yield' : 'apr')).toLowerCase().trim();
    const variant = r.variant ? String(r.variant).trim() : null;
    out.push({ country_code: country, product, bank, currency, rate: round3(rate), rate_type, variant, is_indicative: false });
  });
  return { out, errors };
}

async function main() {
  if (!file) { console.error('✗ Usage: npm run import:pool -- <path/to/rates.csv> [--dry]'); process.exit(1); }
  let text; try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`✗ Cannot read ${file}: ${e.message}`); process.exit(1); }

  const { rows } = parseCSV(text);
  const { out, errors } = build(rows);
  if (errors.length) { console.error(`✗ ${errors.length} invalid row(s):`); errors.slice(0, 20).forEach((e) => console.error('  ' + e)); }
  if (!out.length) { console.error('✗ No valid rows to import.'); process.exit(1); }

  // Group = the (country, currency, product) scope we replace.
  const groups = new Map();
  for (const r of out) {
    const k = `${r.country_code}|${r.currency}|${r.product}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }
  console.log(`→ ${out.length} valid rows across ${groups.size} (country,currency,product) group(s):`);
  for (const [k, rs] of groups) console.log(`   ${k.replace(/\|/g, ' ')} — ${rs.length} banks`);

  if (DRY) {
    console.log('  (dry run — nothing written)');
    console.log('  sample:', JSON.stringify(out.slice(0, 3)));
    return;
  }
  if (!url || !key) { console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry).'); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  for (const [k, rs] of groups) {
    const [country_code, currency, product] = k.split('|');
    const { error: delErr } = await db.from('product_rates').delete()
      .eq('country_code', country_code).eq('currency', currency).eq('product', product);
    if (delErr) { console.error(`✗ delete ${k}: ${delErr.message}`); process.exit(1); }
    const { error: insErr } = await db.from('product_rates').insert(rs);
    if (insErr) { console.error(`✗ insert ${k}: ${insErr.message}`); process.exit(1); }
    console.log(`  ✓ ${k.replace(/\|/g, ' ')} — ${rs.length} rows`);
  }
  console.log(`✓ Imported ${out.length} real per-bank rows across ${groups.size} group(s).`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
