import { createClient } from '@supabase/supabase-js';

/* Reads Supabase config from Vite env vars. If they're not set yet (e.g. before
   you've created your Supabase project), the app still runs — auth UI simply
   reports that it isn't configured instead of crashing. */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
