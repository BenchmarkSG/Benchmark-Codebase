import { useEffect, useMemo, useState } from 'react';
import './JourneyModal.css';
import { formatMoney } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { listAdvisorDirectory, createLead } from '../lib/dashboardApi.js';

/* Screen 3 — the "reveal + act on it" screen. Same layout for both segments.
   Three vertical tiers: negotiate yourself (free), get help (call), or hire an
   expert. Payment is intentionally NOT wired yet (demo first); bookings hand off
   to Calendly, which emails the invite to both the user and the advisor. */

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
// in later via a PII-safe public view.
const SAMPLE_EXPERTS = [
  { id: 'e1', name: 'Priya Menon', role: 'Trade Finance Specialist', company: 'ex-Standard Chartered', years: 14, blurb: 'LC structuring & working-capital pricing for SMEs across SEA.', accent: '#2f7bd8' },
  { id: 'e2', name: 'Daniel Lim', role: 'SME Lending Advisor', company: 'ex-DBS', years: 11, blurb: 'Overdraft and term-loan repricing; former relationship manager.', accent: '#e0574b' },
  { id: 'e3', name: 'Aisha Rahman', role: 'FX & Treasury Expert', company: 'ex-HSBC', years: 9, blurb: 'Cross-border payments and FX spread reduction for corporates.', accent: '#1a9d6a' },
];

// A Calendly booking panel (embed if configured, else a clear placeholder).
function Scheduler({ note }) {
  return (
    <div className="jny-sched">
      {CALENDLY_URL ? (
        <>
          <iframe className="jny-sched__frame" src={CALENDLY_URL} title="Pick a time" />
          <a className="jny-sched__link" href={CALENDLY_URL} target="_blank" rel="noreferrer">
            Open the scheduler in a new tab ↗
          </a>
        </>
      ) : (
        <div className="jny-sched__ph">
          <span className="jny-sched__ph-icon">📅</span>
          <strong>Calendly scheduler appears here</strong>
          <p>Pick a slot and both you and your advisor get a calendar invite automatically.</p>
          <small>Set <code>VITE_CALENDLY_URL</code> to go live.</small>
        </div>
      )}
      {note && <p className="jny-note">{note}</p>}
    </div>
  );
}

export default function JourneyModal({ open, onClose, context, onRequireAuth }) {
  const { user } = useAuth();
  const [view, setView] = useState('options'); // 'options' | 'email' | 'call' | 'expert'
  const [expert, setExpert] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [advisors, setAdvisors] = useState([]);
  const [sentTo, setSentTo] = useState(null); // advisor id once a lead is created

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
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Reset whenever the modal reopens.
  useEffect(() => {
    if (open) { setView('options'); setExpert(null); setEmailTo(''); setEmailBody(defaultBody); setCopied(false); setShared(false); setSentTo(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        blurb: a.description || '', photo: a.photo_url || null, accent: '#2f7bd8',
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
    } catch { /* non-blocking in the demo */ }
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

  const back = () => { setView('options'); setExpert(null); };

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

        {/* BOOK A CALL */}
        {view === 'call' && (
          <div className="jny-sub">
            <button className="jny__back" onClick={back}>← Back to options</button>
            <h4 className="jny-sub__title">Book your specialist call</h4>
            <p className="jny-sub__sub">
              <span className="jny-pill">$99</span> A BankBenchmark specialist coaches you through the negotiation.
              Payment is added later — for now, just pick a time.
            </p>
            <Scheduler note="You and the specialist both receive the calendar invite from Calendly." />
          </div>
        )}

        {/* GET ME AN EXPERT */}
        {view === 'expert' && (
          <div className="jny-sub">
            <button className="jny__back" onClick={expert ? () => setExpert(null) : back}>
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

                {expert.real && !user && (
                  <div className="jny-note jny-note--warn">
                    Sign in to connect with {expert.name} and track this in your dashboard.
                    <button className="jny-linkbtn" onClick={() => onRequireAuth?.()}>Sign in</button>
                  </div>
                )}
                {expert.real && user && sentTo === expert.id && (
                  <div className="jny-note jny-note--ok">
                    ✓ Request sent to {expert.name} — they’ll reach out, and it’s now in your dashboard.
                  </div>
                )}

                <Scheduler note={`${expert.name} and you both receive the calendar invite from Calendly.`} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
