import { useEffect, useState } from 'react';
import './JourneyModal.css';
import { formatSGD, requestReveal } from '../api.js';

/* Segment-specific action lists, mirroring the sketched user journeys.
   type: 'pay'  -> Stripe-style one-off unlock
         'book' -> Calendly-style slot booking
         'diy'  -> emailed self-serve playbook */
const ACTIONS = {
  individual: [
    { id: 'reveal', icon: '🔓', type: 'pay', price: 1, title: 'Reveal & Generate Report', desc: 'Unlock the winning bank’s name and your full side-by-side benchmark report.' },
    { id: 'negotiate', icon: '📝', type: 'diy', price: 0, title: 'Negotiate Direct', desc: 'Get the DIY negotiation playbook & script to reprice with your bank yourself.' },
    { id: 'call', icon: '📞', type: 'book', price: 10, title: 'Book a 15-min Call', desc: 'Talk to a specialist who walks you through your best options.' },
    { id: 'expert', icon: '🎓', type: 'book', price: 100, title: 'Book an Expert Consultation', desc: 'Deep-dive session — we can prepare and negotiate on your behalf.' },
  ],
  sme: [
    { id: 'reveal', icon: '🔓', type: 'pay', price: 1, title: 'Reveal & Generate Report', desc: 'Unlock providers + a full multi-product benchmark report.' },
    { id: 'review', icon: '📊', type: 'pay', price: 100, title: 'Full Benchmark Review', desc: 'Comprehensive treasury & banking-cost review across all products.' },
    { id: 'call', icon: '📞', type: 'book', price: 10, title: 'Book a Call', desc: '15-min intro with a transaction-banking specialist.' },
    { id: 'expert', icon: '🎓', type: 'book', price: 100, title: 'Book an Expert', desc: 'Dedicated expert to prepare and lead your bank negotiation.' },
  ],
  corporate: [
    { id: 'reveal', icon: '🔓', type: 'pay', price: 1, title: 'Generate Report', desc: 'Reveal providers and generate your corporate benchmark report.' },
    { id: 'call', icon: '📞', type: 'book', price: 10, title: 'Book Tele Call', desc: 'Introductory call with a treasury specialist.' },
    { id: 'expert', icon: '🎓', type: 'book', price: 100, title: 'Book Expert', desc: 'Expert consultation for complex, multi-entity structures.' },
    { id: 'review', icon: '📋', type: 'book', price: 250, title: 'Full Forensic Review', desc: 'End-to-end forensic review of banking costs across all entities.' },
  ],
};

const SEG_LABEL = { individual: 'Individual', sme: 'SME', corporate: 'Corporate' };
const SLOTS = ['Tomorrow · 10:00', 'Tomorrow · 15:30', 'Thu · 11:00', 'Fri · 16:00'];

export default function JourneyModal({ open, onClose, context }) {
  const [step, setStep] = useState('options'); // 'options' | 'action' | 'done'
  const [action, setAction] = useState(null);
  const [email, setEmail] = useState('');
  const [slot, setSlot] = useState(SLOTS[0]);
  const [busy, setBusy] = useState(false);

  const segment = context?.segment && ACTIONS[context.segment] ? context.segment : 'individual';
  const savings = context?.annualSaving ?? context?.totalAnnualSaving ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Reset the flow whenever the modal reopens.
  useEffect(() => {
    if (open) { setStep('options'); setAction(null); setEmail(''); setSlot(SLOTS[0]); }
  }, [open]);

  if (!open) return null;

  function choose(a) { setAction(a); setStep('action'); }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    // Prototype: no real Stripe/Calendly/email. Just capture the email.
    try { await requestReveal(email); } catch { /* prototype: ignore */ }
    setBusy(false);
    setStep('done');
  }

  const cta =
    !action ? '' :
    action.type === 'pay' ? (action.price ? `Pay ${formatSGD(action.price)} →` : 'Continue →') :
    action.type === 'book' ? 'Confirm Booking →' :
    'Email Me the Playbook →';

  return (
    <div className="jny" role="dialog" aria-modal="true" aria-label="Your next steps">
      <div className="jny__backdrop" onClick={onClose} />
      <div className="jny__panel">
        <button className="jny__close" onClick={onClose} aria-label="Close">×</button>

        {/* Header — the "you are overpaying" summary from the journey */}
        <div className="jny__head">
          <span className="eyebrow">{SEG_LABEL[segment]} journey</span>
          {savings ? (
            <h3 className="jny__title">
              You’re overpaying <span className="accent-red">{formatSGD(savings)}</span> a year
            </h3>
          ) : (
            <h3 className="jny__title">Your personalised next steps</h3>
          )}
          <p className="jny__sub">Choose how you’d like to capture your savings. The winning provider is revealed once you continue.</p>
        </div>

        {/* Step tracker */}
        <div className="jny__steps">
          <span className={step === 'options' ? 'is-active' : 'is-done'}>1 · Choose</span>
          <span className={step === 'action' ? 'is-active' : step === 'done' ? 'is-done' : ''}>2 · Confirm</span>
          <span className={step === 'done' ? 'is-active' : ''}>3 · Next steps</span>
        </div>

        {/* STEP 1 — options */}
        {step === 'options' && (
          <div className="jny__options">
            {ACTIONS[segment].map((a) => (
              <button className="jny-opt" key={a.id} onClick={() => choose(a)}>
                <span className="jny-opt__icon">{a.icon}</span>
                <span className="jny-opt__body">
                  <span className="jny-opt__title">{a.title}</span>
                  <span className="jny-opt__desc">{a.desc}</span>
                </span>
                <span className="jny-opt__price">
                  {a.price ? formatSGD(a.price) : 'Free'}
                  <small>{a.type === 'book' ? 'Calendly' : a.type === 'pay' ? 'Secure pay' : 'Instant'}</small>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* STEP 2 — confirm selected action */}
        {step === 'action' && action && (
          <form className="jny__action" onSubmit={submit}>
            <button type="button" className="jny__back" onClick={() => setStep('options')}>← Back to options</button>
            <div className="jny-detail">
              <span className="jny-detail__icon">{action.icon}</span>
              <div>
                <h4>{action.title}</h4>
                <p>{action.desc}</p>
              </div>
              <span className="jny-detail__price">{action.price ? formatSGD(action.price) : 'Free'}</span>
            </div>

            {action.type === 'book' && (
              <div className="jny-slots">
                <span className="jny-label">Pick a slot</span>
                <div className="jny-slots__grid">
                  {SLOTS.map((s) => (
                    <button type="button" key={s} className={`jny-slot ${slot === s ? 'is-active' : ''}`} onClick={() => setSlot(s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            <label className="jny-field">
              <span className="jny-label">Email for your next steps</span>
              <input type="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>

            <button className="btn btn--red btn--block" type="submit" disabled={busy}>
              {busy ? 'Processing…' : cta}
            </button>
            <p className="jny-note">
              {action.type === 'pay'
                ? 'Prototype — no real payment is taken (Stripe placeholder).'
                : action.type === 'book'
                  ? 'Prototype — no real calendar booking is made (Calendly placeholder).'
                  : 'Prototype — no email is actually sent.'}
            </p>
          </form>
        )}

        {/* STEP 3 — confirmation */}
        {step === 'done' && (
          <div className="jny__done">
            <div className="jny__done-icon">✅</div>
            <h4>You’re all set{action?.type === 'book' ? ` for ${slot}` : ''}!</h4>
            <p>Check your email — we’ve sent your next steps{email ? ` to ${email}` : ''}.</p>
            {savings ? <div className="jny__done-save">On track to save <strong>{formatSGD(savings)}/year</strong></div> : null}
            <button className="btn btn--primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
