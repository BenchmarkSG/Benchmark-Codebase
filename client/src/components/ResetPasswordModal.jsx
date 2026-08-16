import { useRef, useState } from 'react';
import './AuthModal.css';
import { useAuth } from '../context/AuthContext.jsx';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { friendlyError } from '../lib/friendlyError.js';

/* Shown when the user opens a Supabase password-reset link. AuthContext surfaces
   the PASSWORD_RECOVERY event as `recovery`; here they choose a new password,
   then we clear the recovery state (they remain signed in with the new password). */
export default function ResetPasswordModal() {
  const { recovery, updatePassword, clearRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const cardRef = useRef(null);

  useModalA11y(!!recovery, cardRef, clearRecovery);

  if (!recovery) return null;

  const mismatch = confirm.length > 0 && password !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      setDone(true);
    } catch (err) {
      setError(friendlyError(err, 'Could not update your password. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth" role="dialog" aria-modal="true" aria-label="Set a new password">
      <div className="auth__overlay" onClick={clearRecovery} />
      <div className="auth__card" ref={cardRef}>
        <button className="auth__close" onClick={clearRecovery} aria-label="Close">×</button>
        <div className="auth__brand">Bank<span>Benchmark</span>.sg</div>
        <h2 className="auth__title">Set a new password</h2>

        {done ? (
          <>
            <p className="auth__sub">Your password has been updated — you’re now signed in.</p>
            <button className="btn btn--primary btn--block auth__submit" onClick={clearRecovery}>Continue</button>
          </>
        ) : (
          <>
            <p className="auth__sub">Choose a new password for your account.</p>
            <form className="auth__form" onSubmit={submit} noValidate>
              <label className="auth__field">
                <span>New password <em className="auth__req" aria-hidden="true">*</em></span>
                <div className="auth__pw">
                  <input
                    type={showPw ? 'text' : 'password'} required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"
                    autoComplete="new-password" aria-describedby="reset-pw-hint"
                  />
                  <button type="button" className="auth__pw-toggle" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span className="auth__hint" id="reset-pw-hint">Use 6 or more characters.</span>
              </label>
              <label className="auth__field">
                <span>Confirm new password <em className="auth__req" aria-hidden="true">*</em></span>
                <div className="auth__pw">
                  <input
                    type={showPw ? 'text' : 'password'} required minLength={6} value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password"
                    autoComplete="new-password" aria-invalid={mismatch || undefined}
                    aria-describedby={mismatch ? 'reset-pw-mismatch' : undefined}
                  />
                </div>
                {mismatch && <span className="auth__fielderr" id="reset-pw-mismatch">Passwords don’t match yet.</span>}
              </label>
              {error && <div className="auth__error" role="alert">{error}</div>}
              <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={busy}>
                {busy ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
