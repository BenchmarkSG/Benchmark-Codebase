/* -----------------------------------------------------------------------------
 * FeeOptima — per-bank remittance pricing from the Wise Comparison API
 *
 * WHY THIS EXISTS
 *   A bank's real cost to send money abroad is its FX MARKUP plus flat fees, and
 *   the markup is the half nobody publishes. scrape-remit.mjs can only reach it
 *   where a bank prints a two-sided TT board; across our five markets almost
 *   none do (see DATA_GAPS.md, "Singapore cross-border"). Wise collects the same
 *   number by pricing a real transfer against each provider and publishes it
 *   through the endpoint behind wise.com/…/compare.
 *
 * WHAT IT WRITES
 *   Nothing directly. It emits the CSV that import-remit.mjs already validates
 *   and merges, so every row still goes through one loader, one schema check and
 *   one bank-name lookup:
 *       node scripts/wise-remit.mjs            → data/rate-templates/remit-<CC>.csv
 *       node scripts/wise-remit.mjs --dry      → print the table, write nothing
 *       npm run import:remit -- data/rate-templates/remit-SG.csv
 *
 * THE FIGURE IS VERIFIED, NOT TRUSTED
 *   We do not load `markup` because the field is called markup. Every response
 *   carries a zero-markup quote (Wise's own), which is that collection run's
 *   mid. We recompute (mid − rate) / mid × 100 from the rates in the same
 *   response and refuse any provider whose published markup disagrees by more
 *   than MARKUP_TOLERANCE. A quote that fails the check is dropped loudly and
 *   never written — same discipline as scrape-pool.mjs: exact field, exact row,
 *   recomputed, or nothing.
 *
 * BANKS ONLY, DELIBERATELY
 *   `remittance_charges.bank_id` is a foreign key into public.banks, and the
 *   non-bank providers Wise also prices (Wise itself, Western Union, PayPal,
 *   OFX, Instarem) are not banks. They are counted and printed at the end rather
 *   than silently dropped, because on most corridors one of them is cheaper than
 *   every bank — which is a product decision to take with open eyes, not a row
 *   to sneak into the banks table. See DATA_GAPS.md.
 * --------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://api.wise.com/v4/comparisons/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const OUT_DIR = 'data/rate-templates';
const MARKUP_TOLERANCE = 0.05;   // percentage points
const PAUSE_MS = 1200;           // be a polite client of a free endpoint

/* The corridors we benchmark, per market. `amount` is the notional the fees are
   quoted against — import-remit stores it so remittanceCostPct can re-size a
   flat fee onto whatever the customer actually sent. */
const CORRIDORS = [
  { country: 'SG', send: 'SGD', receive: 'USD', amount: 10000 },
  { country: 'SG', send: 'SGD', receive: 'INR', amount: 10000 },
  { country: 'SG', send: 'SGD', receive: 'MYR', amount: 10000 },
  { country: 'MY', send: 'MYR', receive: 'USD', amount: 10000 },
  { country: 'TH', send: 'THB', receive: 'USD', amount: 100000 },
];

/* Wise's provider alias → the display name in public.banks, per market.
   Keyed on `alias` (stable, kebab-case) rather than `name`, which carries a
   country suffix Wise changes at will. An alias that is not in this map is
   REPORTED AND SKIPPED, never guessed: mapping "hong-leong" to the wrong
   Hong Leong entity would publish one bank's pricing under another's name. */
const BANK_ALIAS = {
  SG: { 'citibank-singapore': 'Citibank', 'hsbc-sg': 'HSBC' },
  MY: { 'public-bank-berhad': 'Public Bank', 'hsbc-malaysia': 'HSBC', 'hong-leong': 'Hong Leong Bank', maybank: 'Maybank' },
  TH: { 'bangkok-bank': 'Bangkok Bank', 'kasikorn-bank': 'Kasikornbank' },
  IN: {},
  ID: {},
};

/* A quote is for a named destination country or for the currency generally.
   Anything else is a different product (Western Union prices USD into Paraguay
   and American Samoa separately) and must not stand in for the corridor. */
const CANON_COUNTRY = { USD: 'US', INR: 'IN', MYR: 'MY', SGD: 'SG', THB: 'TH', GBP: 'GB', EUR: null };

const DRY = process.argv.includes('--dry');
const only = (process.argv.find((a) => /^[A-Z]{2}$/.test(a)) || '').toUpperCase();
const round = (n, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

async function comparison({ send, receive, amount }) {
  const url = `${API}?sourceCurrency=${send}&targetCurrency=${receive}&sendAmount=${amount}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json.providers)) throw new Error('no providers array');
  return json;
}

/* That run's mid: the single quote priced at zero markup. Deriving it from the
   same response keeps the comparison timing-free — an ECB fix taken hours later
   would move more than the spreads we are measuring. */
function midOf(providers) {
  for (const p of providers) {
    for (const q of p.quotes || []) {
      if (Number(q.markup) === 0 && Number(q.rate) > 0) return { mid: Number(q.rate), from: p.name };
    }
  }
  return null;
}

function quoteFor(provider, receive) {
  const want = CANON_COUNTRY[receive] ?? null;
  const usable = (provider.quotes || []).filter((q) => q.targetCountry == null || q.targetCountry === want);
  if (!usable.length) return null;
  // More than one only happens when a provider splits a currency by destination;
  // the country-specific quote is the corridor, the generic one is the fallback.
  return usable.find((q) => q.targetCountry === want) || usable[0];
}

const rows = [];
const skipped = [];
const noted = [];
const nonBank = [];
let collected = null;

for (const c of CORRIDORS) {
  if (only && c.country !== only) continue;
  const tag = `${c.country} ${c.send}→${c.receive}`;
  let json;
  try { json = await comparison(c); } catch (e) { console.error(`  ✗ ${tag}: ${e.message}`); continue; }

  const m = midOf(json.providers);
  if (!m) { console.error(`  ✗ ${tag}: no zero-markup quote — cannot establish a mid, skipping corridor`); continue; }
  console.log(`\n  ${tag}  mid ${m.mid} (from ${m.from}), ${json.providers.length} providers`);

  for (const p of json.providers) {
    const q = quoteFor(p, c.receive);
    if (!q) continue;
    collected = collected || q.dateCollected;

    if (p.type !== 'bank') { nonBank.push({ tag, name: p.name, markup: Number(q.markup), fee: Number(q.fee) }); continue; }

    const bank = BANK_ALIAS[c.country]?.[p.alias];
    if (!bank) { skipped.push(`${tag}: provider alias "${p.alias}" (${p.name}) is not mapped to a bank in public.banks`); continue; }

    // Recompute the markup from the rates in this same response. This is the
    // check that makes the number ours rather than theirs.
    const rate = Number(q.rate);
    const computed = ((m.mid - rate) / m.mid) * 100;
    const published = Number(q.markup);
    if (!Number.isFinite(rate) || rate <= 0) { skipped.push(`${tag} ${bank}: rate "${q.rate}" is not a rate`); continue; }
    if (Math.abs(computed - published) > MARKUP_TOLERANCE) {
      skipped.push(`${tag} ${bank}: published markup ${round(published)}% but rates imply ${round(computed)}% — over the ${MARKUP_TOLERANCE}pp tolerance, dropped`);
      continue;
    }
    if (computed > 20) { skipped.push(`${tag} ${bank}: computed markup ${round(computed)}% is over 20%, dropped as implausible`); continue; }

    /* A bank can price INSIDE the mid — Hong Leong and HSBC Malaysia both beat
       Wise's rate on MYR→USD, so the arithmetic yields a small negative. That is
       real, but `fx_spread_pct` is defined as a COST over mid and a negative
       cost is not one, so we clamp to zero: the bank is recorded as charging no
       FX margin. Clamping this way can only UNDERSTATE how good the bank is,
       which understates the saving we quote a customer — the safe direction to
       be wrong in. Dropping these rows instead would be far worse: it would
       remove the cheapest providers and inflate every benchmark. The raw figure
       is printed so the loss is visible. */
    const clamped = computed < 0;
    if (clamped) noted.push(`${tag} ${bank}: prices ${round(-computed)}% INSIDE mid — recorded as 0% FX margin`);
    const spread = clamped ? 0 : computed;

    rows.push({
      country: c.country, bank, direction: 'outgoing', counterparty: c.receive,
      amount: c.amount, amount_currency: c.send,
      upfront_fee: round(Number(q.fee) || 0, 2), intermediary_fee: 0, lifting_fee: 0,
      fee_currency: c.send,
      fx_spread_pct: round(spread),
      settlement_time_hours: null,
    });
    console.log(`     ✓ ${bank.padEnd(16)} markup ${round(spread).toString().padStart(6)}%  (published ${round(published)}%)  fee ${round(Number(q.fee) || 0, 2)} ${c.send}`);
  }
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}

if (noted.length) {
  console.log(`\n  ${noted.length} row(s) clamped to a 0% FX margin:`);
  for (const n of noted) console.log(`     · ${n}`);
}

if (skipped.length) {
  console.error(`\n  ${skipped.length} quote(s) skipped:`);
  for (const s of skipped) console.error(`     ✗ ${s}`);
}

if (nonBank.length) {
  console.log(`\n  Non-bank providers priced but NOT written (no bank_id to hang them on):`);
  for (const n of nonBank.sort((a, b) => a.markup - b.markup)) {
    console.log(`     · ${n.tag.padEnd(16)} ${n.name.padEnd(18)} markup ${round(n.markup).toString().padStart(6)}%  fee ${round(n.fee, 2)}`);
  }
  console.log('     On most corridors one of these beats every bank. See DATA_GAPS.md.');
}

if (!rows.length) { console.error('\n✗ No bank rows. Nothing written.'); process.exit(1); }

const HEADER = 'country,bank,direction,counterparty,amount,amount_currency,upfront_fee,intermediary_fee,lifting_fee,fee_currency,fx_spread_pct,settlement_time_hours';
const line = (r) => [r.country, `"${r.bank}"`, r.direction, r.counterparty, r.amount, r.amount_currency,
  r.upfront_fee, r.intermediary_fee, r.lifting_fee, r.fee_currency, r.fx_spread_pct, r.settlement_time_hours ?? ''].join(',');

console.log(`\n  ${rows.length} bank row(s) ready (collected ${String(collected).slice(0, 10)} by Wise):`);
for (const r of rows) console.log(`     ${r.country} ${r.bank.padEnd(16)} →${r.counterparty}  ${r.fx_spread_pct}% + ${r.upfront_fee} ${r.fee_currency}`);

if (DRY) { console.log('\n  (--dry — nothing written)'); process.exit(0); }

mkdirSync(OUT_DIR, { recursive: true });
const byCC = new Map();
for (const r of rows) (byCC.get(r.country) || byCC.set(r.country, []).get(r.country)).push(r);
for (const [cc, rs] of byCC) {
  const file = `${OUT_DIR}/remit-${cc}.csv`;
  writeFileSync(file, `${HEADER}\n${rs.map(line).join('\n')}\n`);
  console.log(`  → ${file}  (${rs.length} row(s))`);
}
console.log('\n  Load with:  npm run import:remit -- data/rate-templates/remit-SG.csv');
