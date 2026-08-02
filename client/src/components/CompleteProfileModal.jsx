import { useEffect, useState } from 'react';
import './AuthModal.css';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { INCOME_BRACKETS, isProfileComplete } from '../lib/profileFields.js';

/* Shown after sign-in when a user's profile is missing the phone / income we
   normally collect at sign-up — i.e. OAuth (Google) sign-ups. It's a gentle
   nudge: users can skip for now, and it reappears next visit until completed. */
export default function CompleteProfileModal() {
  const { configured, user, recovery } = useAuth();
  const [needs, setNeeds] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', income: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  // Check the signed-in user's profile whenever they change.
  useEffect(() => {
    if (!configured || !user) { setNeeds(false); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('full_name, phone, monthly_income')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled || error) return; // fail silent (e.g. table not created yet)
      if (!isProfileComplete(data)) {
        const meta = user.user_metadata || {};
        setForm({
          name: data?.full_name || meta.full_name || meta.name || '',
          phone: data?.phone || '',
          income: data?.monthly_income || '',
        });
        setNeeds(true);
      }
    })();
    return () => { cancelled = true; };
  }, [configured, user]);

  // Don't stack on top of the password-reset modal.
  if (!user || !needs || dismissed || recovery) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // upsert so it works whether or not the trigger already created a row.
      const { error } = await supabase.from('user_profiles').upsert({
        id: user.id,
        full_name: form.name || null,
        email: user.email,
        phone: form.phone,
        monthly_income: form.income,
      });
      if (error) throw error;
      setNeeds(false);
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth" role="dialog" aria-modal="true" aria-label="Complete your profile">
      <div className="auth__overlay" onClick={() => setDismissed(true)} />
      <div className="auth__card">
        <button className="auth__close" onClick={() => setDismissed(true)} aria-label="Close">×</button>

        <div className="auth__brand">Bank<span>Benchmark</span>.sg</div>
        <h2 className="auth__title">Complete your profile</h2>
        <p className="auth__sub">
          Just two more details so we can tailor your benchmarks and reach you on WhatsApp.
        </p>

        <form className="auth__form" onSubmit={submit}>
          <label className="auth__field">
            <span>Full name</span>
            <input type="text" required value={form.name} onChange={set('name')} placeholder="Jane Tan" autoComplete="name" />
          </label>
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

          {error && <div className="auth__error">{error}</div>}

          <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>

        <p className="auth__switch">
          <button type="button" onClick={() => setDismissed(true)}>I’ll do this later</button>
        </p>
      </div>
    </div>
  );
}
