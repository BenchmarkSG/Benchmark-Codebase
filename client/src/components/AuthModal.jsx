import { useRef, useState } from 'react';
import './AuthModal.css';
import { useAuth } from '../context/AuthContext.jsx';
import { GoogleIcon } from './BrandIcons.jsx';
import { INCOME_BRACKETS } from '../lib/profileFields.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { friendlyError } from '../lib/friendlyError.js';
import { firstInvalidField, validationMessage } from '../lib/validateForm.js';

export default function AuthModal({ open, onClose }) {
  const { configured, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'reset'
  const [form, setForm] = useState({ name: '', email: '', phone: '', income: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPw, setShowPw] = useState(false);
  const cardRef = useRef(null);
  const formRef = useRef(null);

  useModalA11y(open, cardRef, onClose);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live mismatch hint once both password fields have content (signup only).
  const mismatch = mode === 'signup' && form.confirm.length > 0 && form.password !== form.confirm;

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

    const bad = firstInvalidField(formRef.current);
    if (bad) { setError(validationMessage(bad)); bad.focus(); return; }
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
        // Clear the flow and drop the user on sign-in with a clear next step, so
        // they can't accidentally resubmit into an "already registered" error.
        setMode('signin');
        setForm((f) => ({ ...f, password: '', confirm: '' }));
        setNotice('Check your inbox to confirm your email, then sign in below.');
      } else {
        const { error } = await signInWithEmail(form.email, form.password);
        if (error) throw error;
        onClose();
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleProvider = async (fn) => {
    setError('');
    if (!configured) return setError('Authentication is not configured yet. Add your Supabase keys to enable sign in.');
    setBusy(true);
    setNotice('Redirecting to Google…');
    try {
      const { error } = await fn();
      if (error) throw error;
      // On success the browser is redirected to the provider, then back.
    } catch (err) {
      setNotice('');
      setError(friendlyError(err, 'Could not start sign in. Please try again.'));
      setBusy(false);
    }
  };

  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back';
  const sub =
    mode === 'signup' ? 'Save your benchmarks and track your savings over time.'
    : mode === 'reset' ? 'Enter your email and we’ll send you a link to set a new password.'
    : 'Sign in to pick up where you left off.';
  const submitLabel = busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in';
  const Req = () => <em className="auth__req" aria-hidden="true">*</em>;

  return (
    <div className="auth" role="dialog" aria-modal="true" aria-label={title}>
      <div className="auth__overlay" onClick={onClose} />
      <div className="auth__card" ref={cardRef}>
        <button className="auth__close" onClick={onClose} aria-label="Close">×</button>

        <div className="auth__brand"><span>Fee</span>Optima</div>
        <h2 className="auth__title">{title}</h2>
        <p className="auth__sub">{sub}</p>

        {!configured && (
          <div className="auth__banner">Auth isn’t configured yet — add your Supabase keys (see AUTH_SETUP.md).</div>
        )}

        {mode !== 'reset' && (
          <>
            <div className="auth__providers">
              <button className="auth__provider" onClick={() => handleProvider(signInWithGoogle)} disabled={busy}>
                <GoogleIcon /> {busy ? 'Connecting…' : 'Continue with Google'}
              </button>
            </div>
            <div className="auth__divider"><span>or</span></div>
          </>
        )}

        <form className="auth__form" ref={formRef} onSubmit={handleEmail} noValidate>
          {mode === 'signup' && (
            <label className="auth__field">
              <span>Full name <Req /></span>
              <input type="text" required value={form.name} onChange={set('name')} placeholder="Jane Tan" autoComplete="name" />
            </label>
          )}
          <label className="auth__field">
            <span>Email <Req /></span>
            <input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" inputMode="email" />
          </label>
          {mode === 'signup' && (
            <>
              <label className="auth__field">
                <span>Phone (WhatsApp) <Req /></span>
                <input type="tel" required value={form.phone} onChange={set('phone')} placeholder="+65 9123 4567" autoComplete="tel" inputMode="tel" />
              </label>
              <label className="auth__field">
                <span>Monthly income <Req /></span>
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
              <span>Password <Req /></span>
              <div className="auth__pw">
                <input
                  type={showPw ? 'text' : 'password'} required minLength={6} value={form.password}
                  onChange={set('password')} placeholder="At least 6 characters"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  aria-describedby={mode === 'signup' ? 'auth-pw-hint' : undefined}
                />
                <button type="button" className="auth__pw-toggle" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw}>
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'signup' && <span className="auth__hint" id="auth-pw-hint">Use 6 or more characters.</span>}
            </label>
          )}
          {mode === 'signup' && (
            <label className="auth__field">
              <span>Confirm password <Req /></span>
              <div className="auth__pw">
                <input
                  type={showPw ? 'text' : 'password'} required minLength={6} value={form.confirm}
                  onChange={set('confirm')} placeholder="Re-enter password" autoComplete="new-password"
                  aria-invalid={mismatch || undefined} aria-describedby={mismatch ? 'auth-pw-mismatch' : undefined}
                />
              </div>
              {mismatch && <span className="auth__fielderr" id="auth-pw-mismatch">Passwords don’t match yet.</span>}
            </label>
          )}
          {mode === 'signin' && (
            <button type="button" className="auth__forgot" onClick={() => switchMode('reset')}>
              Forgot password?
            </button>
          )}

          {error && <div className="auth__error" role="alert">{error}</div>}
          {notice && <div className="auth__notice" role="status">{notice}</div>}

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
            <>New to FeeOptima?{' '}
              <button type="button" onClick={() => switchMode('signup')}>Create one</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
