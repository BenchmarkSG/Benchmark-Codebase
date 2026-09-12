/* -----------------------------------------------------------------------------
 * FeeOptima — importer for REAL per-bank remittance rows (public.remittance_charges)
 *
 * One row per (bank, direction, counterparty). Written as real
 * (is_indicative = false) and MERGED: only the (bank, direction, counterparty)
 * keys present in the file are replaced, everything else in the table is left
 * alone — so the generated rows stay (filtered out of every response by
 * RATES_REAL_ONLY) and a bank entered by hand survives the nightly job.
 *
 * CSV columns (header row required):
 *   country,bank,direction,counterparty,amount,amount_currency,upfront_fee,
 *   intermediary_fee,lifting_fee,fee_currency,fx_spread_pct[,settlement_time_hours]
 *   • country        SG | IN | MY | ID | TH
 *   • bank           the display name in public.banks (looked up, never invented)
 *   • direction      outgoing | incoming
 *   • counterparty   the currency on the other side, e.g. USD
 *   • amount         notional the fees were quoted against, in amount_currency
 *   • *_fee          flat fees in fee_currency (blank = 0)
 *   • fx_spread_pct  the bank's FX cost over its own mid, % (see scrape-remit.mjs)
 *
 * Usage:
 *   npm run import:remit -- data/rate-templates/remit-SG.csv [--dry]
 * --------------------------------------------------------------------------- */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const file = args.find((a) => !a.startsWith('--'));
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CC = new Set(['SG', 'IN', 'MY', 'ID', 'TH']);

function parseCSV(text) {
  const parseLine = (line) => {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') q = true;
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const header = parseLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => { const cells = parseLine(line); const o = {}; header.forEach((h, i) => (o[h] = cells[i])); return o; });
}
const num = (v, dflt = null) => (String(v ?? '').trim() === '' ? dflt : Number(v));

function build(raw) {
  const out = [], errors = [];
  raw.forEach((r, i) => {
    const ln = i + 2;
    const country = String(r.country || '').toUpperCase().trim();
    const bank = String(r.bank || '').replace(/\s+/g, ' ').trim();
    const direction = String(r.direction || 'outgoing').toLowerCase().trim();
    const counterparty = String(r.counterparty || '').toUpperCase().trim();
    if (!CC.has(country)) return errors.push(`line ${ln}: unknown country "${r.country}"`);
    if (!bank) return errors.push(`line ${ln}: missing bank`);
    if (!['outgoing', 'incoming'].includes(direction)) return errors.push(`line ${ln}: direction must be outgoing | incoming`);
    if (!/^[A-Z]{3}$/.test(counterparty)) return errors.push(`line ${ln}: counterparty must be a currency code (got "${r.counterparty}")`);
    const amount = num(r.amount), spread = num(r.fx_spread_pct);
    if (!(amount > 0)) return errors.push(`line ${ln}: amount must be > 0`);
    if (!Number.isFinite(spread) || spread < 0 || spread > 20) return errors.push(`line ${ln}: fx_spread_pct must be a % between 0 and 20 (got "${r.fx_spread_pct}")`);
    const fees = ['upfront_fee', 'intermediary_fee', 'lifting_fee'].map((k) => num(r[k], 0));
    if (fees.some((f) => !(f >= 0))) return errors.push(`line ${ln}: fees must be numbers ≥ 0`);
    const amount_currency = String(r.amount_currency || '').toUpperCase().trim();
    const fee_currency = String(r.fee_currency || amount_currency).toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(amount_currency) || !/^[A-Z]{3}$/.test(fee_currency)) return errors.push(`line ${ln}: amount_currency / fee_currency must be currency codes`);
    out.push({ country, bank, direction, counterparty, amount, amount_currency,
      upfront_fee: fees[0], intermediary_fee: fees[1], lifting_fee: fees[2], fee_currency,
      fx_spread_pct: Math.round(spread * 1000) / 1000,
      settlement_time_hours: num(r.settlement_time_hours), is_indicative: false });
  });
  return { out, errors };
}

async function main() {
  if (!file) { console.error('✗ Usage: npm run import:remit -- <file.csv> [--dry]'); process.exit(1); }
  const { out, errors } = build(parseCSV(readFileSync(file, 'utf8')));
  if (errors.length) { console.error(`✗ ${errors.length} invalid row(s):`); errors.slice(0, 20).forEach((e) => console.error('  ' + e)); }
  if (!out.length) { console.error('✗ No valid rows.'); process.exit(1); }
  console.log(`→ ${out.length} row(s):`);
  for (const r of out) console.log(`   ${r.country} ${r.bank.padEnd(22)} ${r.direction} → ${r.counterparty}  spread ${r.fx_spread_pct}%  fees ${r.upfront_fee}+${r.intermediary_fee}+${r.lifting_fee} ${r.fee_currency}  on ${r.amount} ${r.amount_currency}`);
  if (DRY) { console.log('  (dry run — nothing written)'); return; }
  if (!url || !key) { console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry).'); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Bank ids come from the banks table — a name that isn't there is an error,
  // never a new bank.
  const { data: banks, error: bErr } = await db.from('banks').select('id, name, country_code');
  if (bErr) { console.error(`✗ banks: ${bErr.message}`); process.exit(1); }
  const idOf = new Map(banks.map((b) => [`${b.country_code}|${b.name.toLowerCase()}`, b.id]));
  const rows = [];
  for (const r of out) {
    const id = idOf.get(`${r.country}|${r.bank.toLowerCase()}`);
    if (!id) { console.error(`✗ ${r.country} "${r.bank}" is not in public.banks — fix the name (nothing written)`); process.exit(1); }
    const { country, bank, ...rest } = r;
    rows.push({ bank_id: id, ...rest });
  }
  for (const r of rows) {
    const { error: dErr } = await db.from('remittance_charges').delete()
      .eq('bank_id', r.bank_id).eq('direction', r.direction).eq('counterparty', r.counterparty);
    if (dErr) { console.error(`✗ delete ${r.bank_id}: ${dErr.message}`); process.exit(1); }
  }
  const { error: iErr } = await db.from('remittance_charges').insert(rows);
  if (iErr) { console.error(`✗ insert: ${iErr.message}`); process.exit(1); }
  console.log(`✓ Merged ${rows.length} real remittance row(s).`);
}
main().catch((e) => { console.error('✗', e.message); process.exit(1); });
