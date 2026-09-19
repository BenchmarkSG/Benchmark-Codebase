/* -----------------------------------------------------------------------------
 * FeeOptima — fill EMPTY cells in the rate pool with indicative figures
 *
 * WHY THIS EXISTS AND scripts/seed-rates.mjs DOES NOT DO IT
 *   The seeder wipes every table and rebuilds from scratch. Run today it would
 *   delete the 181 SOURCED rates already in the pool — the BOT and BNM regulator
 *   data, which is the only real data there is. This script never deletes and
 *   never updates: it inserts a row only where the pool has no row at all, so a
 *   sourced figure can never be overwritten by a made-up one.
 *
 * WHAT IT WRITES
 *   is_indicative = true, always. Indicative rows are NOT served — the API
 *   filters them out unless RATES_REAL_ONLY=false — and when they are shown the
 *   result card carries "these rates are indicative, treat as illustrative
 *   only". Nothing here is a published rate and nothing here may be presented as
 *   one. The figures come from scripts/lib/rate-model.mjs, the same model the
 *   seeder uses, so one bank's product has one indicative price whichever script
 *   wrote it.
 *
 *   Deterministic, so re-running is idempotent: the same gap always yields the
 *   same figure, and a gap already filled is skipped rather than rewritten.
 *
 * CALIBRATION
 *   Where a pool already holds SOURCED rows, the new rows are re-centred on
 *   them: the model's shape (category tilt, per-bank jitter) is kept, but the
 *   whole set is shifted so its median sits on the sourced median. A gap row
 *   joins a real pool, so it should sit at that pool's level — the raw model
 *   sat 1-2 points off in several markets (SG fixed deposits, MY mortgages).
 *   Pools with no sourced rows keep the model base.
 *
 *   The LEVEL is copied, never the rate_basis. `range` makes the result card say
 *   "the midpoint of the range this lender publishes" and `from` claims a
 *   published floor; neither is true of a row nobody published.
 *
 * SCOPE
 *   Banks in the live `banks` table only. A rate for a bank the directory does
 *   not list is unreachable — nobody can select it (see MISSING_RATES.txt
 *   appendix B/C). Products come from the catalog, so a market that bars a
 *   product is never seeded with it.
 *
 *   `current_account_fees` is skipped by NO_SYNTHETIC and stays empty: it is
 *   benchmarked in real money, so a plausible invented figure reads as a real
 *   quote for a real bank's charges. That one has to be sourced.
 *
 * Usage:
 *   node scripts/fill-gaps.mjs --dry     preview, writes nothing
 *   node scripts/fill-gaps.mjs           insert the missing rows
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { getProduct, isProductInCountry } from '../server/benchmark.js';
import {
  COUNTRIES, DIRECTORY_ONLY, NO_SYNTHETIC, RATE_PRODUCTS,
  indicativeRate, round, slug, unit,
} from './lib/rate-model.mjs';

const DRY = process.argv.includes('--dry');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role, not anon).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const pageAll = async (table, select) => {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
};

async function main() {
  console.log(`→ Reading the live pool…${DRY ? '  (dry run)' : ''}`);
  const banks = await pageAll('banks', 'id,country_code,name,category');
  const rates = await pageAll('product_rates', 'country_code,product,bank,currency,variant,is_indicative,rate');
  const remit = await pageAll('remittance_charges', 'bank_id,direction,counterparty');

  // A cell is "taken" if ANY row exists for it — sourced or indicative. We are
  // filling holes, not competing with what is already there.
  const taken = new Set(rates.map((r) =>
    `${r.country_code}|${r.product}|${r.bank}|${r.currency}|${r.variant || ''}`));
  const remitTaken = new Set(remit.map((r) => `${r.bank_id}|${r.direction}|${r.counterparty}`));
  const sourced = rates.filter((r) => r.is_indicative === false).length;
  console.log(`  ${rates.length} rate rows (${sourced} sourced), ${remit.length} remittance rows, ${banks.length} banks`);

  // Per pool: the sourced median, to re-centre gap rows on reality.
  const median = (a) => { const x = [...a].sort((p, q) => p - q); const m = x.length >> 1;
    return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
  const poolKey = (cc, product, currency, variant) => `${cc}|${product}|${currency}|${variant || ''}`;
  const sourcedBy = new Map();
  for (const r of rates) {
    if (r.is_indicative !== false || r.rate == null) continue;
    const k = poolKey(r.country_code, r.product, r.currency, r.variant);
    if (!sourcedBy.has(k)) sourcedBy.set(k, { rates: [] });
    const e = sourcedBy.get(k);
    e.rates.push(Number(r.rate));
  }
  const calibration = new Map(); // poolKey -> { shift, sourcedMedian }
  const calibrate = (cc, product, currency, variant, dir, isUsd) => {
    const k = poolKey(cc, product, currency, variant);
    if (calibration.has(k)) return calibration.get(k);
    const src = sourcedBy.get(k);
    let out = { shift: 0, sourcedMedian: null };
    if (src && src.rates.length) {
      const modelled = dir.map((b) => indicativeRate({ bankId: b.id, category: b.category, product,
        currency, variant, countryCode: cc, isUsd })).filter((x) => x != null);
      out = { shift: median(src.rates) - median(modelled), sourcedMedian: median(src.rates) };
    }
    calibration.set(k, out);
    return out;
  };

  const newRates = [], newRemit = [];
  const perProduct = {};

  for (const c of COUNTRIES) {
    const dir = banks.filter((b) => b.country_code === c.code);
    for (const b of dir) {
      if (DIRECTORY_ONLY.has(b.category)) continue;
      for (const p of RATE_PRODUCTS) {
        const meta = getProduct(p.product);
        if (!meta || !isProductInCountry(meta, c.code)) continue;
        if (NO_SYNTHETIC.has(p.product)) continue;
        for (const mode of p.ccy) {
          const currency = mode === 'USD' ? 'USD' : c.currency;
          for (const v of p.variants || [null]) {
            const cell = `${c.code}|${p.product}|${b.name}|${currency}|${v || ''}`;
            if (taken.has(cell)) continue;
            const raw = indicativeRate({
              bankId: b.id, category: b.category, product: p.product,
              currency, variant: v, countryCode: c.code, isUsd: mode === 'USD',
            });
            if (raw == null) continue;
            const cal = calibrate(c.code, p.product, currency, v, dir, mode === 'USD');
            // Never below zero: a shift can't be allowed to invent a negative yield.
            const rate = round(Math.max(0, raw + cal.shift), 3);
            const row = {
              country_code: c.code, product: p.product, bank: b.name, currency,
              rate, rate_type: p.rateType, variant: v,
              is_indicative: true,   // the column default, stated so it is never a question
            };
            newRates.push(row);
            perProduct[`${c.code} ${p.product}`] = (perProduct[`${c.code} ${p.product}`] || 0) + 1;
          }
        }
      }

      // Cross-border: the two corridors the pool models, same shape as the seeder.
      for (const [direction, counterparty] of [['outgoing', 'USD'], ['incoming', 'GBP']]) {
        if (remitTaken.has(`${b.id}|${direction}|${counterparty}`)) continue;
        const s = direction === 'outgoing' ? 'ro' : 'ri';
        newRemit.push({
          bank_id: b.id, direction, counterparty,
          amount: 1000000, amount_currency: c.currency,
          upfront_fee: round((direction === 'outgoing' ? 25 : 10) + unit(b.id + s + 'u') * (direction === 'outgoing' ? 35 : 20)),
          intermediary_fee: round((direction === 'outgoing' ? 18 : 15) + unit(b.id + s + 'i') * (direction === 'outgoing' ? 22 : 20)),
          lifting_fee: round((direction === 'outgoing' ? 10 : 8) + unit(b.id + s + 'l') * (direction === 'outgoing' ? 15 : 12)),
          fee_currency: 'USD',
          fx_spread_pct: round((direction === 'outgoing' ? 0.35 : 0.3) + unit(b.id + s + 'x') * (direction === 'outgoing' ? 0.95 : 0.85), 2),
          settlement_time_hours: round((direction === 'outgoing' ? 6 : 2) + unit(b.id + s + 't') * (direction === 'outgoing' ? 66 : 46)),
          is_indicative: true,
        });
      }
    }
  }

  console.log(`\n→ ${newRates.length} empty rate cells, ${newRemit.length} empty remittance cells`);
  for (const [k, n] of Object.entries(perProduct).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(30)} ${n}`);
  }
  const shifted = [...calibration.entries()].filter(([, v]) => v.sourcedMedian != null);
  if (shifted.length) {
    console.log('\n  re-centred on sourced pools:');
    for (const [k, v] of shifted) {
      console.log(`    ${k.replace(/\|$/, '').padEnd(34)} sourced median ${v.sourcedMedian.toFixed(2)}  shift ${v.shift >= 0 ? '+' : ''}${v.shift.toFixed(2)}`);
    }
  }
  for (const [id, why] of NO_SYNTHETIC) console.log(`\n  • left empty on purpose — ${id}: ${why}`);

  if (!newRates.length && !newRemit.length) { console.log('\n✓ Nothing to fill.'); return; }
  if (DRY) {
    console.log('\n  (dry run — nothing written)');
    console.log('  sample:', JSON.stringify(newRates[0]));
    return;
  }

  console.log('\n→ Inserting (never updating, never deleting)…');
  for (const [rows, table] of [[newRates, 'product_rates'], [newRemit, 'remittance_charges']]) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).insert(rows.slice(i, i + 500));
      if (error) throw new Error(`insert ${table}: ${error.message}`);
    }
    if (rows.length) console.log(`  ✓ ${table.padEnd(22)} +${rows.length} rows`);
  }
  console.log('\n✓ Done. Every row written is INDICATIVE and is not served while');
  console.log('  RATES_REAL_ONLY is true. Replace with sourced data before it ships.');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
