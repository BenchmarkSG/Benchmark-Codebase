import { useState } from 'react';
import './AuthModal.css';
import { useAuth } from '../context/AuthContext.jsx';

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

  if (!recovery) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const { error } = await updatePassword(password);
      if (error) throw error;
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not update your password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth" role="dialog" aria-modal="true" aria-label="Set a new password">
      <div className="auth__overlay" />
      <div className="auth__card">
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
            <form className="auth__form" onSubmit={submit}>
              <label className="auth__field">
                <span>New password</span>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </label>
              <label className="auth__field">
                <span>Confirm new password</span>
                <input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </label>
              {error && <div className="auth__error">{error}</div>}
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
