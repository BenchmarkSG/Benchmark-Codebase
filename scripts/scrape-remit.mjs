/* -----------------------------------------------------------------------------
 * FeeOptima — per-bank remittance cost scraper (FX spread + published fees)
 *
 * What a bank charges to send money abroad is two things: the FX SPREAD (its
 * telegraphic-transfer selling rate against mid) and FLAT FEES. Banks publish
 * the first every day as a board-rate table; the second sits in a tariff.
 *
 * Spread. For each bank the source names the table and the USD row, and the
 * columns holding the TT BUYING and TT SELLING rates (local per 1 USD). The
 * spread is measured against the bank's OWN mid, (sell + buy) / 2:
 *     fx_spread_pct = (sell − mid) / mid × 100
 * Own-mid rather than the ECB reference, because the ECB fixes once a day
 * at 16:00 CET and a board rate is a morning snapshot — intraday moves of
 * ±0.3% would swamp a 0.5% spread. Own-mid is timing-free and deterministic.
 * Basis: the COUNTER telegraphic-transfer rate every bank publishes. Online
 * "e-rates" (Mandiri Special Rate, BCA e-Rate) are tighter but apply only in
 * the app, with limits; they are noted in DATA_GAPS.md, not loaded.
 *
 * Fees. Where a bank publishes its outward-TT fee on a page this script can
 * read, the source names the phrase. Where it does not, `fee` carries a figure
 * a person read from the bank's tariff — with the URL and date — and the
 * scraper refuses to run a source whose fee note is older than FEE_MAX_DAYS,
 * so a hand-read fee cannot go stale silently.
 *
 * Same discipline as scrape-pool.mjs: exact table, exact row, exact column;
 * anything that stops matching fails loudly and is skipped; nothing is
 * inferred. Rows are written as REAL by import-remit.mjs.
 *
 *   node scripts/scrape-remit.mjs [ID]            → data/rate-templates/remit-<CC>.csv
 *   node scripts/scrape-remit.mjs --preview      → print spreads only, write nothing
 *                                                  (runs sources whose fee is not yet read)
 * --------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const OUT_DIR = 'data/rate-templates';
const FEE_MAX_DAYS = 120;
const CCY = { SG: 'SGD', IN: 'INR', MY: 'MYR', ID: 'IDR', TH: 'THB' };

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim();
const uncommented = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ');
const tables = (h) => [...uncommented(h).matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) =>
  [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]))).filter((r) => r.some(Boolean)));

/* "17.590,00" (Indonesian: dot thousands, comma decimals) → 17590; "33.20" → 33.2;
   "17.415" is ambiguous on its own — a source says which convention it uses. */
function toNumber(text, style) {
  let t = String(text).replace(/[^\d.,]/g, '');
  if (style === 'id') t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`"${text}" is not a rate`);
  return n;
}

function spreadOf(htmlText, { header, row, buy, sell, style, label }) {
  const all = tables(htmlText);
  const table = all.find((t) => t.some((r) => header.test(r.join(' '))) && t.some((r) => row.test(r.join(' '))));
  if (!table) throw new Error(`no table with header ${header} and row ${row}`);
  const hit = table.find((r) => row.test(r.join(' ')));
  const b = toNumber(hit[buy], style), s = toNumber(hit[sell], style);
  if (s <= b) throw new Error(`selling ${s} is not above buying ${b} — wrong columns?`);
  const mid = (b + s) / 2;
  return { buy: b, sell: s, mid, spread: Math.round(((s - mid) / mid) * 100 * 1000) / 1000, evidence: `${label}: [${hit.slice(0, 8).join(' | ')}] buy col ${buy}, sell col ${sell}` };
}

/* --- Sources -------------------------------------------------------------- */
const SOURCES = [
  // Indonesia — "TT Counter" buy/sell, IDR per 1 USD. Column order on each
  // page was read with inspect:page; the two-row header is why the USD row
  // is matched by its own label rather than by column names.
  { country: 'ID', bank: 'Bank Mandiri', render: true,
    url: 'https://www.bankmandiri.co.id/kurs',
    header: /Mata Uang.*Special Rate.*TT Counter.*Bank Notes/i, row: /^USD /, buy: 3, sell: 4, style: 'id', label: 'Mandiri TT Counter USD',
    fee: { amount: null, currency: 'IDR', note: 'not yet read from the tariff' } },
  { country: 'ID', bank: 'Bank Central Asia', render: true,
    url: 'https://www.bca.co.id/id/informasi/kurs',
    header: /Mata Uang.*e-Rate.*TT Counter.*Bank Notes/i, row: /^USD /, buy: 3, sell: 4, style: 'id', label: 'BCA TT Counter USD',
    fee: { amount: null, currency: 'IDR', note: 'not yet read from the tariff' } },
  { country: 'ID', bank: 'OCBC Indonesia', render: true,
    url: 'https://www.ocbc.id/id/kurs',
    header: /Mata Uang.*Bank Notes.*Telegraphic Transfers/i, row: /^USD /, buy: 3, sell: 4, style: 'id', label: 'OCBC Indonesia TT USD',
    fee: { amount: null, currency: 'IDR', note: 'not yet read from the tariff' } },

  // Thailand — Bangkok Bank: "TT Buying Rates" and "Bill - DD - TT Selling
  // Rates" columns; the USD row is split by note denomination and the TT
  // rates sit on the "USD: 50-100" row.
  { country: 'TH', bank: 'Bangkok Bank', render: true,
    url: 'https://www.bangkokbank.com/en/Personal/Other-Services/View-Rates/Foreign-Exchange-Rates',
    header: /Currency.*Bank Notes Buying Rates.*TT Buying Rates.*Selling Rates/i, row: /^USD50 USD: 50-100/, buy: 5, sell: 6, style: 'en', label: 'Bangkok Bank TT USD',
    fee: { amount: null, currency: 'THB', note: 'not yet read from the tariff' } },
];

const PREVIEW = process.argv.includes('--preview');
const only = (process.argv.find((a) => /^[A-Z]{2}$/i.test(a)) || '').toUpperCase();
const wanted = SOURCES.filter((s) => !only || s.country === only);
const pages = new Map();
let browser = null;
async function fetchHtml(src) {
  if (!src.render) {
    const res = await fetch(src.url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  if (!browser) browser = await (await import('playwright')).chromium.launch();
  const page = await (await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })).newPage();
  try {
    await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    return await page.content();
  } finally { await page.context().close(); }
}

const ok = [], failed = [];
for (const src of wanted) {
  try {
    if (src.fee.amount == null && !PREVIEW) throw new Error(`fee not read: ${src.fee.note}`);
    if (src.fee.asOf && (Date.now() - Date.parse(src.fee.asOf)) / 86400000 > FEE_MAX_DAYS) throw new Error(`fee last read ${src.fee.asOf} — older than ${FEE_MAX_DAYS} days, re-read the tariff`);
    if (!pages.has(src.url)) pages.set(src.url, await fetchHtml(src));
    const r = spreadOf(pages.get(src.url), src);
    ok.push({ ...src, ...r });
    console.log(`  ✓ ${src.country} ${src.bank.padEnd(20)} TT ${r.buy} / ${r.sell}  spread ${r.spread}%  fee ${src.fee.amount} ${src.fee.currency}`);
    console.log(`      ${r.evidence}`);
  } catch (e) {
    failed.push({ ...src, why: e.message });
    console.error(`  ✗ ${src.country} ${src.bank.padEnd(20)} ${e.message}`);
  }
}
if (PREVIEW) { if (browser) await browser.close(); console.log(`\n(preview) ${ok.length} spread(s) read, ${failed.length} failed — nothing written.`); process.exit(0); }
mkdirSync(OUT_DIR, { recursive: true });
const byCC = new Map();
for (const r of ok) (byCC.get(r.country) || byCC.set(r.country, []).get(r.country)).push(r);
for (const [cc, rows] of byCC) {
  const csv = ['country,bank,direction,counterparty,amount,amount_currency,upfront_fee,intermediary_fee,lifting_fee,fee_currency,fx_spread_pct',
    // amount = the local value of USD 1,000 at the bank's own mid — the notional the fee is spread over when the caller gives no amount.
    ...rows.map((r) => `${cc},"${r.bank}",outgoing,USD,${Math.round(r.mid * 1000)},${CCY[cc]},${r.fee.amount},${r.fee.intermediary ?? 0},0,${r.fee.currency},${r.spread}`)];
  const file = `${OUT_DIR}/remit-${cc}.csv`;
  writeFileSync(file, `${csv.join('\n')}\n`);
  console.log(`\n→ ${file} (${rows.length} rows)`);
}
if (browser) await browser.close();
console.log(`\n${ok.length} scraped, ${failed.length} failed.`);
