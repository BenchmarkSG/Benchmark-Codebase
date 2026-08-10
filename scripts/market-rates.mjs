/* -----------------------------------------------------------------------------
 * BankBenchmark.sg — automated market-reference rate fetcher (multi-country)
 *
 * Pulls AGGREGATE market rates from each country's CENTRAL-BANK open API and
 * upserts them into public.market_rates. These anchor the benchmark's "market
 * reference" line. Individual banks don't expose pricing via API — the sole
 * exception is Malaysia, where BNM publishes each bank's base/lending rates.
 *
 * Sources:
 *   SG  MAS  — aggregate Domestic Interest Rates          (no key; occasional maintenance)
 *   MY  BNM  — per-bank base/lending rates + OPR           (no key)         api.bnm.gov.my
 *   TH  BOT  — per-bank loan (MOR/MLR/MRR) + deposit rates  (needs BOT_API_KEY) gateway.api.bot.or.th
 *   IN  RBI  — no official public rate API  → directory only
 *   ID  BI/OJK — no official public rate API → directory only
 *
 * Commands:
 *   npm run market:verify [CC]   Probe sources, print live status + samples (no DB).
 *   npm run market:fetch  [CC]   Pull latest + upsert market_rates (needs SUPABASE creds).
 *                                Optional CC (SG/MY/TH) limits to one country.
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const cmd = (process.argv[2] || 'fetch').toLowerCase();
const onlyCC = (process.argv[3] || '').toUpperCase() || null;

const ref = (country, product, value, unit, source, series, asOf = null) => ({
  country_code: country, product, metric: 'market_typical',
  value: Number(value), unit, source, series, as_of: asOf,
});
const median = (arr) => {
  const s = arr.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

// ============================ SG — MAS =====================================
const MAS_BASE = process.env.MAS_API_BASE || 'https://eservices.mas.gov.sg/api/action/datastore/search.json';
const MAS_RESOURCE = process.env.MAS_DIR_RESOURCE || '9a0bf149-308c-4bd2-832d-76c8e6cb47ed';
const MAS_DATE_FIELD = process.env.MAS_DATE_FIELD || 'end_of_period';
// MAS column → our product. Confirm names with `npm run market:verify SG`.
const MAS_MAP = [
  { column: 'banks_fixed_deposits_12m', product: 'fixed_deposit',   unit: '% p.a.' },
  { column: 'prime_lending_rate',       product: 'housing_loan',    unit: '% p.a.' },
  { column: 'prime_lending_rate',       product: 'personal_loan',   unit: '% p.a.' },
  { column: 'banks_savings_deposits',   product: 'current_account', unit: '% p.a.' },
];

async function masSource() {
  const url = `${MAS_BASE}?resource_id=${MAS_RESOURCE}&limit=1&sort=${encodeURIComponent(`${MAS_DATE_FIELD} desc`)}`;
  let res, text;
  try { res = await fetch(url, { headers: { 'User-Agent': 'BankBenchmark/1.0', Accept: 'application/json' } }); text = await res.text(); }
  catch (e) { return { status: `down: ${e.message}`, rows: [] }; }
  if (!res.ok || text.trimStart().startsWith('<')) return { status: `down: unavailable (HTTP ${res.status}${text.includes('maintenance') ? ', maintenance' : ''})`, rows: [] };
  let json; try { json = JSON.parse(text); } catch { return { status: 'down: non-JSON', rows: [] }; }
  const rec = json?.result?.records?.[0];
  if (!rec) return { status: 'down: no records', rows: [] };
  const asOf = rec[MAS_DATE_FIELD] || null;
  const rows = [], missing = [];
  for (const m of MAS_MAP) {
    const v = rec[m.column];
    if (v == null || v === '' || Number.isNaN(Number(v))) { missing.push(m.column); continue; }
    rows.push(ref('SG', m.product, v, m.unit, 'MAS', m.column, asOf));
  }
  return { status: `ok (${rows.length} rows${missing.length ? `, missing: ${missing.join(',')}` : ''})`, rows, fields: Object.keys(rec) };
}

// ============================ MY — BNM =====================================
const BNM_HEADERS = { Accept: 'application/vnd.BNM.API.v1+json', 'User-Agent': 'BankBenchmark/1.0' };
async function bnmGet(path) {
  try {
    const res = await fetch(`https://api.bnm.gov.my/public${path}`, { headers: BNM_HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
async function bnmSource() {
  const base = await bnmGet('/base-rate');
  if (!base?.data?.length) return { status: 'down: base-rate unavailable', rows: [] };
  const opr = await bnmGet('/opr');
  const eff = base.data.map((b) => b.indicative_eff_lending_rate);
  const medEff = median(eff);
  const rows = [];
  if (medEff != null) {
    rows.push(ref('MY', 'housing_loan', medEff, '% p.a.', 'BNM', 'indicative effective lending rate (median of banks)'));
    rows.push(ref('MY', 'personal_loan', medEff, '% p.a.', 'BNM', 'indicative effective lending rate (median of banks)'));
  }
  if (opr?.data?.new_opr_level != null) {
    rows.push(ref('MY', 'overdraft', opr.data.new_opr_level, '% p.a.', 'BNM', 'OPR (policy rate)', opr.data.date || null));
  }
  return { status: `ok (${base.data.length} banks${opr?.data ? ', OPR ' + opr.data.new_opr_level : ''})`, rows };
}

// ============================ TH — BOT =====================================
// Bank of Thailand "Interest Rates" product (portal.api.bot.or.th). Subscribe an
// app to it and set BOT_API_KEY to the app's Client ID. Per BOT's OpenAPI the
// key goes in the `Authorization` header (no secret needed); we also send the
// legacy X-IBM-Client-Id for safety. Confirmed endpoints (gateway host below):
//   /LoanRate/v2/avg_loan_rate/       → MOR→overdraft, MLR→housing, MRR→personal
//   /DepositRate/v2/avg_deposit_rate/ → 12M fixed (min–max midpoint) → FD
//   /PolicyRate/v3/policy_rate/       → policy rate (macro anchor; logged only)
// All take start_period/end_period (YYYY-MM-DD, ≤31-day window); data lives at
// result.data.data_detail[] with domestic vs foreign-branch rows.
const BOT_KEY = process.env.BOT_API_KEY || '';
const BOT_BASE = process.env.BOT_API_BASE || 'https://gateway.api.bot.or.th';
const botNum = (v) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n; };

async function botGet(path, params) {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  try {
    const res = await fetch(`${BOT_BASE}${path}${qs}`, {
      headers: { Authorization: BOT_KEY, 'X-IBM-Client-Id': BOT_KEY, Accept: 'application/json' },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { json: await res.json() };
  } catch (e) { return { error: e.message }; }
}

// Latest "Commercial Banks registered in Thailand" row from a data_detail set.
function botLatestDomestic(detail) {
  const all = Array.isArray(detail) ? detail : detail ? [detail] : [];
  const dom = all.filter((r) => /registered in Thailand/i.test(r?.name_eng || r?.bank_type_name_eng || ''));
  const pool = dom.length ? dom : all;
  return pool.length ? pool.reduce((a, b) => (String(b.period) > String(a.period) ? b : a)) : null;
}

function botWindow(days = 14) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start_period: fmt(start), end_period: fmt(end) };
}

async function botSource() {
  if (!BOT_KEY) return { status: 'skipped: set BOT_API_KEY (register at portal.api.bot.or.th)', rows: [] };
  const rows = [], notes = [];
  const win = botWindow();

  // Loan: MOR → overdraft, MLR → housing_loan, MRR → personal_loan.
  const loan = await botGet('/LoanRate/v2/avg_loan_rate/', win);
  if (loan.json) {
    const r = botLatestDomestic(loan.json?.result?.data?.data_detail);
    if (r) {
      if (botNum(r.mor) != null) rows.push(ref('TH', 'overdraft', botNum(r.mor), '% p.a.', 'BOT', 'MOR — avg loan rate (domestic banks)', r.period));
      if (botNum(r.mlr) != null) rows.push(ref('TH', 'housing_loan', botNum(r.mlr), '% p.a.', 'BOT', 'MLR — avg loan rate (domestic banks)', r.period));
      if (botNum(r.mrr) != null) rows.push(ref('TH', 'personal_loan', botNum(r.mrr), '% p.a.', 'BOT', 'MRR — avg loan rate (domestic banks)', r.period));
    } else notes.push('loan: no rows');
  } else notes.push(`loan: ${loan.error}`);

  // Deposit: 12-month fixed, midpoint of the domestic min–max band.
  const dep = await botGet('/DepositRate/v2/avg_deposit_rate/', win);
  if (dep.json) {
    const r = botLatestDomestic(dep.json?.result?.data?.data_detail);
    const lo = botNum(r?.fix_12_mths_min), hi = botNum(r?.fix_12_mths_max);
    if (lo != null && hi != null) rows.push(ref('TH', 'fixed_deposit', Math.round((lo + hi) / 2 * 1e4) / 1e4, '% p.a.', 'BOT', '12M fixed deposit (domestic min–max midpoint)', r.period));
    else if (hi != null) rows.push(ref('TH', 'fixed_deposit', hi, '% p.a.', 'BOT', '12M fixed deposit (domestic max)', r.period));
    else notes.push('deposit: no 12M value');
  } else notes.push(`deposit: ${dep.error}`);

  // Policy rate — macro anchor (no product mapping; MOR already covers overdraft).
  const pol = await botGet('/PolicyRate/v3/policy_rate/');
  const polNote = pol.json?.result?.data != null ? `policy ${pol.json.result.data}` : pol.error ? `policy: ${pol.error}` : 'policy: n/a';

  const detail = `${polNote}${notes.length ? '; ' + notes.join('; ') : ''}`;
  return rows.length
    ? { status: `ok (${rows.length} rows; ${detail})`, rows }
    : { status: `down: no rows (${detail})`, rows: [] };
}

// ============================ Registry =====================================
const SOURCES = { SG: { name: 'MAS', fn: masSource }, MY: { name: 'BNM', fn: bnmSource }, TH: { name: 'BOT', fn: botSource } };
const NO_API = {
  IN: 'RBI — no official public rate API (directory only; scrape/license for rates)',
  ID: 'BI / OJK — no official public rate API (directory only; scrape/license for rates)',
};

function pickCountries() {
  if (!onlyCC) return Object.keys(SOURCES);
  return Object.keys(SOURCES).filter((c) => c === onlyCC);
}

async function verify() {
  for (const cc of pickCountries()) {
    const src = SOURCES[cc];
    process.stdout.write(`→ ${cc} (${src.name}): `);
    const { status, rows, fields } = await src.fn();
    console.log(status);
    for (const r of rows || []) console.log(`     ${r.product.padEnd(16)} ${r.value} ${r.unit}  (${r.series})`);
    if (fields) console.log(`     columns: ${fields.join(', ')}`);
  }
  if (!onlyCC) for (const [cc, note] of Object.entries(NO_API)) console.log(`• ${cc}: ${note}`);
}

async function fetchAndStore() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. (Use `npm run market:verify` to test sources without a DB.)'); process.exit(1); }
  const all = [];
  for (const cc of pickCountries()) {
    const src = SOURCES[cc];
    const { status, rows } = await src.fn();
    console.log(`  ${cc} (${src.name}): ${status}`);
    if (rows?.length) all.push(...rows);
  }
  if (!all.length) { console.log('• Nothing to store (sources unavailable or skipped) — DB unchanged.'); return; }
  const db = createClient(url, key);
  const { error } = await db.from('market_rates').upsert(all, { onConflict: 'country_code,product,metric,source' });
  if (error) { console.error('✗ upsert:', error.message); process.exit(1); }
  console.log(`✓ Stored ${all.length} market reference(s) across ${new Set(all.map((r) => r.country_code)).size} country(ies).`);
}

const run = cmd === 'verify' ? verify() : fetchAndStore();
run.catch((e) => { console.error('✗', e.message); process.exit(1); });
