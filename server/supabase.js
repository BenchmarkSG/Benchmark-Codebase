import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

/* Server reads reference/rate data from Supabase using the anon key (RLS allows
   public SELECT on the rate tables). If env isn't set, `supabase` is null and the
   rate endpoints respond with a clear 503 (see PRODUCT_DATA.md to configure). */
const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anon);

export const supabase = isSupabaseConfigured
  ? createClient(url, anon, { auth: { persistSession: false } })
  : null;

/* Verify a Supabase access token and return the user it belongs to, or null if
   it's missing, expired or forged. The anon client is enough for this — the
   service-role key must never be present in this runtime. */
export async function userFromToken(jwt) {
  if (!supabase || !jwt) return null;
  try {
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

/* A client that acts AS that user, so RLS — not this process — decides which
   rows it can see. Used for the few reads the API makes on a user's own data. */
export function clientForToken(jwt) {
  if (!isSupabaseConfigured || !jwt) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
