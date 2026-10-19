/* The individual's Personal Financial Health Scorecard — a full-screen check-in
 * rather than the SME pop-up: a welcome screen, then ONE question per screen
 * (the question and its four answers own the page), then the results.
 *
 * Modelled on the "wellworth" reference the team picked. Scoring runs here in
 * the browser from the questionnaire the server sends (A=1 … D=4, tiers on
 * points), so nothing leaves the page unless the user asks a specialist to
 * get in touch — that is the only step that writes (public.treasury_profiles).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import './WealthScorecard.css';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { friendlyError } from '../lib/friendlyError.js';
import { firstInvalidField, validationMessage } from '../lib/validateForm.js';

const Arrow = ({ back = false }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {back ? <path d="M19 12H5M11 18l-6-6 6-6" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
  </svg>
);
const Tick = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const Shield = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" />
  </svg>
);

const pad = (n) => String(n).padStart(2, '0');

export default function WealthScorecard({ questionnaire: q, onClose }) {
  const [screen, setScreen] = useState('welcome'); // 'welcome' | 'questions' | 'results'
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState(() => Array(q.inputs.length).fill(null)); // option values (1–4)
  const [contact, setContact] = useState(null); // null | 'form' | 'sent'
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shellRef = useRef(null);
  const formRef = useRef(null);

  useModalA11y(true, shellRef, onClose);

  const items = q.inputs;
  const current = items[idx];
  const picked = answers[idx];
  const maxPoints = useMemo(() => items.reduce((a, f) => a + Math.max(...f.options.map((o) => o.value)), 0), [items]);
  const points = answers.reduce((a, v) => a + (v ?? 0), 0);
  const tier = useMemo(
    () => (q.tiers || []).find((t) => points >= t.min) || (q.tiers || [])[q.tiers.length - 1] || null,
    [q.tiers, points],
  );

  // Every screen change starts at the top of the page.
  useEffect(() => { shellRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [screen, idx]);

  const begin = () => {
    setAnswers(Array(items.length).fill(null));
    setIdx(0); setContact(null); setError('');
    setScreen('questions');
  };
  const choose = (value) => setAnswers((a) => a.map((v, i) => (i === idx ? value : v)));
  const next = () => {
    if (picked == null) return;
    if (idx === items.length - 1) setScreen('results');
    else setIdx((i) => i + 1);
  };
  const back = () => (idx === 0 ? setScreen('welcome') : setIdx((i) => i - 1));

  // Number keys 1–4 / letters A–D pick an answer; Enter continues.
  const onAnswerKey = (e) => {
    if (screen !== 'questions' || e.target.closest('input, textarea')) return;
    const n = '1234'.indexOf(e.key) + 1 || 'abcd'.indexOf(e.key.toLowerCase()) + 1;
    if (n && current.options[n - 1]) { e.preventDefault(); choose(current.options[n - 1].value); }
    else if (e.key === 'Enter' && picked != null && e.target.tagName !== 'BUTTON') { e.preventDefault(); next(); }
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
        questionnaire: q.id, segment: 'individual',
        answers: Object.fromEntries(items.map((f, i) => [f.key, answers[i]])),
        score: points, band: tier?.name || null,
        full_name: form.full_name.trim(), email: form.email.trim(), phone: form.phone.trim() || null,
      });
      if (insErr) throw insErr;
      setContact('sent');
    } catch (err) {
      setError(friendlyError(err, 'Could not send your request. Please try again.'));
    } finally { setBusy(false); }
  };

  const disclaimer = (
    <p className="ws-footnote">
      <Shield />
      <span>For educational purposes only. This score is a general self-assessment—not financial advice or a substitute for personalised guidance.</span>
    </p>
  );

  return (
    <div className="ws" role="dialog" aria-modal="true" aria-label="Personal Financial Health Scorecard" ref={shellRef} onKeyDown={onAnswerKey}>
      <div className="ws__shell">
        <header className="ws-header">
          <button type="button" className="ws-brand" onClick={() => setScreen('welcome')} aria-label="Scorecard start">
            <span>Fee</span>Optima
          </button>
          <span className="ws-header__note"><i className="ws-dot" /> A clearer view of your financial picture</span>
          <button type="button" className="ws-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* ---- Welcome ---------------------------------------------------- */}
        {screen === 'welcome' && (
          <main className="ws-welcome">
            <div className="ws-welcome__copy">
              <div className="ws-eyebrow"><span className="ws-eyebrow__rule" /> PERSONAL FINANCIAL HEALTH SCORECARD</div>
              <h1 className="ws-h1">Know where you stand.<br /><em>See what comes next.</em></h1>
              <p className="ws-lead">A thoughtful check-in on the habits and safeguards shaping your financial life. Ten questions. A clearer next step.</p>
              <div className="ws-welcome__actions">
                <button type="button" className="ws-btn ws-btn--primary" onClick={begin} autoFocus>
                  Begin your check-in <Arrow />
                </button>
                <span className="ws-muted">About 4 minutes · No personal details needed</span>
              </div>
              <div className="ws-facts">
                <div>
                  <span className="ws-facts__icon">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                      <rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" />
                    </svg>
                  </span>
                  <span><strong>{items.length} thoughtful questions</strong><small>Across the key pillars of personal finance</small></span>
                </div>
                <div>
                  <span className="ws-facts__icon"><Shield /></span>
                  <span><strong>Private by design</strong><small>Your answers stay in this browser</small></span>
                </div>
              </div>
            </div>
            <aside className="ws-visual" aria-hidden="true">
              <div className="ws-visual__top"><span>YOUR FINANCIAL PICTURE</span><span>01 — {pad(items.length)}</span></div>
              <div className="ws-visual__title">A little clarity<br />goes a long way.</div>
              <div className="ws-orbit">
                <div className="ws-orbit__ring ws-orbit__ring--one" />
                <div className="ws-orbit__ring ws-orbit__ring--two" />
                <div className="ws-orbit__core"><b>{items.length}</b><small>AREAS</small></div>
                <i className="ws-orbit__pt ws-orbit__pt--1" /><i className="ws-orbit__pt ws-orbit__pt--2" /><i className="ws-orbit__pt ws-orbit__pt--3" />
              </div>
              <div className="ws-visual__bottom"><span>FROM DAILY CASH FLOW</span><Arrow /><span>TO LONG-TERM SECURITY</span></div>
            </aside>
            {disclaimer}
          </main>
        )}

        {/* ---- One question per screen ------------------------------------- */}
        {screen === 'questions' && (
          <main className="ws-assess">
            {/* No page heading here: the question and its answers own the screen. */}
            <div className="ws-assess__head">
              <div className="ws-eyebrow"><span className="ws-eyebrow__rule" /> YOUR PERSONAL CHECK-IN · There are no wrong answers</div>
            </div>
            <div className="ws-assess__layout">
              <aside className="ws-aside">
                <div className="ws-progress">
                  <div className="ws-progress__label">
                    <span>YOUR PROGRESS</span>
                    <span>{pad(idx + 1)} <i>/</i> {items.length}</span>
                  </div>
                  <div className="ws-progress__track" role="progressbar" aria-valuenow={idx + 1} aria-valuemin={1} aria-valuemax={items.length} aria-label={`Question ${idx + 1} of ${items.length}`}>
                    <span style={{ width: `${((idx + 1) / items.length) * 100}%` }} />
                  </div>
                  <div className="ws-muted ws-progress__sub">One step at a time.</div>
                </div>
                <ol className="ws-topics" aria-label="Question topics">
                  {items.map((f, i) => (
                    <li key={f.key} className={`${i === idx ? 'is-current' : ''} ${answers[i] != null ? 'is-done' : ''}`}>
                      <span className="ws-topics__num">{answers[i] != null && i !== idx ? <Tick /> : pad(i + 1)}</span>
                      <span>{f.label}</span>
                    </li>
                  ))}
                </ol>
                <div className="ws-privacy">
                  <Shield />
                  <span><strong>Your answers stay yours.</strong><br />This check-in runs in your browser. Nothing is sent unless you ask a specialist to contact you.</span>
                </div>
              </aside>

              <section className="ws-qcard" aria-labelledby="ws-qtitle" key={current.key}>
                <div className="ws-qcard__top">
                  <span>QUESTION {pad(idx + 1)}</span>
                  <span>{items.length - idx} LEFT</span>
                </div>
                <h2 id="ws-qtitle" className="ws-qcard__title">{current.label}</h2>
                <p className="ws-qcard__prompt">{current.prompt}</p>
                <div className="ws-answers" role="radiogroup" aria-labelledby="ws-qtitle">
                  {current.options.map((o, i) => {
                    const on = picked === o.value;
                    return (
                      <button
                        type="button" key={o.value} role="radio" aria-checked={on}
                        className={`ws-answer${on ? ' is-selected' : ''}`}
                        onClick={() => choose(o.value)}
                      >
                        <span className="ws-answer__letter">{o.letter || 'ABCD'[i]}</span>
                        <span className="ws-answer__text">{o.label}</span>
                        <span className="ws-answer__pts">{o.value} pt{o.value === 1 ? '' : 's'}</span>
                        <span className="ws-answer__check"><Tick /></span>
                      </button>
                    );
                  })}
                </div>
                <div className="ws-controls">
                  <button type="button" className="ws-btn ws-btn--ghost" onClick={back}><Arrow back /> Back</button>
                  <span className="ws-muted ws-controls__hint">{picked == null ? 'Select one answer to continue' : 'Answer saved'}</span>
                  <button type="button" className="ws-btn ws-btn--primary" onClick={next} disabled={picked == null}>
                    {idx === items.length - 1 ? 'See my results' : 'Continue'} <Arrow />
                  </button>
                </div>
              </section>
            </div>
            {disclaimer}
          </main>
        )}

        {/* ---- Results ------------------------------------------------------ */}
        {screen === 'results' && tier && (
          <main className="ws-results">
            <div className="ws-results__head">
              <div className="ws-eyebrow"><span className="ws-eyebrow__rule" /> YOUR FINANCIAL HEALTH SNAPSHOT</div>
              <h1 className="ws-h2">A clearer picture, <em>from here.</em></h1>
              <p className="ws-lead ws-lead--sm">Your answers are a moment-in-time snapshot—not a judgment. Use them as a guide for where you might focus next.</p>
            </div>

            <section className={`ws-hero ws-tone--${tier.tone || 'blue'}`}>
              <div className="ws-hero__score">
                <div className="ws-ring" style={{ '--p': `${(points / maxPoints) * 100}%` }}>
                  <div className="ws-ring__inner">
                    <span>YOUR SCORE</span>
                    <strong>{points}</strong>
                    <small>out of {maxPoints}</small>
                  </div>
                </div>
                <div className="ws-hero__caption"><Tick /> Check-in complete</div>
              </div>
              <div className="ws-hero__copy">
                <span className="ws-kicker">YOUR CURRENT TIER</span>
                <h2 className="ws-hero__tier">{tier.name}</h2>
                {tier.descriptor && <p className="ws-hero__desc">{tier.descriptor}</p>}
                <p className="ws-hero__msg">{tier.summary}</p>
                {!!tier.priorities?.length && (
                  <>
                    <div className="ws-hero__rule" />
                    <span className="ws-kicker">A few possible next steps</span>
                    <ol className="ws-steps">
                      {tier.priorities.map((p, i) => <li key={p}><span>{pad(i + 1)}</span>{p}</li>)}
                    </ol>
                  </>
                )}
              </div>
            </section>

            <section className="ws-breakdown">
              <div className="ws-breakdown__head">
                <div>
                  <div className="ws-eyebrow"><span className="ws-eyebrow__rule" /> THE DETAIL</div>
                  <h2 className="ws-h3">Your answers, area by area.</h2>
                </div>
                <span className="ws-breakdown__total">{points} / {maxPoints} POINTS</span>
              </div>
              <div className="ws-breakdown__list">
                {items.map((f, i) => {
                  const top = Math.max(...f.options.map((o) => o.value));
                  const v = answers[i] ?? 0;
                  return (
                    <div className="ws-brow" key={f.key}>
                      <div className="ws-brow__name"><span>{pad(i + 1)}</span><strong>{f.label}</strong></div>
                      <div className="ws-brow__bar" aria-label={`${v} out of ${top} points`}><span style={{ width: `${(v / top) * 100}%` }} /></div>
                      <div className="ws-brow__pts">{v}<small> / {top}</small></div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* The one step that sends anything: on request only. */}
            <section className="ws-talk">
              {contact === 'sent' ? (
                <p className="ws-talk__done"><Tick /> Thanks — a FeeOptima specialist will reach out shortly to walk you through your results.</p>
              ) : contact === 'form' ? (
                <form className="ws-talk__form" ref={formRef} onSubmit={submitContact} noValidate>
                  <h3 className="ws-h3">Talk it through with a specialist</h3>
                  <p className="ws-muted">We&apos;ll share your score and answers with them so you don&apos;t have to repeat yourself.</p>
                  <div className="ws-talk__fields">
                    <label><span>Full name</span><input type="text" required value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Jane Tan" /></label>
                    <label><span>Email</span><input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" /></label>
                    <label><span>Phone (WhatsApp)</span><input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+65 9123 4567" /></label>
                  </div>
                  {error && <div className="ws-error" role="alert">{error}</div>}
                  <div className="ws-talk__actions">
                    <button type="button" className="ws-btn ws-btn--ghost" onClick={() => { setContact(null); setError(''); }}>Cancel</button>
                    <button type="submit" className="ws-btn ws-btn--primary" disabled={busy}>{busy ? 'Sending…' : 'Request a call'} <Arrow /></button>
                  </div>
                </form>
              ) : (
                <div className="ws-talk__cta">
                  <div>
                    <h3 className="ws-h3">Want a hand with the next step?</h3>
                    <p className="ws-muted">A FeeOptima specialist can turn these results into a plan for your savings, debt and banking.</p>
                  </div>
                  <button type="button" className="ws-btn ws-btn--primary" onClick={() => setContact('form')}>Talk to a specialist <Arrow /></button>
                </div>
              )}
            </section>

            <div className="ws-endnote">
              <div>
                <Shield />
                <span><strong>A note on your score</strong><br />This general self-assessment is for educational purposes only. It is not financial advice, a diagnosis, or a recommendation to buy or sell any product. Consider a qualified professional for advice tailored to you.</span>
              </div>
              <button type="button" className="ws-btn ws-btn--ghost" onClick={begin}>
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
                </svg>
                Retake the check-in
              </button>
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
