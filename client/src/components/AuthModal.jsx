import { useState } from 'react';
import './AuthModal.css';
import { useAuth } from '../context/AuthContext.jsx';
import { GoogleIcon, AppleIcon } from './BrandIcons.jsx';

export default function AuthModal({ open, onClose }) {
  const { configured, signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleEmail = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!configured) return setError('Authentication is not configured yet. Add your Supabase keys to enable sign in.');
    setBusy(true);
    try {
      const { error } =
        mode === 'signup'
          ? await signUpWithEmail(form.email, form.password, form.name)
          : await signInWithEmail(form.email, form.password);
      if (error) throw error;
      if (mode === 'signup') {
        setNotice('Check your inbox to confirm your email, then sign in.');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleProvider = async (fn) => {
    setError('');
    if (!configured) return setError('Authentication is not configured yet. Add your Supabase keys to enable sign in.');
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) throw error;
      // On success the browser is redirected to the provider, then back.
    } catch (err) {
      setError(err.message || 'Could not start sign in. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="auth" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="auth__overlay" onClick={onClose} />
      <div className="auth__card">
        <button className="auth__close" onClick={onClose} aria-label="Close">×</button>

        <div className="auth__brand">Bank<span>Benchmark</span>.sg</div>
        <h2 className="auth__title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth__sub">
          {mode === 'signup'
            ? 'Save your benchmarks and track your savings over time.'
            : 'Sign in to pick up where you left off.'}
        </p>

        {!configured && (
          <div className="auth__banner">Auth isn’t configured yet — add your Supabase keys (see AUTH_SETUP.md).</div>
        )}

        <div className="auth__providers">
          <button className="auth__provider" onClick={() => handleProvider(signInWithGoogle)} disabled={busy}>
            <GoogleIcon /> Continue with Google
          </button>
          {/* Apple sign-in temporarily disabled — needs a paid Apple Developer
              account. Re-enable this button once the Apple provider is set up. */}
          {/* <button className="auth__provider auth__provider--apple" onClick={() => handleProvider(signInWithApple)} disabled={busy}>
            <AppleIcon /> Continue with Apple
          </button> */}
        </div>

        <div className="auth__divider"><span>or</span></div>

        <form className="auth__form" onSubmit={handleEmail}>
          {mode === 'signup' && (
            <label className="auth__field">
              <span>Full name</span>
              <input type="text" value={form.name} onChange={set('name')} placeholder="Jane Tan" autoComplete="name" />
            </label>
          )}
          <label className="auth__field">
            <span>Email</span>
            <input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" />
          </label>
          <label className="auth__field">
            <span>Password</span>
            <input type="password" required minLength={6} value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>

          {error && <div className="auth__error">{error}</div>}
          {notice && <div className="auth__notice">{notice}</div>}

          <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth__switch">
          {mode === 'signup' ? 'Already have an account?' : 'New to BankBenchmark?'}{' '}
          <button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setNotice(''); }}>
            {mode === 'signup' ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}
