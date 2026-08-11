import { useEffect, useMemo, useRef, useState } from 'react';
import './JourneyModal.css';
import { formatMoney, getReference, createCheckout, getCheckoutSession } from '../api.js';
import { safeHttpUrl, isStripeCheckoutUrl } from '../lib/safeUrl.js';
import { useAuth } from '../context/AuthContext.jsx';
import { listAdvisorDirectory, createLead } from '../lib/dashboardApi.js';

/* Screen 3 — the "reveal + act on it" screen. Three vertical tiers: negotiate
   yourself (free), get a coaching call ($99), or hire an expert ($199). The paid
   tiers charge via Stripe Checkout (server /api/checkout); on return the modal
   resumes to the Calendly scheduler. If Stripe isn't configured, the paid tiers
   fall back to demo scheduling so the flow still works. */

const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || '';
const SEG_LABEL = { individual: 'Individual', sme: 'SME / Corporate' };

const TIERS = [
  {
    id: 'email', price: 'Free', accent: 'green',
    title: 'Negotiate directly with my bank',
    desc: 'We draft a ready-to-send email you can fire off to your relationship manager today.',
    cta: 'Generate Email',
  },
  {
    id: 'call', price: '$99', accent: 'blue',
    title: 'Get help to negotiate',
    desc: 'Book a call — a BankBenchmark specialist reviews your numbers and coaches you through it.',
    cta: 'Book a Call',
  },
  {
    id: 'expert', price: '$199', accent: 'red',
    title: 'Have an expert negotiate for me',
    desc: 'Pick a specialist advisor who prepares and leads the negotiation with your bank on your behalf.',
    cta: 'Get me an Expert',
  },
];

// Demo advisor directory for "Find an expert". Real signed-up advisors get wired
// in via the PII-safe public view (advisor_directory).
const SAMPLE_EXPERTS = [
  { id: 'e1', name: 'Priya Menon', role: 'Trade Finance Specialist', company: 'ex-Standard Chartered', years: 14, blurb: 'LC structuring & working-capital pricing for SMEs across SEA.', accent: '#2f7bd8' },
  { id: 'e2', name: 'Daniel Lim', role: 'SME Lending Advisor', company: 'ex-DBS', years: 11, blurb: 'Overdraft and term-loan repricing; former relationship manager.', accent: '#e0574b' },
  { id: 'e3', name: 'Aisha Rahman', role: 'FX & Treasury Expert', company: 'ex-HSBC', years: 9, blurb: 'Cross-border payments and FX spread reduction for corporates.', accent: '#1a9d6a' },
];

// Calendly inline embed (official widget) + a callback when a time is booked.
function CalendlyEmbed({ url, prefill, onScheduled }) {
  const ref = useRef(null);
  const cb = useRef(onScheduled);
  cb.current = onScheduled;
  const pf = useRef(prefill);
  pf.current = prefill;
  useEffect(() => {
    if (!url || !ref.current) return undefined;
    let done = false;
    const init = () => {
      if (done || !ref.current || !window.Calendly) return;
      ref.current.innerHTML = '';
      window.Calendly.initInlineWidget({ url, parentElement: ref.current, prefill: pf.current || undefined });
    };
    if (window.Calendly) init();
    else {
      let s = document.querySelector('script[data-calendly]');
      if (!s) {
        s = document.createElement('script');
        s.src = 'https://assets.calendly.com/assets/external/widget.js';
        s.async = true; s.dataset.calendly = '1';
        document.body.appendChild(s);
      }
      s.addEventListener('load', init);
    }
    const onMsg = (e) => {
      // Exact origin (indexOf('calendly.com') would match https://calendly.com.evil.com).
      if (e.origin === 'https://calendly.com' && e.data?.event === 'calendly.event_scheduled') cb.current?.();
    };
    window.addEventListener('message', onMsg);
    return () => { done = true; window.removeEventListener('message', onMsg); };
  }, [url]);
  return <div className="jny-sched__frame" ref={ref} />;
}

// Add Calendly prefill (name/email) query params to a scheduler link.
function appendPrefill(url, prefill) {
  if (!prefill) return url;
  try {
    const u = new URL(url);
    if (prefill.name) u.searchParams.set('name', prefill.name);
    if (prefill.email) u.searchParams.set('email', prefill.email);
    return u.toString();
  } catch { return url; }
}

// Booking panel: the Calendly embed if a URL is available, else a clear placeholder.
function Scheduler({ url, prefill, note }) {
  const [scheduled, setScheduled] = useState(false);
  const safeUrl = safeHttpUrl(url); // block javascript:/data: from advisor-controlled links
  const linkUrl = safeUrl ? appendPrefill(safeUrl, prefill) : safeUrl;
  return (
    <div className="jny-sched">
      {safeUrl ? (
        <>
          {scheduled && <div className="jny-note jny-note--ok">✓ Time booked — the calendar invite is on its way to your inbox.</div>}
          <CalendlyEmbed url={safeUrl} prefill={prefill} onScheduled={() => setScheduled(true)} />
          <a className="jny-sched__link" href={linkUrl} target="_blank" rel="noopener noreferrer">Open the scheduler in a new tab ↗</a>
        </>
      ) : (
        <div className="jny-sched__ph">
          <span className="jny-sched__ph-icon">📅</span>
          <strong>Calendly scheduler appears here</strong>
          <p>Pick a slot and both you and your advisor get a calendar invite automatically.</p>
          <small>Set <code>VITE_CALENDLY_URL</code> (or the advisor's link) to go live.</small>
        </div>
      )}
      {note && <p className="jny-note">{note}</p>}
    </div>
  );
}

export default function JourneyModal({ open, onClose, context, onRequireAuth, resume }) {
  const { user } = useAuth();
  const [view, setView] = useState('options'); // 'options' | 'email' | 'call' | 'expert'
  const [expert, setExpert] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [advisors, setAdvisors] = useState([]);
  const [sentTo, setSentTo] = useState(null); // advisor id once a lead is created
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [paidTier, setPaidTier] = useState(null); // 'call' | 'expert' once paid (or demo)
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const bookedRef = useRef(null); // Stripe session already logged to the dashboard

  const segment = context?.segment && SEG_LABEL[context.segment] ? context.segment : 'individual';
  const savings = context?.annualSaving ?? null;
  const savingsCcy = context?.currency || 'SGD';
  const fmtSaving = (n) => formatMoney(n, savingsCcy);
  const isYield = context?.direction === 'higher';
  const ahead = context?.status === 'ahead';
  const standing = context?.beatsAll
    ? `all ${context?.poolSize} providers we benchmark`
    : `${context?.percentileBeaten}% of the providers we benchmark`;
  const bank = context?.bestBank || null;
  const productLabel = context?.product || 'banking product';

  // Identity used to prefill Calendly + attribute the booking (set once signed in).
  const bookingPrefill = user ? { name: user.user_metadata?.full_name || '', email: user.email || '' } : undefined;

  // Persist a confirmed paid call to the user's dashboard. Idempotent per Stripe
  // session so re-renders don't double-insert. advisor_id stays null — a coaching
  // call isn't tied to a specific advisor.
  const recordCallBooking = (sessionId, session) => {
    if (!user || bookedRef.current === sessionId) return;
    bookedRef.current = sessionId;
    createLead({
      source: 'call',
      segment: context?.segment || 'individual',
      product_label: context?.product || null,
      annual_saving: context?.annualSaving ?? null,
      full_name: user.user_metadata?.full_name || null,
      email: user.email || session?.email || null,
      phone: user.user_metadata?.phone || null,
      booked: true,
    }).catch(() => { bookedRef.current = null; }); // allow a retry if the insert failed
  };

  // Build the negotiation email from the benchmark context.
  const emailSubject = `Request to review my ${productLabel} pricing`;
  const defaultBody = useMemo(() => {
    const u = context?.unit ? ` ${context.unit}` : '%';
    if (ahead) {
      return `Dear Relationship Manager,

I've been benchmarking my ${productLabel} against the market, and I'm pleased that my current terms are already among the most competitive available.

• My current rate: ${context?.yourRate ?? '—'}${u}
• Market's best: ~${context?.benchmarkRate ?? '—'}${u}

I'd like your confirmation that you'll continue to keep my pricing in line with the market's best as rates move, so I have no reason to review my options elsewhere.

Could we set up a short call this week to confirm?

Kind regards,
[Your name]`;
    }
    const saveLine = savings
      ? `\n• That's roughly ${fmtSaving(savings)} a year I could ${isYield ? 'earn' : 'save'}.`
      : '';
    return `Dear Relationship Manager,

I've been reviewing my ${productLabel} and comparing it against current market rates.

• My current rate: ${context?.yourRate ?? '—'}${u}
• Best available in the market: ~${context?.benchmarkRate ?? '—'}${u}${saveLine}

I'd like to request a review of my pricing to bring it in line with the market's best rate. I'd prefer to stay with you if we can agree a competitive arrangement — otherwise I'll need to consider moving.

Could we set up a short call this week to discuss?

Kind regards,
[Your name]`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Is Stripe configured on the server? (Controls whether paid tiers charge.)
  useEffect(() => {
    if (open) getReference().then((r) => setPaymentsEnabled(!!r.paymentsEnabled)).catch(() => {});
  }, [open]);

  // Reset on open — or, if returning from Stripe Checkout, resume to the tier +
  // verify the payment before showing the scheduler.
  useEffect(() => {
    if (!open) return;
    setEmailTo(''); setEmailBody(defaultBody); setCopied(false); setShared(false);
    if (resume?.afterAuth) {
      // Returned from signing in/up — restore the exact screen they were on.
      setView(resume.view || 'options');
      setExpert(resume.expert || null);
      setSentTo(null); setPaidTier(null); setPayError('');
      return;
    }
    if (resume) {
      setView(resume.tier || 'options');
      setExpert(resume.expert || null);
      setSentTo(resume.expert?.id || null);
      if (resume.canceled) { setPaidTier(null); setPayError('Payment canceled — you can try again below.'); return; }
      setPayError(''); setPaidTier(resume.tier); // optimistic; verify below
      if (resume.sessionId) {
        getCheckoutSession(resume.sessionId).then((s) => {
          if (!s?.paid) {
            setPaidTier(null);
            setPayError('We couldn’t confirm your payment. Please try again.');
            return;
          }
          // Payment confirmed — log the paid call to the user's dashboard.
          if (resume.tier === 'call') recordCallBooking(resume.sessionId, s);
        });
      }
    } else {
      setView('options'); setExpert(null); setSentTo(null); setPaidTier(null); setPayError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resume]);

  // Load the real approved-advisor directory for the expert picker.
  useEffect(() => {
    if (!open) return;
    listAdvisorDirectory().then(setAdvisors).catch(() => setAdvisors([]));
  }, [open]);

  // Real advisors if any are approved; otherwise the labelled demo set.
  const experts = advisors.length
    ? advisors.map((a) => ({
        id: a.id, real: true, name: a.full_name,
        role: a.specialization || 'Banking specialist',
        company: a.company || '', years: a.years_experience || null,
        blurb: a.description || '', photo: a.photo_url || null,
        calendly_url: a.calendly_url || '', accent: '#2f7bd8',
      }))
    : SAMPLE_EXPERTS;

  // Selecting a real advisor while signed in creates an assigned lead (their inbox).
  const connectExpert = async (adv) => {
    setExpert(adv);
    if (!adv?.real || sentTo === adv.id) return;
    if (!user) return; // a sign-in prompt is shown in the booking view
    try {
      await createLead({
        advisor_id: adv.id,
        source: 'expert',
        segment: context?.segment || 'individual',
        product_label: context?.product || null,
        annual_saving: context?.annualSaving ?? null,
        full_name: user.user_metadata?.full_name || null,
        email: user.email,
        phone: user.user_metadata?.phone || null,
        booked: true,
      });
      setSentTo(adv.id);
    } catch { /* non-blocking */ }
  };

  // Redirect to Stripe Checkout for a paid tier; stash context to resume on return.
  const pay = async (tier, adv) => {
    // Require sign-in before any payment/booking, so the appointment is tied to a
    // known account (and Calendly is prefilled with their name + email). After
    // auth the resume flow returns them to this exact tier to complete payment.
    if (!user) { onRequireAuth?.({ kind: 'journey', context, view, expert: adv || expert }); return; }
    setBusy(true); setPayError('');
    const snap = adv ? {
      id: adv.id, real: !!adv.real, name: adv.name, role: adv.role, company: adv.company,
      years: adv.years, blurb: adv.blurb, photo: adv.photo, accent: adv.accent, calendly_url: adv.calendly_url,
    } : null;
    try {
      sessionStorage.setItem('bb_journey', JSON.stringify({ tier, expert: snap, context }));
      const { url } = await createCheckout({
        tier,
        advisorId: adv?.real ? adv.id : undefined,
        product: context?.product || null,
        segment: context?.segment || 'individual',
        email: user?.email || undefined,
      });
      // Only ever navigate to a genuine Stripe Checkout URL (defends against a
      // compromised/misconfigured API returning an open-redirect target).
      if (!isStripeCheckoutUrl(url)) throw new Error('Unexpected checkout URL');
      window.location.assign(url);
    } catch {
      // Stripe not configured / failed → fall back to demo scheduling.
      sessionStorage.removeItem('bb_journey');
      setPaidTier(tier); setBusy(false);
    }
  };

  if (!open) return null;

  const savingLine = ahead
    ? <>You're already ahead of the market — you're beating <strong>{standing}</strong>. 🎉</>
    : savings
      ? (isYield
          ? <>You could earn an extra <strong>{fmtSaving(savings)}</strong> a year by switching.</>
          : <>You're overpaying — save up to <strong>{fmtSaving(savings)}</strong> a year if you negotiate.</>)
      : <>Here's how you can act on your benchmark.</>;

  const share = async () => {
    const verb = isYield ? 'earn an extra' : 'save';
    const text = ahead
      ? `My ${productLabel} is already ahead of the market — I just benchmarked my bank on BankBenchmark.sg`
      : `I could ${verb} ${savings ? fmtSaving(savings) : 'money'}/year on my ${productLabel} — I just benchmarked my bank on BankBenchmark.sg`;
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://bankbenchmark.sg';
    try {
      if (navigator.share) { await navigator.share({ title: 'BankBenchmark.sg', text, url }); }
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); setTimeout(() => setShared(false), 2000); }
    } catch { /* user dismissed share sheet */ }
  };

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(emailBody); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked */ }
  };
  const mailtoHref = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  const back = () => { setView('options'); setExpert(null); setPayError(''); };

  return (
    <div className="jny" role="dialog" aria-modal="true" aria-label="Your next steps">
      <div className="jny__backdrop" onClick={onClose} />
      <div className="jny__panel">
        <button className="jny__close" onClick={onClose} aria-label="Close">×</button>

        {/* Reveal panel — the winning bank + saving, with a share button */}
        <div className="jny-reveal">
          <div className="jny-reveal__top">
            <span className="jny-reveal__eyebrow">{SEG_LABEL[segment]} · your result</span>
            <button className="jny-reveal__share" onClick={share} title="Share">
              {shared ? 'Copied ✓' : '↗ Share'}
            </button>
          </div>
          <div className="jny-reveal__bankline">
            <span className="jny-reveal__label">{ahead ? 'Market-leading provider (you beat it)' : 'Your best-match bank'}</span>
            <span className="jny-reveal__bank">{bank || 'Top provider unlocked'}</span>
          </div>
          <p className="jny-reveal__save">{savingLine}</p>
        </div>

        {/* OPTIONS — three vertical tiers */}
        {view === 'options' && (
          <>
            <h4 className="jny-sectlabel">How would you like to act on this?</h4>
            <div className="jny-tiers">
              {TIERS.map((t) => (
                <div className={`jny-tier jny-tier--${t.accent}`} key={t.id}>
                  <div className="jny-tier__price">{t.price}</div>
                  <div className="jny-tier__body">
                    <div className="jny-tier__title">{t.title}</div>
                    <div className="jny-tier__desc">{t.desc}</div>
                  </div>
                  <button className="jny-tier__cta" onClick={() => setView(t.id)}>{t.cta} →</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* GENERATE EMAIL */}
        {view === 'email' && (
          <div className="jny-sub">
            <button className="jny__back" onClick={back}>← Back to options</button>
            <h4 className="jny-sub__title">Your negotiation email</h4>
            <p className="jny-sub__sub">Copy it, or open it in your mail app. Edit anything before sending.</p>

            <label className="jny-field">
              <span className="jny-label">To — your bank's email (optional)</span>
              <input type="email" placeholder="relationship.manager@yourbank.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
            </label>
            <label className="jny-field">
              <span className="jny-label">Subject</span>
              <input type="text" value={emailSubject} readOnly />
            </label>
            <textarea className="jny-textarea" rows={12} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />

            <div className="jny-actions">
              <button className="btn btn--primary" onClick={copyEmail}>{copied ? 'Copied ✓' : 'Copy email'}</button>
              <a className="btn btn--red" href={mailtoHref}>Open in mail app →</a>
            </div>
            <p className="jny-note">Demo — nothing is sent from our side yet.</p>
          </div>
        )}

        {/* BOOK A CALL ($99) */}
        {view === 'call' && (
          <div className="jny-sub">
            <button className="jny__back" onClick={back}>← Back to options</button>
            <h4 className="jny-sub__title">Book your specialist call</h4>
            {payError && <div className="jny-note jny-note--warn">{payError}</div>}
            {paymentsEnabled && paidTier !== 'call' ? (
              <>
                <p className="jny-sub__sub">
                  <span className="jny-pill">$99</span> A BankBenchmark specialist reviews your numbers and coaches you through the negotiation.
                </p>
                {!user && (
                  <div className="jny-note jny-note--warn">
                    Sign in first so your booking is linked to your account — then pay and pick a time.
                  </div>
                )}
                <button className="btn btn--primary jny-pay" disabled={busy} onClick={() => pay('call')}>
                  {!user ? 'Sign in to book your call →' : busy ? 'Redirecting to secure checkout…' : 'Pay $99 & pick a time →'}
                </button>
                <p className="jny-note">🔒 Secure payment via Stripe. You'll choose your slot right after.</p>
              </>
            ) : (
              <>
                {paidTier === 'call' && <div className="jny-note jny-note--ok">✓ Payment received — pick a time below.</div>}
                <p className="jny-sub__sub"><span className="jny-pill">$99</span> A BankBenchmark specialist coaches you through the negotiation.</p>
                <Scheduler url={CALENDLY_URL} prefill={bookingPrefill} note="You and the specialist both receive the calendar invite from Calendly." />
              </>
            )}
          </div>
        )}

        {/* GET ME AN EXPERT ($199) */}
        {view === 'expert' && (
          <div className="jny-sub">
            <button className="jny__back" onClick={expert ? () => { setExpert(null); setPayError(''); } : back}>
              ← {expert ? 'Back to experts' : 'Back to options'}
            </button>

            {!expert ? (
              <>
                <h4 className="jny-sub__title">Find an expert · select one</h4>
                <p className="jny-sub__sub"><span className="jny-pill">$199</span> An expert prepares and leads the negotiation for you.</p>
                <div className="jny-experts">
                  {experts.map((x) => (
                    <div className="jny-expert" key={x.id}>
                      {x.photo ? (
                        <img className="jny-expert__avatar jny-expert__avatar--img" src={x.photo} alt="" />
                      ) : (
                        <span className="jny-expert__avatar" style={{ background: x.accent }}>
                          {x.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                        </span>
                      )}
                      <div className="jny-expert__body">
                        <div className="jny-expert__name">{x.name}</div>
                        <div className="jny-expert__role">{x.role}{x.company ? ` · ${x.company}` : ''}{x.years ? ` · ${x.years} yrs` : ''}</div>
                        {x.blurb && <div className="jny-expert__blurb">{x.blurb}</div>}
                      </div>
                      <button className="jny-expert__pick" onClick={() => connectExpert(x)}>Select →</button>
                    </div>
                  ))}
                </div>
                {!advisors.length && (
                  <p className="jny-note">Sample advisors for the demo — real founding advisors get listed here once approved.</p>
                )}
              </>
            ) : (
              <>
                <h4 className="jny-sub__title">Book with {expert.name}</h4>
                <p className="jny-sub__sub">{expert.role}{expert.company ? ` · ${expert.company}` : ''}{expert.years ? ` · ${expert.years} yrs experience` : ''}</p>
                {payError && <div className="jny-note jny-note--warn">{payError}</div>}

                {expert.real && !user && (
                  <div className="jny-note jny-note--warn">
                    Sign in to connect with {expert.name} and track this in your dashboard.
                    <button className="jny-linkbtn" onClick={() => onRequireAuth?.({ kind: 'journey', context, view, expert })}>Sign in</button>
                  </div>
                )}
                {expert.real && user && sentTo === expert.id && (
                  <div className="jny-note jny-note--ok">
                    ✓ Request sent to {expert.name} — they’ll reach out, and it’s now in your dashboard.
                  </div>
                )}

                {paymentsEnabled && paidTier !== 'expert' ? (
                  <>
                    <p className="jny-sub__sub"><span className="jny-pill">$199</span> {expert.name.split(' ')[0]} prepares and leads the negotiation. Pay to confirm and schedule.</p>
                    <button className="btn btn--primary jny-pay" disabled={busy} onClick={() => pay('expert', expert)}>
                      {!user ? 'Sign in to book →' : busy ? 'Redirecting to secure checkout…' : `Pay $199 & book ${expert.name.split(' ')[0]} →`}
                    </button>
                    <p className="jny-note">🔒 Secure payment via Stripe. You'll choose your slot right after.</p>
                  </>
                ) : (
                  <>
                    {paidTier === 'expert' && <div className="jny-note jny-note--ok">✓ Payment received — pick a time below.</div>}
                    <Scheduler url={expert.calendly_url || CALENDLY_URL} prefill={bookingPrefill} note={`${expert.name} and you both receive the calendar invite from Calendly.`} />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
