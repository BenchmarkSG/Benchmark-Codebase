import { supabase, isSupabaseConfigured } from './supabase.js';

/* A guest's booking, carried into the account they sign in to.

   Booking runs on an anonymous Supabase session. Signing in to an EXISTING
   account swaps that session for a different user id, which would strand the
   booking on a guest nobody can sign in as again. So before any sign-in, a
   guest mints a one-time claim (supabase/guest_claim.sql), and once the
   account is signed in it redeems it, moving the guest's rows across.

   localStorage, not sessionStorage: Google sign-in and email-confirm links can
   come back in a different tab. Every step is best-effort — a missing
   migration or a network blip must never stand in the way of signing in. */
const KEY = 'bb_guest_claim';

export async function mintGuestClaim() {
  if (!isSupabaseConfigured) return;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data?.session?.user?.is_anonymous) return;
    const { data: token, error } = await supabase.rpc('create_guest_claim');
    if (!error && token) localStorage.setItem(KEY, token);
  } catch { /* sign in anyway */ }
}

export async function redeemGuestClaim() {
  let token = null;
  try { token = localStorage.getItem(KEY); } catch { return; }
  if (!token || !isSupabaseConfigured) return;
  try {
    const { error } = await supabase.rpc('redeem_guest_claim', { p_token: token });
    // Single use either way; only a transport failure is worth another try.
    if (!error || error.code) localStorage.removeItem(KEY);
  } catch { /* retried on the next sign-in event */ }
}
