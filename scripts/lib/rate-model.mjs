/* The indicative rate model — the ONE definition of what a made-up rate looks
 * like, shared by the full seeder (scripts/seed-rates.mjs) and the gap filler
 * (scripts/fill-gaps.mjs).
 *
 * It lives here because those two write into the SAME pool. If each carried its
 * own copy of the base rates, a drifted constant would put two different prices
 * on one bank's product depending on which script last touched it, and the pool
 * would quietly stop being comparable — which is the only thing a benchmark is.
 *
 * Everything produced from this model is INDICATIVE (is_indicative = true, the
 * column default). It is shaped to look like a market — per-country bases, a
 * pricing tilt by bank category, a per-variant adjustment — so the app has a
 * plausible pool to demonstrate against. It is not sourced, and it must never be
 * presented as a published rate.
 */
import { COUNTRIES, BANKS } from './roster.mjs';

// --- deterministic pseudo-random in [0,1) from a string seed -----------------
export const unit = (seed) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
};
export const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Category pricing tilt: how a bank tends to price vs the country base (± p.a.).
export const CAT_ADJ = { local: 0.35, foreign: -0.15, european: -0.25, japanese: -0.35, indian: 0.15, digital: -0.6, public: 0.2, private: 0.3, fintech: -0.5 };

// Categories listed as a provider option but NOT benchmarked (no published pool).
export const DIRECTORY_ONLY = new Set(['fintech']);

export const FUNDED = ['import_finance', 'export_finance', 'supplier_finance', 'bill_discounting'];
export const UNFUNDED = ['lc', 'bg', 'sblc'];

// Unified rate pool config. base = local-currency % per country; usd = USD %.
// rateType 'apr' (lower better) | 'yield' (higher better). variants split a
// product into sub-pools (funded / unfunded facility types).
// Products the generator must NEVER invent numbers for, with the reason. These
// are excluded from the coverage check below so they don't warn on every run.
export const NO_SYNTHETIC = new Map([
  ['current_account_fees',
   'benchmarked in real money (metricMode: amount) — a plausible made-up figure ' +
   'reads as a real quote for a real bank\'s charges. Must be sourced.'],
]);

export const RATE_PRODUCTS = [
  { product: 'housing_loan',       rateType: 'apr',   ccy: ['local'],        base: { SG: 3.5, IN: 8.8, MY: 4.2, ID: 9.0, TH: 6.0 } },
  { product: 'personal_loan',      rateType: 'apr',   ccy: ['local'],        base: { SG: 8.5, IN: 12.5, MY: 7.5, ID: 12.0, TH: 9.0 } },
  { product: 'vehicle_loan',       rateType: 'apr',   ccy: ['local'],        base: { SG: 3.2, IN: 9.5, MY: 3.8, ID: 8.5, TH: 5.0 } },
  { product: 'fixed_deposit',      rateType: 'yield', ccy: ['local'],        base: { SG: 3.0, IN: 6.8, MY: 3.2, ID: 5.5, TH: 1.8 } },
  // SG only — `onlyCountries` in the catalog confines this product, and the loop
  // below honours it. The base map is trimmed to match so it can't look as
  // though the other markets are merely awaiting a run. Previous values, kept
  // for whenever a market is confirmed to permit credit interest:
  // IN 3.0 (prohibited by the RBI — do not restore), MY 1.5, ID 2.5, TH 0.5.
  { product: 'current_account',    rateType: 'yield', ccy: ['local'],        base: { SG: 0.8 } },
  { product: 'overdraft',          rateType: 'apr',   ccy: ['local', 'USD'], base: { SG: 6.6, IN: 9.6, MY: 6.9, ID: 9.9, TH: 7.1 }, usd: 7.9 },
  { product: 'short_term_finance', rateType: 'apr',   ccy: ['local', 'USD'], base: { SG: 5.0, IN: 8.2, MY: 5.4, ID: 8.6, TH: 5.6 }, usd: 6.6,
    variants: FUNDED, variantAdj: { import_finance: 0, export_finance: -0.1, supplier_finance: 0.15, bill_discounting: -0.2 } },
  { product: 'unfunded_facility',  rateType: 'apr',   ccy: ['USD'],          usd: 1.0,
    variants: UNFUNDED, variantAdj: { lc: -0.2, bg: 0, sblc: 0.2 } },
];


/* The one place a rate is actually computed. Both scripts call this, so a bank's
   indicative rate is the same number whoever writes it. Deterministic: the same
   inputs always give the same figure, which is what makes a re-run idempotent. */
export function indicativeRate({ bankId, category, product, currency, variant = null, countryCode, isUsd = false }) {
  const p = RATE_PRODUCTS.find((x) => x.product === product);
  if (!p) return null;
  const baseRate = isUsd ? p.usd : p.base?.[countryCode];
  if (baseRate == null) return null;
  const isYield = p.rateType === 'yield';
  const catTilt = (CAT_ADJ[category] ?? 0) * (isYield ? -1 : 1); // keener banks pay more / charge less
  const vAdj = variant && p.variantAdj ? (p.variantAdj[variant] || 0) : 0;
  const jitter = (unit(bankId + product + currency + (variant || '')) - 0.5) * 1.2;
  return round(baseRate + catTilt + vAdj + jitter, 3);
}

export { COUNTRIES, BANKS };
