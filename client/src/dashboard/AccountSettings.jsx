import { useCallback, useEffect, useRef, useState } from 'react';
import './accountSettings.css';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getMyProfile, updateMyProfile, uploadAvatar, removeAvatarFile,
  requestAccountDeletion, getMyDeletionRequest, cancelAccountDeletion,
} from '../lib/dashboardApi.js';
import { INCOME_BRACKETS } from '../lib/profileFields.js';
import { friendlyError } from '../lib/friendlyError.js';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { Avatar } from '../components/DefaultAvatar.jsx';

/* Account settings — shared by the user, advisor and admin dashboards.
   Every write is RLS-scoped to the signed-in account (supabase/account_settings.sql).
   `role` only tailors which sections show:
     user    — full set
     advisor — hides income (their public profile lives in the Profile tab)
     admin   — hides income + deletion (an admin must not self-delete the portal login) */

const MIN_PASSWORD = 8;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// Until supabase/account_settings.sql has been run, the new columns/table don't
// exist yet. Say so plainly instead of a generic failure — it's a setup step,
// not a user error.
const isMissingSchema = (err) => {
  const m = String(err?.message || err?.error_description || '').toLowerCase();
  return (m.includes('column') && m.includes('does not exist'))
    || m.includes('schema cache')
    || (m.includes('relation') && m.includes('does not exist'));
};
const settingsError = (err, fallback) =>
  (isMissingSchema(err)
    ? 'Account settings aren’t set up on the database yet — run supabase/account_settings.sql in the Supabase SQL editor.'
    : friendlyError(err, fallback));

/* One settings card. */
function Card({ title, desc, children, tone }) {
  return (
    <section className={`acct__card ${tone ? `acct__card--${tone}` : ''}`}>
      <div className="acct__card-head">
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      {children}
    </section>
  );
}

/* Inline status line for a section (saved / error), announced to screen readers. */
function Status({ ok, err }) {
  if (!ok && !err) return null;
  return (
    <p className={`acct__status ${err ? 'is-err' : 'is-ok'}`} role="status">
      {err || ok}
    </p>
  );
}

export default function AccountSettings({ role = 'user', onProfileSaved, syncAvatar }) {
  const {
    user, updateEmail, updatePassword, updateUserMetadata, verifyPassword,
    signOutEverywhere, resetPassword, hasPasswordIdentity, providers,
  } = useAuth();
  const confirm = useConfirm();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setProfile(await getMyProfile()); setLoadErr(''); }
    catch (err) { setLoadErr(settingsError(err, 'Could not load your profile.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="acct__loading">Loading your account…</div>;
  if (loadErr) return <div className="acct__loading acct__loading--err">{loadErr}</div>;

  return (
    <div className="acct">
      <IdentityCard
        role={role} user={user} profile={profile} setProfile={setProfile}
        updateUserMetadata={updateUserMetadata} onProfileSaved={onProfileSaved}
        syncAvatar={syncAvatar}
      />
      <NotificationsCard profile={profile} setProfile={setProfile} />
      <EmailCard user={user} updateEmail={updateEmail} />
      <PasswordCard
        user={user} hasPassword={hasPasswordIdentity} providers={providers}
        verifyPassword={verifyPassword} updatePassword={updatePassword} resetPassword={resetPassword}
      />
      <SecurityCard user={user} providers={providers} signOutEverywhere={signOutEverywhere} confirm={confirm} />
      {role !== 'admin' && <DangerCard confirm={confirm} />}
    </div>
  );
}

/* ---- Photo + personal details --------------------------------------------- */
function IdentityCard({ role, user, profile, setProfile, updateUserMetadata, onProfileSaved, syncAvatar }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || user?.user_metadata?.full_name || '',
    phone: profile?.phone || '',
    company: profile?.company || '',
    monthly_income: profile?.monthly_income || '',
  });
  const [avatar, setAvatar] = useState(profile?.avatar_url || user?.user_metadata?.avatar_url || '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setOk(''); setErr(''); };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;
    setOk(''); setErr('');
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setErr('Please choose a PNG, JPG or WebP image.'); return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setErr('That image is larger than 2 MB — please pick a smaller one.'); return;
    }
    setUploading(true);
    try {
      const previous = avatar;
      const url = await uploadAvatar(file);
      await updateMyProfile({ avatar_url: url });
      await updateUserMetadata({ avatar_url: url }); // keeps dashboard chrome in sync
      setAvatar(url);
      setProfile((p) => ({ ...(p || {}), avatar_url: url }));
      // Advisors: keep the public expert-picker photo in step with this one.
      try { await syncAvatar?.(url); } catch { /* public photo sync is best-effort */ }
      removeAvatarFile(previous); // best-effort cleanup of the old file
      setOk('Photo updated.');
      onProfileSaved?.();
    } catch (e2) {
      setErr(settingsError(e2, 'Could not upload that photo. Please try again.'));
    } finally { setUploading(false); }
  };

  const clearPhoto = async () => {
    setUploading(true); setOk(''); setErr('');
    try {
      const previous = avatar;
      await updateMyProfile({ avatar_url: null });
      await updateUserMetadata({ avatar_url: null });
      setAvatar('');
      setProfile((p) => ({ ...(p || {}), avatar_url: null }));
      try { await syncAvatar?.(null); } catch { /* public photo sync is best-effort */ }
      removeAvatarFile(previous);
      setOk('Photo removed.');
      onProfileSaved?.();
    } catch (e2) {
      setErr(settingsError(e2, 'Could not remove that photo.'));
    } finally { setUploading(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setOk(''); setErr('');
    try {
      const patch = {
        full_name: form.full_name.trim() || null,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
      };
      if (role === 'user') patch.monthly_income = form.monthly_income || null;
      const row = await updateMyProfile(patch);
      // Mirror into auth metadata so the navbar / dashboard header update now.
      await updateUserMetadata({ full_name: patch.full_name, phone: patch.phone });
      setProfile(row);
      setOk('Details saved.');
      onProfileSaved?.();
    } catch (e2) {
      setErr(settingsError(e2, 'Could not save your details.'));
    } finally { setBusy(false); }
  };

  return (
    <Card title="Profile" desc="Your photo and contact details. Used across your dashboard and on anything we send you.">
      <div className="acct__avatar-row">
        <Avatar url={avatar} className="acct__avatar" alt="Your profile picture" />
        <div className="acct__avatar-actions">
          <button type="button" className="btn btn--ghost acct__btn-sm" disabled={uploading}
            onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : avatar ? 'Change photo' : 'Upload photo'}
          </button>
          {avatar && (
            <button type="button" className="acct__linkbtn" onClick={clearPhoto} disabled={uploading}>Remove</button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
            onChange={pickPhoto} hidden />
          <p className="acct__hint">PNG, JPG or WebP · up to 2 MB.</p>
        </div>
      </div>

      <form className="acct__form" onSubmit={save}>
        <div className="acct__row">
          <label className="acct__field">
            <span>Full name</span>
            <input type="text" value={form.full_name} onChange={set('full_name')}
              placeholder="Jane Tan" autoComplete="name" />
          </label>
          <label className="acct__field">
            <span>Mobile (WhatsApp)</span>
            <input type="tel" value={form.phone} onChange={set('phone')}
              placeholder="+65 9123 4567" autoComplete="tel" inputMode="tel" />
          </label>
        </div>
        <div className="acct__row">
          <label className="acct__field">
            <span>Company <em className="acct__opt">optional</em></span>
            <input type="text" value={form.company} onChange={set('company')} placeholder="Acme Pte Ltd" />
          </label>
          {role === 'user' ? (
            <label className="acct__field">
              <span>Monthly income</span>
              <select value={form.monthly_income} onChange={set('monthly_income')}>
                <option value="">Prefer not to say</option>
                {INCOME_BRACKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </label>
          ) : <div className="acct__field acct__field--spacer" aria-hidden="true" />}
        </div>

        <Status ok={ok} err={err} />
        <div className="acct__actions">
          <button className="btn btn--primary acct__btn-sm" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>

      {role === 'advisor' && (
        <p className="acct__hint acct__hint--foot">
          This photo is also what clients see in the expert picker. The rest of your public advisor
          profile — bio, specialisation, products, scheduling link — lives in the
          {' '}<strong>Public profile</strong> tab.
        </p>
      )}
    </Card>
  );
}

/* ---- Notification preferences --------------------------------------------- */
function NotificationsCard({ profile, setProfile }) {
  const [prefs, setPrefs] = useState({
    product_emails: profile?.product_emails !== false,
    marketing_opt_in: profile?.marketing_opt_in !== false,
  });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  const toggle = async (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setBusy(true); setOk(''); setErr('');
    try {
      const row = await updateMyProfile({ [key]: next[key] });
      setProfile(row);
      setOk('Preferences saved.');
    } catch (e) {
      setPrefs(prefs); // revert the optimistic flip
      setErr(settingsError(e, 'Could not save that preference.'));
    } finally { setBusy(false); }
  };

  return (
    <Card title="Notifications" desc="What we're allowed to email you about.">
      <label className="acct__toggle">
        <input type="checkbox" checked={prefs.product_emails} disabled={busy}
          onChange={() => toggle('product_emails')} />
        <span>
          <strong>Account &amp; benchmark emails</strong>
          <em>Receipts, reveal confirmations, booking reminders and rate-change alerts on your saved benchmarks.</em>
        </span>
      </label>
      <label className="acct__toggle">
        <input type="checkbox" checked={prefs.marketing_opt_in} disabled={busy}
          onChange={() => toggle('marketing_opt_in')} />
        <span>
          <strong>Product news &amp; tips</strong>
          <em>Occasional negotiation tips and new-market announcements. No more than monthly.</em>
        </span>
      </label>
      <Status ok={ok} err={err} />
    </Card>
  );
}

/* ---- Email address --------------------------------------------------------- */
function EmailCard({ user, updateEmail }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const next = email.trim().toLowerCase();
    setOk(''); setErr('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) { setErr('Please enter a valid email address.'); return; }
    if (next === (user?.email || '').toLowerCase()) { setErr('That is already your email address.'); return; }
    setBusy(true);
    try {
      const { error } = await updateEmail(next);
      if (error) throw error;
      setOk(`Confirmation sent to ${next}. Your sign-in email changes once you click that link.`);
      setEmail('');
    } catch (e2) {
      setErr(friendlyError(e2, 'Could not start the email change.'));
    } finally { setBusy(false); }
  };

  return (
    <Card title="Email address" desc="This is your sign-in address and where receipts go.">
      <p className="acct__current">
        Current: <strong>{user?.email}</strong>
      </p>
      <form className="acct__form" onSubmit={submit}>
        <label className="acct__field">
          <span>New email address</span>
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setOk(''); setErr(''); }}
            placeholder="you@company.com" autoComplete="email" />
        </label>
        <Status ok={ok} err={err} />
        <div className="acct__actions">
          <button className="btn btn--primary acct__btn-sm" type="submit" disabled={busy || !email}>
            {busy ? 'Sending…' : 'Send confirmation link'}
          </button>
          <span className="acct__hint">We'll email the new address to confirm it's yours.</span>
        </div>
      </form>
    </Card>
  );
}

/* ---- Password -------------------------------------------------------------- */
function PasswordCard({ user, hasPassword, providers, verifyPassword, updatePassword, resetPassword }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setOk(''); setErr(''); };
  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;

  const submit = async (e) => {
    e.preventDefault();
    setOk(''); setErr('');
    if (form.next.length < MIN_PASSWORD) { setErr(`Use at least ${MIN_PASSWORD} characters.`); return; }
    if (form.next !== form.confirm) { setErr('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      // Prove they know the current password before changing it (an open session
      // alone shouldn't be enough to lock the real owner out).
      if (hasPassword) {
        const { error } = await verifyPassword(form.current);
        if (error) { setErr('That current password is not right.'); setBusy(false); return; }
      }
      const { error } = await updatePassword(form.next);
      if (error) throw error;
      setForm({ current: '', next: '', confirm: '' });
      setOk(hasPassword ? 'Password changed.' : 'Password set — you can now sign in with email and password.');
    } catch (e2) {
      setErr(friendlyError(e2, 'Could not update your password.'));
    } finally { setBusy(false); }
  };

  const sendReset = async () => {
    setBusy(true); setOk(''); setErr('');
    try {
      const { error } = await resetPassword(user?.email);
      if (error) throw error;
      setOk('Reset link sent — check your inbox.');
    } catch (e2) {
      setErr(friendlyError(e2, 'Could not send the reset link.'));
    } finally { setBusy(false); }
  };

  const otherProviders = providers.filter((p) => p !== 'email');

  return (
    <Card
      title={hasPassword ? 'Password' : 'Set a password'}
      desc={hasPassword
        ? 'Change the password you use to sign in.'
        : `You currently sign in with ${otherProviders.join(', ') || 'a magic link'}. Set a password to also sign in directly.`}
    >
      <form className="acct__form" onSubmit={submit}>
        {hasPassword && (
          <label className="acct__field">
            <span>Current password</span>
            <input type={show ? 'text' : 'password'} value={form.current} onChange={set('current')}
              autoComplete="current-password" />
          </label>
        )}
        <div className="acct__row">
          <label className="acct__field">
            <span>New password</span>
            <input type={show ? 'text' : 'password'} value={form.next} onChange={set('next')}
              autoComplete="new-password" minLength={MIN_PASSWORD} />
          </label>
          <label className="acct__field">
            <span>Confirm new password</span>
            <input type={show ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')}
              autoComplete="new-password" />
          </label>
        </div>
        {mismatch && <p className="acct__status is-err">The new passwords do not match.</p>}
        <label className="acct__showpw">
          <input type="checkbox" checked={show} onChange={() => setShow((s) => !s)} /> Show passwords
        </label>

        <Status ok={ok} err={err} />
        <div className="acct__actions">
          <button className="btn btn--primary acct__btn-sm" type="submit" disabled={busy}>
            {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
          </button>
          <button type="button" className="acct__linkbtn" onClick={sendReset} disabled={busy}>
            Email me a reset link instead
          </button>
        </div>
        <p className="acct__hint">At least {MIN_PASSWORD} characters. Use something you do not reuse elsewhere.</p>
      </form>
    </Card>
  );
}

/* ---- Sessions & sign-in methods -------------------------------------------- */
function SecurityCard({ user, providers, signOutEverywhere, confirm }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const labels = { email: 'Email & password', google: 'Google', apple: 'Apple' };
  const list = providers.length ? providers : ['email'];

  const signOutAll = async () => {
    const okToGo = await confirm({
      title: 'Sign out everywhere?',
      body: 'This ends your session on every device, including this one. You will need to sign in again.',
      confirmLabel: 'Sign out everywhere', cancelLabel: 'Cancel',
    });
    if (!okToGo) return;
    setBusy(true); setErr('');
    try { await signOutEverywhere(); }
    catch (e) { setErr(friendlyError(e, 'Could not sign out everywhere.')); setBusy(false); }
  };

  return (
    <Card title="Security" desc="How you sign in, and where you're signed in.">
      <div className="acct__meta">
        <div>
          <span className="acct__meta-label">Sign-in methods</span>
          <strong>{list.map((p) => labels[p] || p).join(' · ')}</strong>
        </div>
        <div>
          <span className="acct__meta-label">Account created</span>
          <strong>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</strong>
        </div>
        <div>
          <span className="acct__meta-label">Last sign-in</span>
          <strong>{user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : '—'}</strong>
        </div>
      </div>
      {err && <p className="acct__status is-err">{err}</p>}
      <div className="acct__actions">
        <button type="button" className="btn btn--ghost acct__btn-sm" onClick={signOutAll} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out on all devices'}
        </button>
        <span className="acct__hint">Recommended right after you change your password.</span>
      </div>
    </Card>
  );
}

/* ---- Danger zone ----------------------------------------------------------- */
function DangerCard({ confirm }) {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    getMyDeletionRequest().then(setPending).catch(() => {});
  }, []);

  const request = async () => {
    const go = await confirm({
      title: 'Request account deletion?',
      body: 'We will delete your account, saved benchmarks and profile within 30 days. Paid reveals and bookings already delivered cannot be undone. You can cancel the request any time before then.',
      confirmLabel: 'Request deletion', cancelLabel: 'Keep my account', danger: true,
    });
    if (!go) return;
    setBusy(true); setOk(''); setErr('');
    try {
      setPending(await requestAccountDeletion(null));
      setOk('Deletion requested. We will confirm by email.');
    } catch (e) {
      setErr(settingsError(e, 'Could not submit that request.'));
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setOk(''); setErr('');
    try {
      await cancelAccountDeletion(pending.id);
      setPending(null);
      setOk('Deletion request cancelled — your account stays active.');
    } catch (e) {
      setErr(friendlyError(e, 'Could not cancel that request.'));
    } finally { setBusy(false); }
  };

  return (
    <Card tone="danger" title="Delete account"
      desc="Removes your profile, saved benchmarks and history. This can't be undone once processed.">
      {pending ? (
        <>
          <p className="acct__current">
            ⏳ Deletion requested on <strong>{new Date(pending.created_at).toLocaleDateString()}</strong>. It is processed within 30 days.
          </p>
          <Status ok={ok} err={err} />
          <div className="acct__actions">
            <button type="button" className="btn btn--ghost acct__btn-sm" onClick={cancel} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel deletion request'}
            </button>
          </div>
        </>
      ) : (
        <>
          <Status ok={ok} err={err} />
          <div className="acct__actions">
            <button type="button" className="acct__danger-btn" onClick={request} disabled={busy}>
              {busy ? 'Submitting…' : 'Request account deletion'}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
