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
    (provider) =>
      supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
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
      signInWithGoogle: () => signInWithProvider('google'),
      signInWithApple: () => signInWithProvider('apple'),
      resetPassword,
      updatePassword,
      clearRecovery,
      signOut,
    }),
    [loading, session, recovery, signInWithEmail, signUpWithEmail, signInWithProvider, resetPassword, updatePassword, clearRecovery, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
