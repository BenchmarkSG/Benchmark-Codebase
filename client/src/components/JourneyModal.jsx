import { useEffect, useMemo, useRef, useState } from 'react';
import './JourneyModal.css';
import { formatMoney, getReference, createCheckout, getCheckoutSession, getTierPrice } from '../api.js';
import { safeHttpUrl, isStripeCheckoutUrl } from '../lib/safeUrl.js';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { listAdvisorDirectory, createLead, updateBenchmark } from '../lib/dashboardApi.js';
import Certificate from './Certificate.jsx';
import { buildCertificateImage } from '../lib/certificateImage.js';
import { SITE_URL } from '../lib/site.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { useConfirm } from './ConfirmProvider.jsx';

/* Screen 3 — the "reveal + act on it" screen. Three vertical tiers: negotiate
   yourself ($1), get a coaching call ($99), or hire an expert ($199). The paid
   tiers charge via Stripe Checkout (server /api/checkout); on return the modal
   resumes to the Calendly scheduler. If Stripe isn't configured, the paid tiers
   fall back to demo scheduling so the flow still works. */

const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || '';
const SEG_LABEL = { individual: 'Individual', sme: 'SME / Corporate' };

const TIERS = [
  {
    id: 'email', price: 'Free', accent: 'green',
    title: 'I’ll negotiate directly with my bank',
    desc: 'Included with your reveal — we draft a ready-to-send email you can fire off to your relationship manager today.',
    cta: 'Draft My Email',
  },
  {
    id: 'call', price: 'S$99', accent: 'blue', // price shown is FX-localized at runtime
    title: 'Help me negotiate with my bank',
    desc: 'A FeeOptima specialist reviews your numbers and coaches you through the call. Fees fully refundable if no savings.',
    cta: 'Book a Call',
  },
  {
    id: 'expert', price: 'S$199', accent: 'violet', // price shown is FX-localized at runtime
    title: 'I need an expert (ex-banker) to negotiate on my behalf',
    desc: 'A specialist ex-banker prepares and leads the negotiation with your bank for you. Fee fully refundable if no savings.',
    cta: 'Book an Expert',
  },
];

// The ~$1 reveal happens BEFORE this modal (on the result screen); returning from
// its Stripe checkout lands on the 'options' view (certificate + the 3 actions).
const VIEW_FOR_TIER = { reveal: 'options', call: 'call', expert: 'expert' };
// The dashboard gates a saved benchmark's bank reveal on its `stage`; a completed
// purchase moves it to the matching stage so the unlock persists.
const STAGE_FOR_TIER = { reveal: 'revealed', call: 'call', expert: 'expert' };
const CERT_SHARE_TEXT = 'Just ran an audit on my banking & treasury services using FeeOptima. Turns out companies are leaving serious money on the table with hidden fees. Optimized my stack and unlocked a cleaner structure. Transparency is everything in finance.';

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
          <strong>We’ll confirm your time by WhatsApp</strong>
          <p>Live self-scheduling is being finalised. In the meantime our team will reach out to lock in a slot that works for you — and you’ll get a calendar invite.</p>
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
  const [prices, setPrices] = useState({}); // { call: 'S$99' | '₹6,199', expert: … }
  const [paidTier, setPaidTier] = useState(null); // 'call' | 'expert' once paid (or demo)
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const bookedRef = useRef(null); // Stripe session already logged to the dashboard
  const unlockRef = useRef(null); // benchmark stage already marked for this tier
  const cardRef = useRef(null);
  const confirm = useConfirm();

  const segment = context?.segment && SEG_LABEL[context.segment] ? context.segment : 'individual';
  const savings = context?.annualSaving ?? null;
  const savingsCcy = context?.currency || 'SGD';
  const fmtSaving = (n) => formatMoney(n, savingsCcy);
  const isYield = context?.direction === 'higher';
  const ahead = context?.status === 'ahead';
  const standing = context?.beatsAll
    ? `all ${context?.poolSize} providers we benchmark`
    : context?.percentileBeaten != null
      ? `${context.percentileBeaten}% of the providers we benchmark`
      : 'the market'; // dashboard-saved rows don't carry the percentile fields
  const bank = context?.bestBank || null;
  const productLabel = context?.product || 'banking product';

  // Identity used to prefill Calendly + attribute the booking (set once signed in).
  const bookingPrefill = user ? { name: user.user_metadata?.full_name || '', email: user.email || '' } : undefined;

  // Headline savings % for the shareable certificate (best vs your rate).
  const savingPct = (() => {
    const y = Number(context?.yourRate), b = Number(context?.benchmarkRate);
    if (!Number.isFinite(y) || !Number.isFinite(b) || y <= 0) return null;
    const pct = isYield ? (b - y) / y : (y - b) / y;
    return pct > 0 ? Math.round(pct * 100) : null;
  })();

  // The signed-in user, resolved directly from Supabase when the React context
  // hasn't caught up yet. On a Stripe return this modal's effects run before
  // AuthContext's async getSession() resolves, so the closed-over `user` can be
  // null even though a session exists — which used to silently drop the booking
  // and reveal-lead writes for paying customers.
  const authUser = async () => {
    if (user) return user;
    if (!isSupabaseConfigured) return null;
    try { const { data } = await supabase.auth.getUser(); return data?.user ?? null; }
    catch { return null; }
  };

  // Persist a confirmed paid call to the user's dashboard. Idempotent per Stripe
  // session so re-renders don't double-insert. advisor_id stays null — a coaching
  // call isn't tied to a specific advisor.
  const recordCallBooking = async (sessionId) => {
    if (bookedRef.current === sessionId) return;
    bookedRef.current = sessionId;
    const u = await authUser();
    if (!u) { bookedRef.current = null; return; }
    createLead({
      source: 'call',
      segment: context?.segment || 'individual',
      product_label: context?.product || null,
      annual_saving: context?.annualSaving ?? null,
      full_name: u.user_metadata?.full_name || null,
      email: u.email || null,
      phone: u.user_metadata?.phone || null,
      booked: true,
    }).catch(() => { bookedRef.current = null; }); // allow a retry if the insert failed
  };

  // On a confirmed purchase, mark the source benchmark's stage so the dashboard
  // reveals its bank going forward, and record a "reveal" transaction (calls and
  // experts already log their own leads elsewhere).
  const applyUnlock = (tier) => {
    const stage = STAGE_FOR_TIER[tier];
    if (!stage) return;
    const bid = context?.benchmarkId;
    const sig = `${bid || ''}:${tier}`;
    if (unlockRef.current === sig) return;
    unlockRef.current = sig;
    if (bid) updateBenchmark(bid, { stage }).catch(() => {});
    if (tier === 'reveal') {
      // Resolve the user directly — the React `user` can lag on a Stripe return.
      authUser().then((u) => {
        if (!u) return;
        return createLead({
          source: 'reveal',
          segment: context?.segment || 'individual',
          product_label: context?.product || null,
          annual_saving: context?.annualSaving ?? null,
          full_name: u.user_metadata?.full_name || null,
          email: u.email || null,
          booked: true,
        });
      }).catch(() => {});
    }
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

  // Hide the floating Need Help widget while the modal is open. (Scroll-lock,
  // Escape and focus-trap are handled by useModalA11y below.)
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('jny-open');
    return () => document.body.classList.remove('jny-open');
  }, [open]);

  // Don't lose an edited negotiation email on a stray backdrop click / Escape.
  const requestClose = async () => {
    const editedEmail = view === 'email' && !!emailBody && emailBody !== defaultBody;
    if (editedEmail) {
      const ok = await confirm({
        title: 'Discard your draft?',
        body: 'Your edits to the negotiation email haven’t been copied yet — close and lose them?',
        confirmLabel: 'Discard', cancelLabel: 'Keep editing',
      });
      if (!ok) return;
    }
    onClose();
  };

  useModalA11y(open, cardRef, requestClose);

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
      // `unlockedTier` lets the dashboard reopen an already-purchased tier in
      // read/manage mode (bank + scheduler shown, no re-payment prompt).
      setView(resume.view || 'options');
      setExpert(resume.expert || null);
      setSentTo(null); setPaidTier(resume.unlockedTier || null); setPayError('');
      return;
    }
    if (resume) {
      setView(VIEW_FOR_TIER[resume.tier] || resume.tier || 'options');
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
          // Payment confirmed — log the paid call + unlock the source benchmark.
          if (resume.tier === 'call') recordCallBooking(resume.sessionId);
          applyUnlock(resume.tier);
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

  // The paid tiers are charged in the user's market currency, so show them that
  // way too. Falls back to the SGD list price if FX is unavailable.
  useEffect(() => {
    if (!open) return undefined;
    const ccy = context?.currency || 'SGD';
    let on = true;
    Promise.all(['call', 'expert'].map((t) => getTierPrice(t, ccy).then((p) => [t, p])))
      .then((pairs) => {
        if (!on) return;
        const next = {};
        for (const [t, p] of pairs) {
          if (p) next[t] = formatMoney(p.major, (p.currency || ccy).toUpperCase());
        }
        setPrices(next);
      })
      .catch(() => {});
    return () => { on = false; };
  }, [open, context?.currency]);

  // Localized label for a tier, with the hardcoded SGD price as the fallback.
  const priceOf = (tier, fallback) => prices[tier] || fallback;

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
        currency: context?.currency || 'SGD', // bill in the currency we showed
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
      sessionStorage.removeItem('bb_journey');
      setBusy(false);
      // With Stripe LIVE, a failed checkout call must never fall through to a
      // free unlock — that would give the paid product away on a network blip.
      if (paymentsEnabled) {
        setPayError('We couldn’t start the secure checkout. Please check your connection and try again.');
        return;
      }
      // Stripe not configured (demo build) → fall back to demo scheduling.
      setPaidTier(tier);
      applyUnlock(tier); // demo mode has no redirect — mark the benchmark now
    }
  };

  // Share the certificate itself as an IMAGE (with the caption text). On mobile
  // this uses the native share sheet's file support so the certificate PNG is
  // attached to the post; on desktop (no file share) it downloads the PNG and
  // copies the caption so the user can attach + post it.
  const shareCertificate = async () => {
    const url = SITE_URL;
    let file = null;
    try { file = await buildCertificateImage({ segment, product: context?.product, savingPct }); } catch { /* fall back below */ }

    // 1) Native file share — image + caption together (mobile).
    if (file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: CERT_SHARE_TEXT, title: 'FeeOptima' }); return true; }
      catch { return false; } // user dismissed the sheet
    }
    // 2) Native text share (mobile without file support) — caption + link.
    if (navigator.share) {
      try { await navigator.share({ title: 'FeeOptima', text: CERT_SHARE_TEXT, url }); return true; }
      catch { return false; }
    }
    // 3) Desktop — download the image + copy the caption to paste alongside it.
    if (file) {
      const href = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = href; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
    }
    try { await navigator.clipboard.writeText(`${CERT_SHARE_TEXT} ${url}`); } catch { /* clipboard blocked */ }
    setShared(true); setTimeout(() => setShared(false), 2500);
    return true;
  };

  if (!open) return null;

  const share = async () => {
    const verb = isYield ? 'earn an extra' : 'save';
    const text = ahead
      ? `My ${productLabel} is already ahead of the market — I just benchmarked my bank on FeeOptima`
      : `I could ${verb} ${savings ? fmtSaving(savings) : 'money'}/year on my ${productLabel} — I just benchmarked my bank on FeeOptima`;
    const url = SITE_URL;
    try {
      if (navigator.share) { await navigator.share({ title: 'FeeOptima', text, url }); }
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
      <div className="jny__backdrop" onClick={requestClose} />
      <div className="jny__panel" ref={cardRef}>
        <button className="jny__close" onClick={requestClose} aria-label="Close">×</button>

        {/* Reveal panel — the winning bank + saving, with a share button */}
        <div className="jny-reveal">
          <div className="jny-reveal__top">
            <span className="jny-reveal__eyebrow">{SEG_LABEL[segment]} · your result</span>
            <button className="jny-reveal__share" onClick={ahead ? share : shareCertificate} title="Share">
              {shared ? 'Shared ✓' : '↗ Share'}
            </button>
          </div>
          {ahead ? (
            <p className="jny-reveal__headline">You&apos;re already ahead of the market — beating <strong>{standing}</strong>. 🎉</p>
          ) : (
            <>
              <p className="jny-reveal__headline">
                {isYield ? 'Earn the money your bank isn’t paying you.' : 'Save the money your bank is making off you.'}
              </p>
              <div className="jny-reveal__rule jny-reveal__rule--thick" />
              {savings
                ? <div className="jny-reveal__amt">{fmtSaving(savings)}<span> {isYield ? 'extra / year' : 'per year'}</span></div>
                : <div className="jny-reveal__amt jny-reveal__amt--sm">Pick how you’d like to act below</div>}
              <div className="jny-reveal__rule jny-reveal__rule--thin" />
            </>
          )}
        </div>

        {/* OPTIONS — the shareable certificate + the three follow-on actions.
            The bank is already unlocked here (the ~$1 reveal was paid first). */}
        {view === 'options' && (
          <>
            {!context && (
              <div className="jny-note jny-note--warn">
                Your payment is confirmed, but this tab couldn’t restore your benchmark details
                (it looks like the session was opened fresh). Find your revealed bank in{' '}
                <a href="#dashboard">your dashboard</a> — or check your inbox for your sign-in link.
              </div>
            )}
            <Certificate segment={segment} product={context?.product} savingPct={savingPct} />
            <h4 className="jny-sectlabel">Your bank is unlocked — how would you like to act on it?</h4>
            <div className="jny-tiers">
              {TIERS.map((t, i) => (
                <div className={`jny-tier jny-tier--${t.accent}`} key={t.id}>
                  <span className="jny-tier__badge">Option {i + 1}</span>
                  <div className="jny-tier__price">{priceOf(t.id, t.price)}</div>
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

        {/* OPTION 1 (free) — the ready-to-send negotiation email. The bank is
            already unlocked (the ~$1 reveal was paid before this modal). */}
        {view === 'email' && (
          <div className="jny-sub">
            <button className="jny__back" onClick={back}>← Back to options</button>
            <h4 className="jny-sub__title">Your best-match bank</h4>
            <div className="jny-unlock">
              <span className="jny-unlock__name">{bank || 'Top provider'}</span>
              {context?.benchmarkRate != null && (
                <span className="jny-unlock__rate">Best price · {context.benchmarkRate}{context?.unit ? ` ${context.unit}` : '%'}</span>
              )}
            </div>
            <p className="jny-sub__sub">Here’s a ready-to-send email to negotiate directly with your bank.</p>

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
            <p className="jny-note">You send this yourself from your own inbox — we never email your bank on your behalf.</p>
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
                  <span className="jny-pill">{priceOf('call', 'S$99')}</span> A FeeOptima specialist reviews your numbers and coaches you through the negotiation.
                </p>
                {!user && (
                  <div className="jny-note jny-note--warn">
                    Sign in first so your booking is linked to your account — then pay and pick a time.
                  </div>
                )}
                <button className="btn btn--primary jny-pay" disabled={busy} onClick={() => pay('call')}>
                  {!user ? 'Sign in to book your call →' : busy ? 'Redirecting to secure checkout…' : `Pay ${priceOf('call', 'S$99')} & pick a time →`}
                </button>
                <p className="jny-note">🔒 Secure payment via Stripe. You'll choose your slot right after.</p>
              </>
            ) : (
              <>
                {paidTier === 'call' && <div className="jny-note jny-note--ok">✓ Payment received — pick a time below.</div>}
                <p className="jny-sub__sub"><span className="jny-pill">{priceOf('call', 'S$99')}</span> A FeeOptima specialist coaches you through the negotiation.</p>
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
                <p className="jny-sub__sub"><span className="jny-pill">{priceOf('expert', 'S$199')}</span> An expert prepares and leads the negotiation for you.</p>
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
                  <p className="jny-note">Example specialists — you’ll be matched with a verified advisor for your situation.</p>
                )}
              </>
            ) : (
              <>
                <h4 className="jny-sub__title">{expert.real ? `Book with ${expert.name}` : 'Get matched with an expert'}</h4>
                <p className="jny-sub__sub">{expert.role}{expert.company ? ` · ${expert.company}` : ''}{expert.years ? ` · ${expert.years} yrs experience` : ''}</p>
                {!expert.real && (
                  <div className="jny-note">
                    {expert.name} is an example profile. You'll be matched with a verified
                    specialist with this expertise — never charged for a specific person you haven't confirmed.
                  </div>
                )}
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
                    <p className="jny-sub__sub"><span className="jny-pill">{priceOf('expert', 'S$199')}</span> {expert.real ? `${expert.name.split(' ')[0]} prepares and leads the negotiation. Pay to confirm and schedule.` : 'Your matched expert prepares and leads the negotiation. Fully refundable if no savings.'}</p>
                    <button className="btn btn--primary jny-pay" disabled={busy} onClick={() => pay('expert', expert.real ? expert : null)}>
                      {!user ? 'Sign in to book →' : busy ? 'Redirecting to secure checkout…' : expert.real ? `Pay ${priceOf('expert', 'S$199')} & book ${expert.name.split(' ')[0]} →` : `Pay ${priceOf('expert', 'S$199')} & get matched →`}
                    </button>
                    <p className="jny-note">🔒 Secure payment via Stripe. You'll choose your slot right after.</p>
                  </>
                ) : (
                  <>
                    {paidTier === 'expert' && <div className="jny-note jny-note--ok">✓ Payment received — pick a time below.</div>}
                    <Scheduler url={(expert.real && expert.calendly_url) || CALENDLY_URL} prefill={bookingPrefill} note={expert.real ? `${expert.name} and you both receive the calendar invite from Calendly.` : 'Your matched expert and you both receive the calendar invite from Calendly.'} />
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
