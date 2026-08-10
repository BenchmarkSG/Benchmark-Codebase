/* -----------------------------------------------------------------------------
 * BankBenchmark.sg — Thailand PER-BANK rate pool from BOT (real regulator data)
 *
 * Unlike the synthetic seeder, this pulls each bank's published loan & deposit
 * rates from the Bank of Thailand and writes them into public.product_rates, so
 * the TH benchmark pool for these products is REAL (like Malaysia/BNM), not
 * indicative:
 *
 *   /LoanRate/v2/loan_rate/        per bank → MLR→housing_loan, MRR→personal_loan,
 *                                             MOR→overdraft
 *   /DepositRate/v2/deposit_rate/  per bank → 12M fixed→fixed_deposit,
 *                                             savings→current_account (credit-interest proxy)
 *
 * Scope & safety:
 *   • Domestic commercial banks only (foreign bank branches are excluded — they
 *     aren't retail options and carry outlier rates).
 *   • Replaces ONLY the THB rows for these four products each run; USD overdraft
 *     rows and every other country/product are left untouched.
 *   • If BOT returns nothing (holiday / outage / bad token), it writes NOTHING —
 *     the existing pool is never emptied.
 *
 * Auth: BOT_API_KEY = your subscribed app's Client ID (sent in the Authorization
 * header; no secret needed). Same credential as `npm run market:fetch`.
 *
 * Usage:
 *   npm run pool:th        fetch + replace the TH pool  (needs BOT_API_KEY + SUPABASE creds)
 *   npm run pool:th:dry    fetch + preview only, no DB write
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const DRY = process.argv.includes('--dry');
const BOT_KEY = process.env.BOT_API_KEY || '';
const BOT_BASE = process.env.BOT_API_BASE || 'https://gateway.api.bot.or.th';
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COUNTRY = 'TH', CURRENCY = 'THB';
const POOL_PRODUCTS = ['housing_loan', 'personal_loan', 'overdraft', 'fixed_deposit', 'current_account'];

const num = (v) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n; };
const round3 = (n) => Math.round(n * 1000) / 1000;
const asArray = (d) => (Array.isArray(d) ? d : d ? [d] : []);
const isDomestic = (r) => /registered in Thailand/i.test(r?.bank_type_name_eng || '');
const latestPeriod = (rows) => rows.reduce((m, r) => (String(r.period) > m ? String(r.period) : m), '');
// Keep BOT's real English names; tidy whitespace, a leading "The", and trailing
// corporate-form suffixes ("… Public Company Limited", "… Co., Ltd.") for display.
const cleanBank = (s) => String(s || '')
  .replace(/\s+/g, ' ')
  .replace(/^the\s+/i, '')
  .replace(/\s*(public company limited|company limited|company ltd\.?|co\.,? ?ltd\.?|pcl\.?|ltd\.?)\s*$/i, '')
  .trim();

async function botGet(path, params) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  const res = await fetch(`${BOT_BASE}${path}${qs}`, {
    headers: { Authorization: BOT_KEY, 'X-IBM-Client-Id': BOT_KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}
function botWindow(days = 14) {
  const end = new Date(), start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start_period: fmt(start), end_period: fmt(end) };
}

// Rows for the latest available period, domestic banks only.
function latestDomesticRows(detail) {
  const dom = asArray(detail).filter(isDomestic);
  const latest = latestPeriod(dom);
  return { rows: dom.filter((r) => String(r.period) === latest), period: latest };
}

async function buildRows() {
  const win = botWindow();
  const out = [];

  // Loan: per-bank MLR→housing, MRR→personal, MOR→overdraft.
  const loan = latestDomesticRows((await botGet('/LoanRate/v2/loan_rate/', win))?.result?.data?.data_detail);
  for (const r of loan.rows) {
    const bank = cleanBank(r.bank_name_eng);
    if (!bank) continue;
    const add = (product, field) => {
      const v = num(r[field]);
      // Skip 0/blank — a 0% would wrongly become the "best" in a lower-is-better pool.
      if (v != null && v > 0) out.push({ country_code: COUNTRY, product, bank, currency: CURRENCY, rate: round3(v), rate_type: 'apr', is_indicative: false });
    };
    add('housing_loan', 'mlr');
    add('personal_loan', 'mrr');
    add('overdraft', 'mor');
  }

  // Deposit: 12-month fixed → fixed_deposit; savings → current_account (credit
  // interest — individual savings used as a proxy for account credit interest).
  // Both are yields (higher is better), taken as the midpoint of the min–max band.
  const dep = latestDomesticRows((await botGet('/DepositRate/v2/deposit_rate/', win))?.result?.data?.data_detail);
  const mid = (lo, hi) => (lo != null && hi != null ? (lo + hi) / 2 : (hi ?? lo));
  for (const r of dep.rows) {
    const bank = cleanBank(r.bank_name_eng);
    if (!bank) continue;
    const yieldRow = (product, v) => { if (v != null && v > 0) out.push({ country_code: COUNTRY, product, bank, currency: CURRENCY, rate: round3(v), rate_type: 'yield', is_indicative: false }); };
    yieldRow('fixed_deposit', mid(num(r.fix_12_mths_min), num(r.fix_12_mths_max)));
    yieldRow('current_account', mid(num(r.saving_min), num(r.saving_max)));
  }

  return { out, loanPeriod: loan.period, depPeriod: dep.period };
}

async function main() {
  if (!BOT_KEY) { console.log('• Skipped: set BOT_API_KEY (register at portal.api.bot.or.th).'); return; }

  console.log(`→ Fetching BOT per-bank rates (window ${JSON.stringify(botWindow())})…`);
  const { out, loanPeriod, depPeriod } = await buildRows();

  const byProduct = out.reduce((m, r) => ((m[r.product] = (m[r.product] || 0) + 1), m), {});
  const banks = new Set(out.map((r) => r.bank));
  console.log(`  loan period ${loanPeriod || '—'}, deposit period ${depPeriod || '—'}`);
  console.log(`  built ${out.length} rows across ${banks.size} banks:`, byProduct);

  if (!out.length) { console.log('• BOT returned no domestic rows — leaving product_rates unchanged.'); return; }

  if (DRY) {
    console.log('  (dry run — nothing written)');
    console.log('  banks:', [...banks].join(', '));
    console.log('  sample:', JSON.stringify(out.slice(0, 4)));
    return;
  }

  if (!url || !key) { console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry).'); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Replace only the TH/THB rows for these four products (USD overdraft + every
  // other country/product untouched). Guarded by out.length above so a failed
  // fetch never wipes the pool. Delete→insert isn't transactional, but this runs
  // once daily off-peak and the app caches rates for 5 min, so the sub-second gap
  // is immaterial; the next run self-heals regardless.
  const { error: delErr } = await db.from('product_rates').delete()
    .eq('country_code', COUNTRY).eq('currency', CURRENCY).in('product', POOL_PRODUCTS);
  if (delErr) { console.error('✗ delete:', delErr.message); process.exit(1); }

  for (let i = 0; i < out.length; i += 500) {
    const { error } = await db.from('product_rates').insert(out.slice(i, i + 500));
    if (error) { console.error('✗ insert:', error.message); process.exit(1); }
  }
  console.log(`✓ Replaced TH/THB pool for ${POOL_PRODUCTS.join(', ')} with ${out.length} real BOT rows across ${banks.size} banks.`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
