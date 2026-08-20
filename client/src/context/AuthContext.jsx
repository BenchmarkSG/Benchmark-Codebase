import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  // True while the user is in the password-recovery flow (arrived via reset link).
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Load any existing session, then subscribe to changes.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s ?? null);
      // Fired when the browser opens a Supabase reset-password link.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      // Back from an OAuth redirect: restore the hash route the user signed in
      // from (e.g. #dashboard) — the provider round-trip lands on the bare origin.
      if (event === 'SIGNED_IN') {
        try {
          const h = sessionStorage.getItem('bb_return_hash');
          if (h) {
            sessionStorage.removeItem('bb_return_hash');
            if (window.location.hash !== h) window.location.hash = h;
          }
        } catch { /* ignore */ }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const redirectTo =
    typeof window !== 'undefined' ? window.location.origin : undefined;

  const signInWithEmail = useCallback(
    (email, password) => supabase.auth.signInWithPassword({ email, password }),
    []
  );

  // profile: { full_name, phone, monthly_income } — stored in user metadata and
  // copied into public.user_profiles by the on_auth_user_created trigger.
  const signUpWithEmail = useCallback(
    (email, password, profile = {}) =>
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: profile.full_name,
            phone: profile.phone,
            monthly_income: profile.monthly_income,
          },
          emailRedirectTo: redirectTo,
        },
      }),
    [redirectTo]
  );

  const signInWithProvider = useCallback(
    (provider) => {
      // OAuth reloads the page at the bare origin, dropping the hash route (e.g.
      // the #dashboard gate the user was signing in from). Stash it; the auth
      // listener below restores it after SIGNED_IN.
      try {
        const h = window.location.hash;
        if (h && !h.includes('access_token')) sessionStorage.setItem('bb_return_hash', h);
      } catch { /* ignore */ }
      return supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
    },
    [redirectTo]
  );

  // Passwordless: create the account (if it doesn't exist yet) from just an email
  // + name and send a magic sign-in link. Used by the reveal flow so a first-time
  // user never hits a sign-in screen — they enter name + email, pay, and this
  // email becomes their login. No password, and (crucially) no service-role key.
  const signInWithOtp = useCallback(
    (email, profile = {}) =>
      supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectTo,
          data: { full_name: profile.full_name },
        },
      }),
    [redirectTo]
  );

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  // Send a password-reset email; the link brings the user back to `redirectTo`.
  const resetPassword = useCallback(
    (email) => supabase.auth.resetPasswordForEmail(email, { redirectTo }),
    [redirectTo]
  );

  // Set a new password for the currently-authenticated (recovery) user.
  const updatePassword = useCallback(
    (password) => supabase.auth.updateUser({ password }),
    []
  );

  const clearRecovery = useCallback(() => setRecovery(false), []);

  const value = useMemo(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      recovery,
      signInWithEmail,
      signUpWithEmail,
      signInWithOtp,
      signInWithGoogle: () => signInWithProvider('google'),
      signInWithApple: () => signInWithProvider('apple'),
      resetPassword,
      updatePassword,
      clearRecovery,
      signOut,
    }),
    [loading, session, recovery, signInWithEmail, signUpWithEmail, signInWithOtp, signInWithProvider, resetPassword, updatePassword, clearRecovery, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
