import { isSupabaseConfigured, userFromToken, clientForToken } from './supabase.js';

/* Server-side guard against selling the same thing twice.

   The ~$1 reveal is bought once per saved benchmark. The client already knows
   not to offer it again (client/src/lib/unlocks.js), but the client can't be
   the guarantee: a stale tab, a second device, a cleared sessionStorage or a
   double-submit all get past it, and every one of those ends in a duplicate
   charge for a product the user already owns. So the decision is made here,
   against the row itself, under the user's own RLS. */

/* saved_benchmarks.stage values that mean the reveal has already been paid for.
   The full vocabulary (supabase/dashboards.sql) is
   new | revealed | email | call | expert | negotiated | dismissed.
   'new' has not been paid for; 'dismissed' only means the row was hidden from
   the dashboard and says nothing either way, so neither blocks a purchase —
   refusing a sale someone is entitled to make is the worse failure here. */
export const REVEALED_STAGES = new Set(['revealed', 'email', 'call', 'expert', 'negotiated']);

export const isRevealPaid = (stage) => REVEALED_STAGES.has(String(stage || '').trim().toLowerCase());

/** The bearer token on a request, or '' when there isn't one. */
export function bearerToken(req) {
  const raw = req?.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return m ? m[1].trim() : '';
}

/** That user's stage for one benchmark. RLS scopes the read to rows they own,
    so another user's id simply returns nothing. */
async function stageOf(token, benchmarkId) {
  const db = clientForToken(token);
  if (!db) return null;
  const { data, error } = await db
    .from('saved_benchmarks').select('stage').eq('id', benchmarkId).maybeSingle();
  if (error) return null;
  return data?.stage || null;
}

/**
 * Decide whether a reveal checkout may go ahead.
 * Returns null to allow, or { status, body } describing the refusal.
 *
 * Without Supabase configured there is nothing to check against, so the route
 * behaves exactly as it did before rather than blocking every sale.
 */
export async function checkRevealPurchase({ token, benchmarkId }) {
  if (!isSupabaseConfigured) return null;

  // Reveal always requires an account (App.jsx never starts one signed-out), so
  // an unverifiable caller is a bug or an attempt — not a paying customer.
  const user = await userFromToken(token);
  if (!user) {
    return { status: 401, body: { error: 'Please sign in again to continue.', code: 'auth_required' } };
  }
  if (!benchmarkId) return null; // nothing to compare against; let it through

  if (!isRevealPaid(await stageOf(token, benchmarkId))) return null;
  return {
    status: 409,
    body: {
      error: 'You’ve already unlocked this benchmark — reopening it is free.',
      code: 'already_purchased',
      benchmarkId,
    },
  };
}
