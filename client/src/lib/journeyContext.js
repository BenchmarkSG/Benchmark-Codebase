/* Turning a saved_benchmarks row back into a journey context.

   Two callers need this and they must not drift: the dashboard, which opens the
   journey for a row the user picked, and the Stripe return, which has to rebuild
   a context the browser lost.

   Why the return can lose it: Stripe sends everyone back to the bare origin, and
   the sessionStorage stash that carries the benchmark across that hop only
   exists in the tab that started it. A mobile 3-D Secure or banking-app hop
   routinely delivers the return into a FRESH tab, where that stash never
   existed. A signed-in buyer should never be dead-ended by that - the purchase
   records which row it was for, and the row is theirs to read back. */
import { getCheckoutSession } from '../api.js';
import { supabase, isSupabaseConfigured, getAccessToken } from './supabase.js';

/** The journey context for a saved_benchmarks row. */
export const contextFromBenchmark = (r) => ({
  segment: r.segment,
  annualSaving: r.annual_saving,
  currency: r.currency,
  unit: r.unit,
  direction: r.direction,
  status: r.result_status,
  bestBank: r.best_bank,
  product: r.product_label || r.product,
  yourRate: r.your_rate,
  benchmarkRate: r.benchmark_rate,
  benchmarkId: r.id,
  // The reveal is asked for per country + product id, not per label, so both
  // have to survive the round trip or the bank can't be fetched on return.
  country: r.country_code,
  productId: r.product,
  // The raw form values, for the same reason the calculator keeps them: the
  // reveal re-derives a cross-border pool from the corridor and the amount.
  inputs: r.inputs || null,
});

/**
 * Rebuild the context for a paid Stripe session when the stash is gone.
 *
 * Returns null - never throws - when it can't: signed out, Supabase not
 * configured, the session wasn't ours, or the row has since been deleted. The
 * caller keeps its existing "couldn't restore" path for those.
 */
export async function recoverPaidContext(sessionId) {
  if (!sessionId || !isSupabaseConfigured) return null;
  try {
    const token = await getAccessToken();
    if (!token) return null;                     // anonymous buyer: no row to find
    // The id comes back only for an authenticated caller (see /api/checkout/session).
    const session = await getCheckoutSession(sessionId, token);
    if (!session?.paid || !session.benchmarkId) return null;
    const { data, error } = await supabase
      .from('saved_benchmarks').select('*').eq('id', session.benchmarkId).maybeSingle();
    if (error || !data) return null;             // RLS says not theirs, or it's gone
    return contextFromBenchmark(data);
  } catch {
    return null;
  }
}
