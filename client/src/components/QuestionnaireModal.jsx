import { useEffect, useRef, useState } from 'react';
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
  const [step, setStep] = useState('intro'); // 'intro' | 'quiz' | 'score' | 'contact' | 'done'
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0); // the question on screen
  const [score, setScore] = useState(null);
  const [contact, setContact] = useState({ full_name: '', email: '', phone: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cardRef = useRef(null);
  const formRef = useRef(null);
  const advanceRef = useRef(null);

  useModalA11y(!!questionnaire, cardRef, onClose);
  useEffect(() => () => clearTimeout(advanceRef.current), []);

  if (!questionnaire) return null;
  const q = questionnaire;
  // The personal scorecard is about a household, not a company's banking.
  const personal = q.segment === 'individual';
  const setC = (k) => (e) => setContact((c) => ({ ...c, [k]: e.target.value }));

  // One question at a time. Picking an answer moves on by itself after a beat
  // (long enough to see the choice land); the last question waits for Submit.
  const questions = q.inputs;
  const total = questions.length;
  const cur = questions[idx];
  const isLast = idx === total - 1;
  const answered = questions.filter((f) => answers[f.key] != null).length;
  const pick = (key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError('');
    clearTimeout(advanceRef.current);
    if (!isLast) advanceRef.current = setTimeout(() => setIdx((i) => Math.min(i + 1, total - 1)), 280);
  };
  const prev = () => { clearTimeout(advanceRef.current); setError(''); setIdx((i) => Math.max(0, i - 1)); };

  const submitAnswers = async () => {
    setError('');
    // Every question is required; send them back to the first one skipped.
    const missing = questions.findIndex((f) => answers[f.key] == null);
    if (missing !== -1) { setIdx(missing); setError('Please answer this question first.'); return; }
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
      <div className="adv__card qn-card" ref={cardRef}>
        <button className="adv__close" onClick={onClose} aria-label="Close">×</button>
        <div className="adv__brand"><span>Fee</span>Optima · Health Check</div>

        {/* 1. How the test works, before any question. */}
        {step === 'intro' && (
          <div className="qn-intro">
            <h2 className="adv__title">{q.label}</h2>
            <p className="adv__sub">{q.intro}</p>
            <h3 className="qn-intro__head">Before you begin</h3>
            <ul className="qn-intro__list">
              <li><strong>{total} questions</strong>, shown one at a time. It takes about {Math.max(2, Math.round(total * 0.3))} minutes.</li>
              <li>Each question has <strong>four answers, A to D</strong>. Pick the one closest to how {personal ? 'you manage your money' : 'your team works'} <strong>today</strong>, not how you plan to.</li>
              <li>If two answers fit, choose the lower one: an honest score shows where {personal ? 'to focus' : 'the savings are'}.</li>
              <li>Choosing an answer takes you to the next question. Use <strong>Previous</strong> to go back and change one.</li>
              <li>Your score appears as soon as you submit the last question.</li>
            </ul>
            <button type="button" className="qn-btn qn-btn--go" onClick={() => { setIdx(0); setStep('quiz'); }}>
              Begin test
            </button>
          </div>
        )}

        {/* 2. The questions, one per screen. */}
        {step === 'quiz' && cur && (
          <div className="qn-quiz">
            <div className="qn-progress">
              <div className="qn-progress__row">
                <span>Question {idx + 1} of {total}</span>
                <span>{total - answered === 0 ? 'All answered' : `${total - answered} left`}</span>
              </div>
              <div className="qn-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}
                   aria-label={`${answered} of ${total} answered`}>
                <span style={{ width: `${(answered / total) * 100}%` }} />
              </div>
            </div>

            <fieldset className="qn-q qn-q--solo" key={cur.key}>
              <legend className="qn-q__title">{cur.label}</legend>
              {cur.prompt && <p className="qn-q__prompt">{cur.prompt}</p>}
              <div className="qn-q__opts">
                {cur.options.map((o) => {
                  const on = String(answers[cur.key]) === String(o.value);
                  return (
                    <label key={o.value} className={`qn-opt${on ? ' is-on' : ''}`}>
                      {/* onClick, not onChange: re-picking the answer already
                          chosen (after Previous) should move on too. */}
                      <input type="radio" name={cur.key} value={o.value} checked={on}
                        onChange={() => {}} onClick={() => pick(cur.key, o.value)} />
                      <span className="qn-opt__letter" aria-hidden="true">{o.letter}</span>
                      <span className="qn-opt__text">{o.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {error && <div className="adv__error" role="alert">{error}</div>}

            <div className="qn-nav">
              <button type="button" className="qn-btn" onClick={prev} disabled={idx === 0 || busy}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                  <path d="M15 5 L8 12 L15 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Previous
              </button>
              {isLast && (
                <button type="button" className="qn-btn qn-btn--go" onClick={submitAnswers}
                  disabled={answers[cur.key] == null || busy}>
                  {busy ? 'Scoring…' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'score' && score && (
          <div className="qn-score">
            <div className={`qn-ring qn-ring--${score.tone || score.band.toLowerCase()}`}>
              {/* Point-tiered questionnaires (treasury) show their points out of
                  the maximum; the rest a 0–100 score. */}
              <span className="qn-ring__num">{score.points ?? score.score}</span>
              <span className="qn-ring__of">/{score.maxPoints ?? 100}</span>
            </div>
            <h2 className="adv__title">{score.band}</h2>
            {score.tag && <p className="qn-tag">{score.tag}</p>}
            {score.descriptor && <p className="qn-desc">{score.descriptor}</p>}
            <p className="adv__sub">
              {score.summary ? score.summary : personal
                ? (score.recommendExpert
                  ? 'There’s clear room to improve. A specialist can show you quick wins on your savings, debt and banking.'
                  : 'Your finances are in good shape — a specialist can help you make your money work even harder.')
                : (score.recommendExpert
                  ? 'There’s clear room to improve. An expert can map quick wins across your banking setup.'
                  : 'You’re already running an efficient setup — an expert can help you push further.')}
            </p>
            {!!score.priorities?.length && (
              <div className="qn-next">
                <h3>A few possible next steps</h3>
                <ol>{score.priorities.map((p) => <li key={p}>{p}</li>)}</ol>
              </div>
            )}
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
              {!personal && (
                <label className="adv__field"><span>Company</span>
                  <input type="text" value={contact.company} onChange={setC('company')} placeholder="Acme Pte Ltd" /></label>
              )}
              <div className="adv__row">
                <label className="adv__field"><span>Email</span>
                  <input type="email" required value={contact.email} onChange={setC('email')} placeholder={personal ? 'you@example.com' : 'you@company.com'} /></label>
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
            <p className="adv__sub">Thanks — a specialist will reach out shortly with your tailored {personal ? 'wealth' : 'efficiency'} review.</p>
            <button className="btn btn--primary btn--block" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
