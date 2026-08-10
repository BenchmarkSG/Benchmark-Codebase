/* -----------------------------------------------------------------------------
 * BankBenchmark.sg — Malaysia PER-BANK rate pool from BNM (real regulator data)
 *
 * Bank Negara Malaysia publishes each bank's rates via a keyless open API. The
 * one clean per-bank *product* rate it exposes is the indicative effective
 * lending rate (for a standard housing loan), so this writes a real per-bank
 * `housing_loan` pool into public.product_rates — like Thailand's BOT pool.
 *
 *   /base-rate → per bank: base_rate (BR), base_lending_rate (BLR),
 *                indicative_eff_lending_rate → housing_loan
 *
 * BR and BLR are reference floors, not what customers pay, so they are NOT mapped
 * to products. Personal loan / overdraft / FD have no per-bank BNM source and
 * stay synthetic (see DATA_GAPS.md).
 *
 * Scope & safety:
 *   • Replaces ONLY the MY/MYR housing_loan rows; every other product/country
 *     is left untouched.
 *   • If BNM returns nothing, it writes NOTHING (never empties the pool).
 *   • No API key needed.
 *
 * Usage:
 *   npm run pool:my        fetch + replace the MY housing_loan pool  (needs SUPABASE creds)
 *   npm run pool:my:dry    fetch + preview only, no DB write
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const DRY = process.argv.includes('--dry');
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BNM_HEADERS = { Accept: 'application/vnd.BNM.API.v1+json', 'User-Agent': 'BankBenchmark/1.0' };

const COUNTRY = 'MY', CURRENCY = 'MYR';
const POOL_PRODUCTS = ['housing_loan'];

const num = (v) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n; };
const round3 = (n) => Math.round(n * 1000) / 1000;

async function bnmGet(path) {
  const res = await fetch(`https://api.bnm.gov.my/public${path}`, { headers: BNM_HEADERS });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function buildRows() {
  const data = (await bnmGet('/base-rate'))?.data || [];
  const out = [];
  for (const b of data) {
    const bank = String(b.bank_name || '').replace(/\s+/g, ' ').trim();
    const v = num(b.indicative_eff_lending_rate);
    // Drop non-positive rates (e.g. Agrobank reports 0 — no standard housing loan);
    // a 0% would wrongly become the "best" in a lower-is-better pool.
    if (bank && v != null && v > 0) {
      out.push({ country_code: COUNTRY, product: 'housing_loan', bank, currency: CURRENCY, rate: round3(v), rate_type: 'apr', is_indicative: false });
    }
  }
  return { out, fetched: data.length };
}

async function main() {
  console.log('→ Fetching BNM per-bank base rates…');
  const { out, fetched } = await buildRows();
  console.log(`  built ${out.length} housing_loan rows (of ${fetched} banks)`);

  if (!out.length) { console.log('• BNM returned no rows — leaving product_rates unchanged.'); return; }

  if (DRY) {
    console.log('  (dry run — nothing written)');
    console.log('  banks:', out.map((r) => `${r.bank} ${r.rate}`).join(', '));
    return;
  }

  if (!url || !key) { console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry).'); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Replace only the MY/MYR housing_loan rows (guarded by out.length above so a
  // failed fetch never wipes the pool). Not transactional, but this runs once
  // daily off-peak and rates are cached 5 min, so the sub-second gap is immaterial.
  const { error: delErr } = await db.from('product_rates').delete()
    .eq('country_code', COUNTRY).eq('currency', CURRENCY).in('product', POOL_PRODUCTS);
  if (delErr) { console.error('✗ delete:', delErr.message); process.exit(1); }

  for (let i = 0; i < out.length; i += 500) {
    const { error } = await db.from('product_rates').insert(out.slice(i, i + 500));
    if (error) { console.error('✗ insert:', error.message); process.exit(1); }
  }
  console.log(`✓ Replaced MY/MYR housing_loan pool with ${out.length} real BNM rows.`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
