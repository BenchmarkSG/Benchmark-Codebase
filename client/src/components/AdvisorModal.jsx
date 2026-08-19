import { useRef, useState } from 'react';
import './AdvisorModal.css';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { ADVISOR_SEGMENTS, ADVISOR_PRODUCTS, ADVISOR_SPECIALIZATIONS } from '../lib/advisorFields.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { useConfirm } from './ConfirmProvider.jsx';
import { friendlyError } from '../lib/friendlyError.js';
import { firstInvalidField, validationMessage } from '../lib/validateForm.js';

const EMPTY = {
  full_name: '', email: '', phone: '', serves: '',
  years_experience: '', company: '', specialization: '',
  description: '', contact_consent: false, accepted_terms: false,
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

export default function AdvisorModal({ open, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [products, setProducts] = useState([]);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const cardRef = useRef(null);
  const formRef = useRef(null);
  const confirm = useConfirm();

  // Close, but never silently discard a half-filled application on a stray
  // backdrop click / Escape — confirm first when there's unsaved input.
  const requestClose = async () => {
    if (busy) return;
    const dirty = !done && (
      form.full_name || form.email || form.phone || form.company || form.serves ||
      form.years_experience || form.specialization || form.description ||
      products.length || photo || form.contact_consent || form.accepted_terms
    );
    if (dirty && !(await confirm({
      title: 'Discard your application?',
      body: 'You’ve started filling this in — closing now will clear everything you entered.',
      confirmLabel: 'Discard', cancelLabel: 'Keep editing',
    }))) return;
    setForm(EMPTY); setProducts([]); setPhoto(null); setError(''); setDone(false);
    onClose();
  };

  useModalA11y(open, cardRef, requestClose);

  if (!open) return null;

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const toggleProduct = (p) =>
    setProducts((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  const onPhoto = (e) => {
    setError('');
    const f = e.target.files?.[0] || null;
    if (f && f.size > MAX_PHOTO_BYTES) {
      e.target.value = '';
      return setError('Photo must be under 5 MB.');
    }
    setPhoto(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!isSupabaseConfigured) return setError('Applications aren’t available yet — Supabase isn’t configured.');
    const bad = firstInvalidField(formRef.current);
    if (bad) { setError(validationMessage(bad)); bad.focus(); return; }
    if (!form.accepted_terms) return setError('Please accept the Terms & Conditions to continue.');
    setBusy(true);
    try {
      let photo_url = null;
      if (photo) {
        const safe = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from('advisor-photos')
          .upload(path, photo, { cacheControl: '3600', upsert: false });
        if (upErr) throw new Error(`Could not upload your photo: ${upErr.message}. Remove the photo and try again, or use a smaller file.`);
        photo_url = supabase.storage.from('advisor-photos').getPublicUrl(path).data.publicUrl;
      }

      const { error: insErr } = await supabase.from('advisors').insert({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        serves: form.serves,
        products,
        years_experience: form.years_experience === '' ? null : Number(form.years_experience),
        company: form.company.trim() || null,
        specialization: form.specialization || null,
        description: form.description.trim() || null,
        photo_url,
        contact_consent: form.contact_consent,
        accepted_terms: form.accepted_terms,
      });
      if (insErr) throw insErr;
      setDone(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adv" role="dialog" aria-modal="true" aria-label="Become a founding member">
      <div className="adv__overlay" onClick={requestClose} />
      <div className="adv__card" ref={cardRef}>
        <button className="adv__close" onClick={requestClose} aria-label="Close">×</button>
        <div className="adv__brand"><span>Fee</span>Optima · Founding Advisors</div>

        {done ? (
          <div className="adv__success-wrap">
            <div className="adv__success-icon">🎉</div>
            <h2 className="adv__title">You’re on the founding list!</h2>
            <p className="adv__sub">
              Thanks for applying. Our team will review your details and reach out on WhatsApp or email
              to get you set up and matched with clients.
            </p>
            <button className="btn btn--primary btn--block" onClick={requestClose}>Done</button>
          </div>
        ) : (
          <>
            <h2 className="adv__title">Become a Founding Member</h2>
            <p className="adv__sub">
              Join as a founding advisor and get matched with individuals and businesses who need your
              expertise. Tell us about yourself.
            </p>

            <form className="adv__form" ref={formRef} onSubmit={submit} noValidate>
              <div className="adv__row">
                <label className="adv__field">
                  <span>Full name (or company name) <em className="adv__req" aria-hidden="true">*</em></span>
                  <input type="text" required value={form.full_name} onChange={set('full_name')} placeholder="Jane Tan / Acme Advisory" />
                </label>
                <label className="adv__field">
                  <span>Bank / company name</span>
                  <input type="text" value={form.company} onChange={set('company')} placeholder="e.g. Standard Chartered" />
                </label>
              </div>

              <div className="adv__row">
                <label className="adv__field">
                  <span>Email <em className="adv__req" aria-hidden="true">*</em></span>
                  <input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" autoComplete="email" />
                </label>
                <label className="adv__field">
                  <span>Phone (WhatsApp) <em className="adv__req" aria-hidden="true">*</em></span>
                  <input type="tel" required value={form.phone} onChange={set('phone')} placeholder="+65 9123 4567" autoComplete="tel" />
                </label>
              </div>

              <div className="adv__row">
                <label className="adv__field">
                  <span>You advise <em className="adv__req" aria-hidden="true">*</em></span>
                  <select className="adv__select" required value={form.serves} onChange={set('serves')}>
                    <option value="" disabled>Individual / Corporate / Both…</option>
                    {ADVISOR_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
                <label className="adv__field">
                  <span>Years of experience</span>
                  <input type="number" min="0" max="60" step="1" value={form.years_experience} onChange={set('years_experience')} placeholder="e.g. 12" />
                </label>
              </div>

              <label className="adv__field">
                <span>Specialization</span>
                <select className="adv__select" value={form.specialization} onChange={set('specialization')}>
                  <option value="">Select an area…</option>
                  {ADVISOR_SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>

              <fieldset className="adv__field adv__fieldset">
                <span>Products you cover</span>
                <div className="adv__chips">
                  {ADVISOR_PRODUCTS.map((p) => (
                    <label key={p} className={`adv__chip ${products.includes(p) ? 'is-on' : ''}`}>
                      <input type="checkbox" checked={products.includes(p)} onChange={() => toggleProduct(p)} />
                      {p}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="adv__field">
                <span>Description</span>
                <textarea rows={3} value={form.description} onChange={set('description')} placeholder="A short bio: your background, notable deals, and how you help clients." />
              </label>

              <label className="adv__field">
                <span>Photo <em>(optional)</em></span>
                <input className="adv__file" type="file" accept="image/*" onChange={onPhoto} />
                {photo && <small className="adv__filehint">Selected: {photo.name}</small>}
              </label>

              <label className="adv__check">
                <input type="checkbox" checked={form.contact_consent} onChange={set('contact_consent')} />
                <span>I’m happy to be contacted by FeeOptima about advisor opportunities (email / WhatsApp).</span>
              </label>
              <label className="adv__check">
                <input type="checkbox" required checked={form.accepted_terms} onChange={set('accepted_terms')} />
                <span>I accept the{' '}
                  <a href="#terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</a> and{' '}
                  <a href="#privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>. <em>(required)</em></span>
              </label>

              {error && <div className="adv__error" role="alert">{error}</div>}

              <button type="submit" className="btn btn--red btn--block adv__submit" disabled={busy}>
                {busy ? 'Submitting…' : 'Claim My Founding Advisor Spot →'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
