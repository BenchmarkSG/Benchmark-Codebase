import { useState } from 'react';
import './AuthModal.css';
import { useAuth } from '../context/AuthContext.jsx';
import { GoogleIcon, AppleIcon } from './BrandIcons.jsx';
import { INCOME_BRACKETS } from '../lib/profileFields.js';

export default function AuthModal({ open, onClose }) {
  const { configured, signInWithEmail, signUpWithEmail, signInWithGoogle, signInWithApple, resetPassword } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'reset'
  const [form, setForm] = useState({ name: '', email: '', phone: '', income: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Switch between sign in / sign up / reset, clearing transient + secret fields.
  const switchMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    setForm((f) => ({ ...f, password: '', confirm: '' }));
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!configured) return setError('Authentication is not configured yet. Add your Supabase keys to enable sign in.');
    if (mode === 'signup' && form.password !== form.confirm) {
      return setError('Passwords do not match.');
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        const { error } = await resetPassword(form.email.trim());
        if (error) throw error;
        setNotice('If an account exists for that email, a password-reset link is on its way. Check your inbox.');
      } else if (mode === 'signup') {
        const { error } = await signUpWithEmail(form.email, form.password, {
          full_name: form.name,
          phone: form.phone,
          monthly_income: form.income,
        });
        if (error) throw error;
        setNotice('Check your inbox to confirm your email, then sign in.');
      } else {
        const { error } = await signInWithEmail(form.email, form.password);
        if (error) throw error;
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

  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back';
  const sub =
    mode === 'signup' ? 'Save your benchmarks and track your savings over time.'
    : mode === 'reset' ? 'Enter your email and we’ll send you a link to set a new password.'
    : 'Sign in to pick up where you left off.';
  const submitLabel = busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in';

  return (
    <div className="auth" role="dialog" aria-modal="true" aria-label={title}>
      <div className="auth__overlay" onClick={onClose} />
      <div className="auth__card">
        <button className="auth__close" onClick={onClose} aria-label="Close">×</button>

        <div className="auth__brand">Bank<span>Benchmark</span>.sg</div>
        <h2 className="auth__title">{title}</h2>
        <p className="auth__sub">{sub}</p>

        {!configured && (
          <div className="auth__banner">Auth isn’t configured yet — add your Supabase keys (see AUTH_SETUP.md).</div>
        )}

        {mode !== 'reset' && (
          <>
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
          </>
        )}

        <form className="auth__form" onSubmit={handleEmail}>
          {mode === 'signup' && (
            <label className="auth__field">
              <span>Full name</span>
              <input type="text" required value={form.name} onChange={set('name')} placeholder="Jane Tan" autoComplete="name" />
            </label>
          )}
          <label className="auth__field">
            <span>Email</span>
            <input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" />
          </label>
          {mode === 'signup' && (
            <>
              <label className="auth__field">
                <span>Phone (WhatsApp)</span>
                <input type="tel" required value={form.phone} onChange={set('phone')} placeholder="+65 9123 4567" autoComplete="tel" />
              </label>
              <label className="auth__field">
                <span>Monthly income</span>
                <select className="auth__select" required value={form.income} onChange={set('income')}>
                  <option value="" disabled>Select a range…</option>
                  {INCOME_BRACKETS.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {mode !== 'reset' && (
            <label className="auth__field">
              <span>Password</span>
              <input type="password" required minLength={6} value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </label>
          )}
          {mode === 'signup' && (
            <label className="auth__field">
              <span>Confirm password</span>
              <input type="password" required minLength={6} value={form.confirm} onChange={set('confirm')} placeholder="••••••••" autoComplete="new-password" />
            </label>
          )}
          {mode === 'signin' && (
            <button type="button" className="auth__forgot" onClick={() => switchMode('reset')}>
              Forgot password?
            </button>
          )}

          {error && <div className="auth__error">{error}</div>}
          {notice && <div className="auth__notice">{notice}</div>}

          <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={busy}>
            {submitLabel}
          </button>

          {mode === 'signup' && (
            <p className="auth__legal">
              By creating an account you agree to our{' '}
              <a href="#terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a> and{' '}
              <a href="#privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            </p>
          )}
        </form>

        <p className="auth__switch">
          {mode === 'reset' ? (
            <>Remembered it?{' '}
              <button type="button" onClick={() => switchMode('signin')}>Back to sign in</button>
            </>
          ) : mode === 'signup' ? (
            <>Already have an account?{' '}
              <button type="button" onClick={() => switchMode('signin')}>Sign in</button>
            </>
          ) : (
            <>New to BankBenchmark?{' '}
              <button type="button" onClick={() => switchMode('signup')}>Create one</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
