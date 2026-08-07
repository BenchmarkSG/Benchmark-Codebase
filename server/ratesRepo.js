import { supabase, isSupabaseConfigured } from './supabase.js';
import { benchmarkValues, getProduct } from './benchmark.js';

/* Thin, cached data-access layer over the Supabase rate tables.
   Every reader returns null when Supabase isn't configured so callers can respond
   with a clear "not configured" error. */

const TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // key -> { at, value }

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export const ratesConfigured = isSupabaseConfigured;

export async function getCountries() {
  if (!isSupabaseConfigured) return null;
  return cached('countries', async () => {
    const { data, error } = await supabase
      .from('countries')
      .select('code, name, currency, currency_symbol')
      .order('display_order');
    if (error) throw error;
    return data;
  });
}

export async function getBanks(country) {
  if (!isSupabaseConfigured) return null;
  return cached(`banks:${country}`, async () => {
    let q = supabase.from('banks').select('id, name, category, country_code').order('display_order');
    if (country) q = q.eq('country_code', country);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  });
}

const BANK_JOIN = 'banks!inner(id, name, category, country_code)';

export async function getOverdraft(country, currency) {
  if (!isSupabaseConfigured) return null;
  return cached(`od:${country}:${currency || ''}`, async () => {
    let q = supabase.from('overdraft_rates').select(`rate_min, rate_max, currency, ${BANK_JOIN}`);
    if (country) q = q.eq('banks.country_code', country);
    if (currency) q = q.eq('currency', currency);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  });
}

export async function getRemittance(country, direction) {
  if (!isSupabaseConfigured) return null;
  return cached(`rem:${country}:${direction || ''}`, async () => {
    let q = supabase
      .from('remittance_charges')
      .select(`direction, counterparty, amount, amount_currency, upfront_fee, intermediary_fee, lifting_fee, fee_currency, fx_spread_pct, ${BANK_JOIN}`);
    if (country) q = q.eq('banks.country_code', country);
    if (direction) q = q.eq('direction', direction);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  });
}

export async function getLoans(country, productType) {
  if (!isSupabaseConfigured) return null;
  return cached(`loan:${country}:${productType || ''}`, async () => {
    let q = supabase
      .from('loan_products')
      .select(`product_type, currency, interest_rate, tenor_months, arrangement_fee, other_fees, notes, ${BANK_JOIN}`);
    if (country) q = q.eq('banks.country_code', country);
    if (productType) q = q.eq('product_type', productType);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  });
}

export async function getThresholds(country) {
  if (!isSupabaseConfigured) return null;
  return cached(`thr:${country}`, async () => {
    let q = supabase
      .from('negotiation_thresholds')
      .select('country_code, product, target_saving, saving_currency, threshold_amount, switching_cost, switching_weeks, worthwhile, notes');
    if (country) q = q.eq('country_code', country);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  });
}

/* Unified rate pool. Every 'rate'-family product (loans, deposits, current
   account, overdraft, short-term & unfunded facilities) lives in product_rates,
   keyed by product id + optional `variant` (funded/unfunded type). */
export async function getGenericRates(country, product, currency, variant) {
  if (!isSupabaseConfigured) return null;
  return cached(`pr:${country}:${product}:${currency || ''}:${variant || ''}`, async () => {
    let q = supabase.from('product_rates').select('bank, currency, rate, rate_type, variant')
      .eq('country_code', country).eq('product', product);
    if (currency) q = q.eq('currency', currency);
    if (variant) q = q.eq('variant', variant);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  });
}

/* Cross-border: turn each bank's remittance row into an all-in cost % (FX spread
   plus fees expressed as a % of the notional) so it's comparable to the user's
   computed cost. Benchmarks the outgoing leg. */
export async function getCrossBorderCostPool(country) {
  if (!isSupabaseConfigured) return null;
  const rows = await getRemittance(country, 'outgoing');
  const items = (rows || []).map((r) => {
    const amt = Number(r.amount) || 0;
    const fees = Number(r.upfront_fee || 0) + Number(r.intermediary_fee || 0) + Number(r.lifting_fee || 0);
    const feePct = amt > 0 ? (fees / amt) * 100 : 0;
    const costPct = Number(r.fx_spread_pct || 0) + feePct;
    return { bank: r.banks?.name || null, value: Math.round(costPct * 100) / 100 };
  });
  return { items, values: items.map((i) => i.value) };
}

/* Returns the comparable values (with the bank behind each) for a product, or
   null when Supabase isn't configured. Shape: { items:[{bank,value}], values:[] }. */
export async function getProductValues(country, product, currency, variant) {
  if (!isSupabaseConfigured) return null;
  const meta = getProduct(product);
  const pack = (items) => ({ items, values: items.map((i) => i.value) });
  if (!meta) return pack([]);

  if (meta.family === 'crossborder') {
    return getCrossBorderCostPool(country);
  }
  const rows = await getGenericRates(country, product, currency, variant);
  return pack((rows || []).map((r) => ({ bank: r.bank || null, value: Number(r.rate) })));
}

/* Benchmark summary for a rate product: masks bank identities (per the product's
   reveal-on-CTA model) and returns best / median / market-typical figures.
   Delegates value extraction to getProductValues (correct field per product) and
   the maths to benchmarkValues (the single canonical benchmarking path). */
export async function getRateBenchmark(country, product, currency) {
  const meta = getProduct(product);
  if (!meta) return null;
  const data = await getProductValues(country, product, currency);
  if (!data || !data.values.length) return null;

  const b = benchmarkValues(data.values, { rateType: meta.rateType });
  if (!b) return null;
  return {
    country,
    product,
    currency: currency || null,
    poolSize: b.poolSize,
    best: b.best,
    median: b.median,
    marketTypical: b.marketTypical,
    unit: meta.unit,
    benchmarkMasked: true,
    note: 'Indicative benchmark. Provider identities revealed after a connection request.',
  };
}
