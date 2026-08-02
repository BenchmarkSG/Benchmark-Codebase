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

/* Maps a calculator product to its source table + how to extract the comparable
   numeric value from each row. Used by getProductValues() below. */
const PRODUCT_SOURCES = {
  overdraft: { kind: 'overdraft' },
  short_term_local: { kind: 'loan', type: 'short_term_local', field: 'interest_rate' },
  short_term_usd: { kind: 'loan', type: 'short_term_usd', field: 'interest_rate' },
  import_lc: { kind: 'loan', type: 'import_lc', field: 'arrangement_fee' },
  export_lc_discount: { kind: 'loan', type: 'export_lc_discount', field: 'interest_rate' },
  remittance: { kind: 'remittance', direction: 'outward', field: 'fx_spread_pct' },
  // Individual products live in the generic product_rates table.
  mortgage: { kind: 'generic', product: 'mortgage' },
  personal_loan: { kind: 'generic', product: 'personal_loan' },
  savings: { kind: 'generic', product: 'savings' },
  fixed_deposit: { kind: 'generic', product: 'fixed_deposit' },
};

export async function getGenericRates(country, product, currency) {
  if (!isSupabaseConfigured) return null;
  return cached(`pr:${country}:${product}:${currency || ''}`, async () => {
    let q = supabase.from('product_rates').select('bank, currency, rate, rate_type')
      .eq('country_code', country).eq('product', product);
    if (currency) q = q.eq('currency', currency);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  });
}

/* Returns the comparable rate values (with the bank behind each) for a calculator
   product, or null when Supabase isn't configured (so the API can 503).
   Shape: { items: [{ bank, value }], values: [value] } — `items` lets callers
   reveal the best-priced bank; `values` is kept for the pure benchmark maths. */
export async function getProductValues(country, product, currency) {
  if (!isSupabaseConfigured) return null;
  const src = PRODUCT_SOURCES[product];
  const pack = (items) => ({ items, values: items.map((i) => i.value) });
  if (!src) return pack([]);

  if (src.kind === 'overdraft') {
    const rows = await getOverdraft(country, currency || undefined);
    return pack((rows || []).map((r) => ({ bank: r.banks?.name || null, value: (Number(r.rate_min) + Number(r.rate_max)) / 2 })));
  }
  if (src.kind === 'loan') {
    const rows = await getLoans(country, src.type);
    return pack((rows || []).map((r) => ({ bank: r.banks?.name || null, value: Number(r[src.field]) })));
  }
  if (src.kind === 'remittance') {
    const rows = await getRemittance(country, src.direction);
    return pack((rows || []).map((r) => ({ bank: r.banks?.name || null, value: Number(r[src.field]) })));
  }
  if (src.kind === 'generic') {
    const rows = await getGenericRates(country, src.product, currency);
    return pack((rows || []).map((r) => ({ bank: r.bank || null, value: Number(r.rate) })));
  }
  return pack([]);
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
