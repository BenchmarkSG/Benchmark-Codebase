/* -----------------------------------------------------------------------------
 * FeeOptima — parse a published rate string into { basis, value, low, high }
 *
 * Banks publish loan pricing three ways, and the app now records which:
 *
 *   'exact'  "6.25%"                      → value 6.25
 *   'range'  "8.00% - 9.50%"              → value = the MIDPOINT (8.75), low 8.00,
 *                                           high 9.50; shown to users as "~8.75%"
 *   'from'   "from 7.50%", "7.50% onwards" → value 7.50; shown as "from 7.50%"
 *
 * The basis decision (11 Sep 2026): a range is represented by its average and
 * flagged with "~"; a "starting from" rate is stored as published and labelled
 * "from". Both are honest about what the number is, and neither invents a
 * figure the lender never printed.
 *
 * Deterministic and shared: scrape-pool.mjs runs every scraped cell through
 * this, and import-pool.mjs runs every hand-filled `rate` cell through it, so
 * a CSV may say "8.00-9.50" or "from 7.5" and land with the right basis.
 * Anything this cannot read is an error, never a guess.
 *
 * Two passes, so tenor text can't masquerade as a rate: a string that IS a rate
 * ("8.00 - 9.50", "from 7.5") is read whole with the % sign optional; inside a
 * longer phrase ("1 year to 2 years: 6.25%") only numbers carrying a % sign
 * count, so "1 to 2" is never mistaken for a range. A footnote star after the
 * % sign ("7.60%* p.a. onwards") or at the end ("6.25% p.a.*") is punctuation.
 * --------------------------------------------------------------------------- */

const N = '(\\d+(?:[.,]\\d+)?)';                  // 8, 8.5, 8,50
const PA = '(?:\\s*p\\.?\\s*a\\.?)?';               // optional "p.a."
const PO = '\\s*%?\\*?';                            // optional %, optional footnote star
const PR = '\\s*%\\*?';                             // required %, optional footnote star
// "11.25% OR 11.75%" (Central Bank of India: one of two rates by risk grade) is
// two published points — a range of two, represented by its midpoint.
const SEP = '\\s*(?:-|–|—|~|to|or|and|s\\.d\\.|sampai(?:\\s+dengan)?|hingga)\\s*';
const FROM_WORDS = '(?:from|starting\\s+(?:at|from)|starts?\\s+(?:at|from)|as\\s+low\\s+as|mulai(?:\\s+dari)?)';
const ONWARD_WORDS = '(?:onwards?|upwards?|and\\s+above|ke\\s+atas)';

// Pass 1 — the whole string is the rate (% optional).
const WHOLE_RANGE = new RegExp(`^(?:between\\s+)?${N}${PO}${PA}${SEP}${N}${PO}${PA}\\s*\\*?$`, 'i');
const WHOLE_FROM = new RegExp(`^(?:${FROM_WORDS}\\s*${N}${PO}${PA}|${N}${PO}${PA}\\s*${ONWARD_WORDS})\\s*\\*?$`, 'i');
const WHOLE_EXACT = new RegExp(`^${N}${PO}${PA}\\s*\\*?$`, 'i');
// Pass 2 — inside a phrase; every number must wear its % sign.
const IN_RANGE = new RegExp(`(?:between\\s+)?${N}${PR}${PA}${SEP}${N}${PR}`, 'i');
const IN_FROM = new RegExp(`(?:${FROM_WORDS}\\s*${N}${PR}|${N}${PR}${PA}\\s*${ONWARD_WORDS})`, 'i');
const IN_EXACT = new RegExp(`${N}${PR}`, 'i');

// "11,75" (Indonesian decimal comma) → 11.75.
const num = (s) => Number(String(s).replace(',', '.'));
const round3 = (n) => Math.round(n * 1000) / 1000;
const pos = (v, t) => { if (!(v > 0)) throw new Error(`"${t}" is not a positive rate`); return v; };

/**
 * @param {string} text  the cell / phrase as published
 * @param {object} [opts]
 * @param {'exact'|'range'|'from'} [opts.basis]  force the basis when the page
 *        states it outside the cell (a heading "Rates starting from") — the
 *        number itself is still read from the cell, never typed in.
 * @returns {{ basis:'exact'|'range'|'from', value:number, low:number|null, high:number|null }}
 * @throws when the text holds no usable rate, or contradicts a forced basis
 */
export function parseRate(text, opts = {}) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) throw new Error('empty rate');
  const forced = opts.basis;

  const r = WHOLE_RANGE.exec(t) || IN_RANGE.exec(t);
  if (r) {
    if (forced && forced !== 'range') throw new Error(`"${t}" is a range but was declared ${forced}`);
    const a = pos(num(r[1]), t), b = pos(num(r[2]), t);
    const low = Math.min(a, b), high = Math.max(a, b);
    if (low === high) return { basis: 'exact', value: round3(low), low: null, high: null };
    return { basis: 'range', value: round3((low + high) / 2), low: round3(low), high: round3(high) };
  }
  if (forced === 'range') throw new Error(`"${t}" was declared a range but holds no range`);

  const f = WHOLE_FROM.exec(t) || IN_FROM.exec(t);
  if (f) {
    if (forced === 'exact') throw new Error(`"${t}" is a floor ("from") but was declared exact`);
    return { basis: 'from', value: round3(pos(num(f[1] ?? f[2]), t)), low: null, high: null };
  }

  const e = WHOLE_EXACT.exec(t) || IN_EXACT.exec(t);
  if (!e) throw new Error(`"${t}" holds no rate`);
  const v = round3(pos(num(e[1]), t));
  return forced === 'from'
    ? { basis: 'from', value: v, low: null, high: null }
    : { basis: 'exact', value: v, low: null, high: null };
}

/** How a rate reads on screen: "6.25%", "~8.75%", "from 7.50%". */
export function formatRate(value, basis, digits = 2) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '';
  const s = `${v.toFixed(digits)}%`;
  return basis === 'range' ? `~${s}` : basis === 'from' ? `from ${s}` : s;
}
