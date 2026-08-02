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
