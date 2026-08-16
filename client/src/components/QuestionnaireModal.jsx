import { useRef, useState } from 'react';
import './AdvisorModal.css';
import './QuestionnaireModal.css';
import { scoreQuestionnaire } from '../api.js';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { friendlyError } from '../lib/friendlyError.js';
import { firstInvalidField, validationMessage } from '../lib/validateForm.js';

/* Efficiency assessment: answer a short questionnaire → maturity score → optional
   "talk to an expert" hand-off (captured in public.treasury_profiles). */
export default function QuestionnaireModal({ questionnaire, onClose }) {
  const [step, setStep] = useState('form'); // 'form' | 'score' | 'contact' | 'done'
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(null);
  const [contact, setContact] = useState({ full_name: '', email: '', phone: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef(null);
  const formRef = useRef(null);

  useModalA11y(!!questionnaire, cardRef, onClose);

  if (!questionnaire) return null;
  const q = questionnaire;
  const set = (k) => (e) => setAnswers((a) => ({ ...a, [k]: e.target.value }));
  const setC = (k) => (e) => setContact((c) => ({ ...c, [k]: e.target.value }));

  const submitAnswers = async (e) => {
    e.preventDefault();
    setError('');
    const bad = firstInvalidField(formRef.current);
    if (bad) { setError(validationMessage(bad)); bad.focus(); return; }
    setBusy(true);
    try {
      const res = await scoreQuestionnaire(q.id, answers);
      setScore(res);
      setStep('score');
    } catch (err) {
      setError(friendlyError(err, 'Could not score your answers. Please try again.'));
    } finally { setBusy(false); }
  };

  const submitContact = async (e) => {
    e.preventDefault();
    setError('');
    const bad = firstInvalidField(formRef.current);
    if (bad) { setError(validationMessage(bad)); bad.focus(); return; }
    setBusy(true);
    try {
      if (!isSupabaseConfigured) throw new Error('Not available yet — Supabase isn’t configured.');
      const { error: insErr } = await supabase.from('treasury_profiles').insert({
        questionnaire: q.id, segment: q.segment || 'sme', answers,
        score: score?.score ?? null, band: score?.band ?? null,
        full_name: contact.full_name.trim(), email: contact.email.trim(),
        phone: contact.phone.trim() || null, company: contact.company.trim() || null,
      });
      if (insErr) throw insErr;
      setStep('done');
    } catch (err) {
      setError(friendlyError(err, 'Could not submit. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="adv" role="dialog" aria-modal="true" aria-label={q.label}>
      <div className="adv__overlay" onClick={onClose} />
      <div className="adv__card" ref={cardRef}>
        <button className="adv__close" onClick={onClose} aria-label="Close">×</button>
        <div className="adv__brand">Bank<span>Benchmark</span>.sg · Health Check</div>

        {step === 'form' && (
          <>
            <h2 className="adv__title">{q.label}</h2>
            <p className="adv__sub">{q.intro}</p>
            <form className="adv__form" ref={formRef} onSubmit={submitAnswers} noValidate>
              {q.inputs.map((f) => (
                <label className="adv__field" key={f.key}>
                  <span>{f.label}</span>
                  {f.type === 'scale' ? (
                    <select className="adv__select" required value={answers[f.key] ?? ''} onChange={set(f.key)}>
                      <option value="" disabled>Select…</option>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'text' ? (
                    <input type="text" value={answers[f.key] ?? ''} onChange={set(f.key)} />
                  ) : (
                    <input type="number" min="0" step={f.type === 'percent' ? '0.1' : '1'} value={answers[f.key] ?? ''} onChange={set(f.key)} required={f.required} />
                  )}
                </label>
              ))}
              {error && <div className="adv__error" role="alert">{error}</div>}
              <button type="submit" className="btn btn--primary btn--block adv__submit" disabled={busy}>
                {busy ? 'Scoring…' : 'See my maturity score →'}
              </button>
            </form>
          </>
        )}

        {step === 'score' && score && (
          <div className="qn-score">
            <div className={`qn-ring qn-ring--${score.band.toLowerCase()}`}>
              <span className="qn-ring__num">{score.score}</span>
              <span className="qn-ring__of">/100</span>
            </div>
            <h2 className="adv__title">{score.band}</h2>
            <p className="adv__sub">
              {score.recommendExpert
                ? 'There’s clear room to improve. An expert can map quick wins across your banking setup.'
                : 'You’re already running an efficient setup — an expert can help you push further.'}
            </p>
            <button className="btn btn--red btn--block adv__submit" onClick={() => setStep('contact')}>
              Talk to an expert →
            </button>
            <button className="qn-textbtn" onClick={onClose}>Maybe later</button>
          </div>
        )}

        {step === 'contact' && (
          <>
            <h2 className="adv__title">Talk to an expert</h2>
            <p className="adv__sub">Share your details and a specialist will reach out with tailored next steps.</p>
            <form className="adv__form" ref={formRef} onSubmit={submitContact} noValidate>
              <label className="adv__field"><span>Full name</span>
                <input type="text" required value={contact.full_name} onChange={setC('full_name')} placeholder="Jane Tan" /></label>
              <label className="adv__field"><span>Company</span>
                <input type="text" value={contact.company} onChange={setC('company')} placeholder="Acme Pte Ltd" /></label>
              <div className="adv__row">
                <label className="adv__field"><span>Email</span>
                  <input type="email" required value={contact.email} onChange={setC('email')} placeholder="you@company.com" /></label>
                <label className="adv__field"><span>Phone (WhatsApp)</span>
                  <input type="tel" value={contact.phone} onChange={setC('phone')} placeholder="+65 9123 4567" /></label>
              </div>
              {error && <div className="adv__error" role="alert">{error}</div>}
              <button type="submit" className="btn btn--red btn--block adv__submit" disabled={busy}>
                {busy ? 'Submitting…' : 'Request my consultation →'}
              </button>
              <p className="adv__legal">
                By submitting, you agree to our{' '}
                <a href="#terms" target="_blank" rel="noopener noreferrer">Terms</a> and{' '}
                <a href="#privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
              </p>
            </form>
          </>
        )}

        {step === 'done' && (
          <div className="adv__success-wrap">
            <div className="adv__success-icon">🎉</div>
            <h2 className="adv__title">Request received</h2>
            <p className="adv__sub">Thanks — a specialist will reach out shortly with your tailored efficiency review.</p>
            <button className="btn btn--primary btn--block" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
