import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { clearUnlocks, clearRevealSessions } from '../lib/unlocks.js';

// Everything this browser remembers about what has been paid for.
const forgetPurchases = () => { clearUnlocks(); clearRevealSessions(); };

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
      // Not just the button below: this also fires when the user signs out in
      // ANOTHER tab, or when the session expires. Those paths never reach
      // signOut(), and a paid reveal must not survive any of them.
      if (event === 'SIGNED_OUT') forgetPurchases();
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

  // Drop this browser's record of what was purchased on the way out — the next
  // account to sign in here must not inherit someone else's unlocks. BOTH stores
  // have to go: the session hint AND the paid Stripe session ids, which live in
  // localStorage and otherwise outlive the account that bought them.
  // The purchases themselves live in saved_benchmarks, not here.
  const signOut = useCallback(() => { forgetPurchases(); return supabase.auth.signOut(); }, []);

  // Sign out of every device/browser (revokes all refresh tokens). Offered in
  // account settings after a password change or a suspected compromise.
  const signOutEverywhere = useCallback(() => { forgetPurchases(); return supabase.auth.signOut({ scope: 'global' }); }, []);

  // Change the account email. Supabase sends a confirmation link to the NEW
  // address (and, when "secure email change" is on, the old one too); the change
  // only lands once confirmed.
  /* Guest sessions. Booking a call no longer asks for an account up front: the
     first database write starts an anonymous Supabase session, so the booking's
     rows are still owned by someone (RLS is unchanged). It needs "Anonymous
     sign-ins" enabled in the Supabase project; resolves null when it isn't, and
     the caller falls back to the sign-in prompt. */
  const startGuestSession = useCallback(async () => {
    if (!isSupabaseConfigured) return null;
    const { data: existing } = await supabase.auth.getSession();
    if (existing?.session?.user) return existing.session.user;
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) return null;
      return data?.user ?? null;
    } catch { return null; }
  }, []);

  /* Turn the guest into a real account with the email they booked with. Same
     user id, so the booking stays theirs. Supabase mails a confirmation link. */
  const upgradeGuest = useCallback(
    (email) => supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo }),
    [redirectTo]
  );

  const updateEmail = useCallback(
    (email) => supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo }),
    [redirectTo]
  );

  // Merge fields into user_metadata (keeps navbar name/avatar in sync with the
  // profile row without a reload).
  const updateUserMetadata = useCallback(
    (data) => supabase.auth.updateUser({ data }),
    []
  );

  // Verify the CURRENT password by re-signing in. Supabase's updateUser doesn't
  // ask for it, so we check it ourselves before allowing a password change —
  // otherwise a borrowed open session could silently take over the account.
  const verifyPassword = useCallback(async (password) => {
    const email = session?.user?.email;
    if (!email) return { error: new Error('No signed-in account.') };
    return supabase.auth.signInWithPassword({ email, password });
  }, [session]);

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
      // A guest (anonymous) session is not an account: everything that shows
      // "signed in" reads `user`, so a guest stays signed out there.
      user: session?.user && !session.user.is_anonymous ? session.user : null,
      guest: session?.user?.is_anonymous ? session.user : null,
      startGuestSession,
      upgradeGuest,
      recovery,
      signInWithEmail,
      signUpWithEmail,
      signInWithOtp,
      signInWithGoogle: () => signInWithProvider('google'),
      signInWithApple: () => signInWithProvider('apple'),
      resetPassword,
      updatePassword,
      updateEmail,
      updateUserMetadata,
      verifyPassword,
      signOutEverywhere,
      // True when the account can sign in with a password. OAuth-only users have
      // no password yet, so settings offers "set a password" instead of "change".
      hasPasswordIdentity: Boolean(
        session?.user?.identities?.some((i) => i.provider === 'email')
      ),
      providers: (session?.user?.identities || []).map((i) => i.provider),
      clearRecovery,
      signOut,
    }),
    [loading, session, recovery, startGuestSession, upgradeGuest, signInWithEmail, signUpWithEmail, signInWithOtp, signInWithProvider, resetPassword, updatePassword, updateEmail, updateUserMetadata, verifyPassword, signOutEverywhere, clearRecovery, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
