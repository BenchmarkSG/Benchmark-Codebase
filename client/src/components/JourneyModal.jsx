import { useEffect, useMemo, useRef, useState } from 'react';
import './JourneyModal.css';
import { formatMoney, getReference, createCheckout, getCheckoutSession, getTierPrice } from '../api.js';
import { safeHttpUrl, isStripeCheckoutUrl } from '../lib/safeUrl.js';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { listAdvisorDirectory, listAdvisorAvailability, createLead, recordBooking, updateBenchmark, submitFeedback, getMyProfile } from '../lib/dashboardApi.js';
import Certificate from './Certificate.jsx';
import { buildCertificateImage } from '../lib/certificateImage.js';
import { SITE_URL } from '../lib/site.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { useConfirm } from './ConfirmProvider.jsx';
import { stashJourney, clearJourney } from '../lib/checkoutReturn.js';
import { markUnlocked } from '../lib/unlocks.js';
import { getAccessToken } from '../lib/supabase.js';

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
// The tier ladder, cheapest first, used to work out what's actually an UPGRADE
// for someone who already bought one. `reveal` sits at the bottom: it unlocks
// the bank and everyone on this screen has paid it, so it makes nothing here
// redundant — a revealed-only user still sees all three offered.
const TIER_RANK = { reveal: 0, email: 1, call: 2, expert: 3 };
// The dashboard gates a saved benchmark's bank reveal on its `stage`; a completed
// purchase moves it to the matching stage so the unlock persists.
const STAGE_FOR_TIER = { reveal: 'revealed', call: 'call', expert: 'expert' };
// Marker param pushed onto history while this overlay is open, so the browser
// Back button dismisses it instead of leaving the site (see the history effect).
// Deliberately a SEARCH param, never the hash: Root.jsx routes on the hash, so
// touching it here would navigate the dashboard away from itself mid-flow.
const NAV_PARAM = 'journey';
// CC'd on the negotiation email when — and only when — the user ticks the box.
const CC_EMAIL = 'admin@feeoptima.com';
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
      // The payload carries only opaque URIs (event + invitee), never the start
      // time — that has to be fetched from Calendly's API later. Hand them up so
      // the booking can be stamped and resolved afterwards.
      if (e.origin === 'https://calendly.com' && e.data?.event === 'calendly.event_scheduled') cb.current?.(e.data.payload);
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

// Star rating + optional comment, asked once a slot is booked.
//
// Note what this can and can't be about: at this moment the call hasn't happened
// yet, so it rates the BOOKING EXPERIENCE, not the specialist. Post-call
// sentiment is a separate ask — the "How did it go?" email in server/email.js.
// Wording it as "how was booking" keeps the two from being conflated in the data.
function FeedbackCard({ source, benchmarkId }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [state, setState] = useState('idle'); // idle | sending | done | error

  if (state === 'done') {
    return <div className="jny-note jny-note--ok">✓ Thanks — that helps us sharpen this for the next person.</div>;
  }

  const send = async () => {
    if (!rating) return;
    setState('sending');
    try {
      await submitFeedback({ rating, comment, source, benchmarkId });
      setState('done');
    } catch {
      // Never a dead end: their booking is already confirmed, so a failed
      // rating is a footnote, not something to make them deal with.
      setState('error');
    }
  };

  const shown = hover || rating;
  return (
    <div className="jny-rate">
      <p className="jny-rate__q">How was booking with us?</p>
      <div className="jny-rate__stars" role="radiogroup" aria-label="Rate your booking experience">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n} type="button"
            className={`jny-rate__star${n <= shown ? ' is-on' : ''}`}
            role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(n)} onBlur={() => setHover(0)}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>

      {/* The comment box only appears once they've rated — nothing to say about
          an experience they haven't scored yet, and it keeps the ask small. */}
      {rating > 0 && (
        <>
          <textarea
            className="jny-rate__note" rows={3} maxLength={1000} value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything you'd like to add? (optional)"
          />
          <button type="button" className="btn btn--primary btn--block" disabled={state === 'sending'} onClick={send}>
            {state === 'sending' ? 'Sending…' : 'Send feedback'}
          </button>
          {state === 'error' && <p className="jny-rate__err">We couldn’t save that just now — your booking is confirmed either way.</p>}
        </>
      )}
    </div>
  );
}

// Booking panel: the Calendly embed if a URL is available, else a clear placeholder.
// `onDone` is called with 'home' | 'dashboard' once a slot is booked — the modal
// is a dead end otherwise, since the only way out is the × in the corner.
function Scheduler({ url, prefill, note, onDone, feedback, onScheduled }) {
  const [scheduled, setScheduled] = useState(false);
  const safeUrl = safeHttpUrl(url); // block javascript:/data: from advisor-controlled links
  const linkUrl = safeUrl ? appendPrefill(safeUrl, prefill) : safeUrl;
  return (
    <div className="jny-sched">
      {safeUrl ? (
        <>
          {scheduled && <div className="jny-note jny-note--ok">✓ Time booked — the calendar invite is on its way to your inbox.</div>}
          <CalendlyEmbed
            url={safeUrl} prefill={prefill}
            onScheduled={(payload) => { setScheduled(true); onScheduled?.(payload); }}
          />
          {scheduled ? (
            // Booked — offer a way onward. The "open in a new tab" link is hidden
            // here: re-opening the scheduler after booking only invites a
            // duplicate booking.
            onDone && (
              <div className="jny-done">
                {feedback && <FeedbackCard source={feedback.source} benchmarkId={feedback.benchmarkId} />}
                <p className="jny-done__title">You&apos;re all set. Where next?</p>
                <div className="jny-actions">
                  <button type="button" className="btn btn--primary" onClick={() => onDone('dashboard')}>
                    Go to my dashboard →
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => onDone('home')}>
                    Back to home
                  </button>
                </div>
              </div>
            )
          ) : (
            <a className="jny-sched__link" href={linkUrl} target="_blank" rel="noopener noreferrer">Open the scheduler in a new tab ↗</a>
          )}
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

// Windows an advisor has blocked (admin → Advisor availability). Surfaced so the
// user books around them: the embedded Calendly widget cannot know about these,
// because Calendly exposes no API for writing availability from outside.
function AwayNote({ windows, name }) {
  if (!windows?.length) return null;
  const label = (w) => {
    // Built as a local date — new Date('2026-09-12') is UTC midnight and shows
    // as the 11th for anyone west of Greenwich.
    const [y, m, d] = (w.block_date || '').split('-').map(Number);
    if (!y) return w.block_date;
    const day = new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return w.start_time
      ? `${day} ${w.start_time.slice(0, 5)}–${w.end_time.slice(0, 5)}`
      : `${day} (all day)`;
  };
  return (
    <p className="jny-away">
      <strong>Unavailable:</strong> {windows.map(label).join(' · ')}
      {name ? ` — please pick a time outside these when booking ${name}.` : ''}
    </p>
  );
}

export default function JourneyModal({ open, onClose, context, onRequireAuth, resume }) {
  const { user } = useAuth();
  const [view, setView] = useState('options'); // 'options' | 'email' | 'call' | 'expert'
  const [expert, setExpert] = useState(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [ccUs, setCcUs] = useState(false); // CC FeeOptima on the negotiation email
  const [company, setCompany] = useState(''); // names the SME certificate's holder
  const [holderName, setHolderName] = useState(''); // names the individual certificate's holder
  const [shared, setShared] = useState(false);
  const [advisors, setAdvisors] = useState([]);
  const [blackouts, setBlackouts] = useState([]); // upcoming advisor unavailability
  const [sentTo, setSentTo] = useState(null); // advisor id once a lead is created
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [prices, setPrices] = useState({}); // { call: 'S$99' | '₹6,199', expert: … }
  const [paidTier, setPaidTier] = useState(null); // 'call' | 'expert' once paid (or demo)
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState(''); // set once Stripe hands us a URL
  const [stalled, setStalled] = useState(false);      // redirect didn't take
  const bookedRef = useRef(null); // Stripe session already logged to the dashboard
  const leadRef = useRef(null);   // the lead row for THIS engagement, stamped once a slot is booked
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
  const withUnit = (v) => {
    const u = context?.unit;
    if (!u) return `${v}%`;
    return u.startsWith('%') ? `${v}${u}` : `${v} ${u}`;
  };
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

  // Persist a confirmed paid tier (Option 2 call / Option 3 expert) so the admin
  // portal can see who bought what. Idempotent per Stripe session so re-renders
  // don't double-insert.
  //
  // `existingId` is the lead "Select Me" already created for a real advisor,
  // carried across the Stripe redirect in the journey stash — the modal remounts
  // on the way back, so an in-memory ref can't answer this and we'd otherwise
  // file the same engagement twice. advisor_id is null for a coaching call and
  // for the sample experts (their ids aren't advisor uuids), which is exactly
  // why advisor_name is snapshotted alongside it.
  const recordPaidBooking = async (tier, sessionId, existingId = null, adv = null) => {
    if (bookedRef.current === sessionId) return;
    bookedRef.current = sessionId;
    if (existingId) { leadRef.current = existingId; return; }
    const u = await authUser();
    if (!u) { bookedRef.current = null; return; }
    try {
      const row = await createLead({
        source: tier === 'expert' ? 'expert' : 'call',
        advisor_id: adv?.real ? adv.id : null,
        advisor_name: adv?.name || null,
        segment: context?.segment || 'individual',
        product: context?.productId || null,
        product_label: context?.product || null,
        benchmark_id: context?.benchmarkId || null,
        annual_saving: context?.annualSaving ?? null,
        full_name: u.user_metadata?.full_name || null,
        email: u.email || null,
        phone: u.user_metadata?.phone || null,
        booked: false, // flipped by record_booking() once a slot is actually picked
      });
      leadRef.current = row?.id || null;
    } catch { bookedRef.current = null; } // allow a retry if the insert failed
  };

  // A slot was picked in the Calendly widget. Calendly's message carries only
  // opaque URIs — scripts/sync-calendly.mjs turns the event URI into the actual
  // start time later. Best-effort: the booking is already made either way.
  const stampBooking = (payload) => {
    const id = leadRef.current;
    if (!id) return;
    recordBooking(id, payload?.event?.uri || null, payload?.invitee?.uri || null).catch(() => {});
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
    // Remember it locally too. The row below is the durable record, but it isn't
    // read back by the page someone lands on after closing this modal — without
    // this, a stray click on ✕ puts a full-price button back in front of them.
    markUnlocked(context, tier);
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

  // Has the user edited the negotiation email without copying it? Mirrored into a
  // ref so the history effect below can check it without listing `emailBody` as a
  // dependency — which would re-run (and re-push) the effect on every keystroke.
  const hasDraft = view === 'email' && !!emailBody && emailBody !== defaultBody;
  const hasDraftRef = useRef(hasDraft);
  hasDraftRef.current = hasDraft;

  // Don't lose an edited negotiation email on a stray backdrop click / Escape / Back.
  const confirmDiscardDraft = () => confirm({
    title: 'Discard your draft?',
    body: 'Your edits to the negotiation email haven’t been copied yet — close and lose them?',
    confirmLabel: 'Discard', cancelLabel: 'Keep editing',
  });

  const requestClose = async () => {
    if (hasDraft && !(await confirmDiscardDraft())) return;
    onClose();
  };

  useModalA11y(open, cardRef, requestClose);

  // Browser Back dismisses the overlay instead of leaving the page. On mobile
  // Back IS the instinctive "close" gesture, and this overlay shows what the
  // user just paid for — exiting the site and losing it is the worst outcome we
  // can hand them. So while it's open we hold one extra history entry, and Back
  // pops it to close instead of navigating away.
  //
  // Note what this deliberately does NOT do: call history.back() itself. Closing
  // must never navigate. The overlay can unmount mid-flow (its missing-context
  // note links to #dashboard, which re-routes the whole app), and a back() in
  // cleanup would undo the user's own navigation and bounce them right back. The
  // cost is that after closing normally one Back press is absorbed by the spent
  // entry — cheap next to a close button whose correctness rides on popstate.
  //
  // `onClose` lives in a ref because callers pass an unstable inline callback
  // (UserDashboard does); depending on it here would re-run the effect on every
  // parent render and push another history entry each time.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const marked = (() => {
      const { pathname, search, hash } = window.location;
      const params = new URLSearchParams(search);
      params.set(NAV_PARAM, '1');
      return `${pathname}?${params}${hash}`;
    })();
    window.history.pushState({ jny: true }, '', marked);

    const onPop = async () => {
      // Back has already consumed our entry. Give it the same draft protection
      // the close button has: restore the entry, ask, and only then close.
      if (hasDraftRef.current) {
        window.history.pushState({ jny: true }, '', marked);
        if (!(await confirmDiscardDraft())) return; // stay open, entry restored
      }
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Strip the marker so the URL matches what's on screen. replaceState is
      // synchronous and fires no popstate, and rebuilding from the CURRENT
      // location means a hash navigation that unmounted us is preserved.
      const { pathname, search, hash } = window.location;
      const params = new URLSearchParams(search);
      if (!params.has(NAV_PARAM)) return;
      params.delete(NAV_PARAM);
      const query = params.toString();
      window.history.replaceState({}, '', `${pathname}${query ? `?${query}` : ''}${hash}`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Is Stripe configured on the server? (Controls whether paid tiers charge.)
  useEffect(() => {
    if (open) getReference().then((r) => setPaymentsEnabled(!!r.paymentsEnabled)).catch(() => {});
  }, [open]);

  // Reset on open — or, if returning from Stripe Checkout, resume to the tier +
  // verify the payment before showing the scheduler.
  useEffect(() => {
    if (!open) return;
    setEmailTo(''); setEmailBody(defaultBody); setCopied(false); setShared(false); setCcUs(false);
    setCheckoutUrl(''); setStalled(false);
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
        // Signed in? Say so. Without the token the server treats every payer as
        // anonymous and mails them a sign-in link they don't need.
        getAccessToken().then((tok) => getCheckoutSession(resume.sessionId, tok)).then((s) => {
          if (!s?.paid) {
            setPaidTier(null);
            setPayError('We couldn’t confirm your payment. Please try again.');
            return;
          }
          // Payment confirmed — log the paid engagement + unlock the source benchmark.
          if (resume.tier === 'call' || resume.tier === 'expert') {
            recordPaidBooking(resume.tier, resume.sessionId, resume.leadId, resume.expert);
          }
          applyUnlock(resume.tier);
        });
      }
    } else {
      setView('options'); setExpert(null); setSentTo(null); setPaidTier(null); setPayError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resume]);

  // Both certificates are made out to someone: the SME's to a company, the
  // individual's to a person. Best-effort — each design falls back to a neutral
  // placeholder rather than rendering a blank holder line.
  useEffect(() => {
    if (!open || !user) return undefined;
    let alive = true;
    const meta = user.user_metadata || {};
    // Show the name we already have immediately; the profile may refine it.
    setHolderName(meta.full_name || '');
    getMyProfile()
      .then((p) => {
        if (!alive) return;
        setCompany(p?.company || p?.full_name || '');
        setHolderName(p?.full_name || meta.full_name || '');
      })
      .catch(() => { /* placeholder holder name is fine */ });
    return () => { alive = false; };
  }, [open, user]);

  // Load the real approved-advisor directory for the expert picker, plus any
  // blocked windows so we can flag them before someone picks a time. The
  // availability call swallows its own errors — a missing note must never stop
  // a booking.
  useEffect(() => {
    if (!open) return;
    listAdvisorDirectory().then(setAdvisors).catch(() => setAdvisors([]));
    listAdvisorAvailability().then(setBlackouts).catch(() => setBlackouts([]));
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

  // Upcoming blocked windows, keyed by advisor (admin → Advisor availability).
  const blackoutsFor = (id) => blackouts.filter((b) => b.advisor_id === id).slice(0, 6);

  // Real advisors if any are approved; otherwise the labelled demo set.
  const experts = advisors.length
    ? advisors.map((a) => ({
        id: a.id, real: true, name: a.full_name,
        role: a.specialization || 'Banking specialist',
        company: a.company || '', years: a.years_experience || null,
        blurb: a.description || '', photo: a.photo_url || null,
        calendly_url: a.calendly_url || '', accent: '#2f7bd8',
        away: blackoutsFor(a.id),
      }))
    : SAMPLE_EXPERTS;

  // Selecting a real advisor while signed in creates an assigned lead (their inbox).
  const connectExpert = async (adv) => {
    setExpert(adv);
    if (!adv?.real || sentTo === adv.id) return;
    if (!user) return; // a sign-in prompt is shown in the booking view
    try {
      const row = await createLead({
        advisor_id: adv.id,
        advisor_name: adv.name || null,
        source: 'expert',
        segment: context?.segment || 'individual',
        product: context?.productId || null,
        product_label: context?.product || null,
        benchmark_id: context?.benchmarkId || null,
        annual_saving: context?.annualSaving ?? null,
        full_name: user.user_metadata?.full_name || null,
        email: user.email,
        phone: user.user_metadata?.phone || null,
        // Picking a specialist isn't a booking — record_booking() flips this
        // once they actually choose a slot, which is what the admin list reads.
        booked: false,
      });
      leadRef.current = row?.id || null;
      setSentTo(adv.id);
    } catch { /* non-blocking */ }
  };

  // Picking one of the three options is the moment we ask for an account: the
  // user has chosen what they want, so the prompt reads as "sign in to do this"
  // rather than a toll gate in front of the offer. After auth the resume flow
  // reopens the modal on the option they picked (App.jsx reads intent.view).
  // An option they already own reopens with no prompt - owning it implies an
  // account.
  const chooseTier = (id, owned) => {
    if (!user && !owned) { onRequireAuth?.({ kind: 'journey', context, view: id, expert }); return; }
    setView(id);
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
      stashJourney({ tier, expert: snap, context, leadId: leadRef.current });
      const { url } = await createCheckout({
        tier,
        currency: context?.currency || 'SGD', // bill in the currency we showed
        advisorId: adv?.real ? adv.id : undefined,
        product: context?.product || null,
        segment: context?.segment || 'individual',
        email: user?.email || undefined,
        // Lets the server refuse a reveal this benchmark already has.
        benchmarkId: context?.benchmarkId || undefined,
      }, await getAccessToken());
      // Only ever navigate to a genuine Stripe Checkout URL (defends against a
      // compromised/misconfigured API returning an open-redirect target).
      if (!isStripeCheckoutUrl(url)) throw new Error('Unexpected checkout URL');
      // If the redirect doesn't take, the button would otherwise sit on
      // "Redirecting…" forever with no way out. A cross-origin assign() can be
      // swallowed by a stale service worker, an extension, or a blocked popup,
      // and none of those reject — so nothing here would ever run again. Hand
      // the user a working link instead of a dead end. Cleared by the unload
      // that a successful navigation triggers.
      setCheckoutUrl(url);
      const stall = setTimeout(() => { setBusy(false); setStalled(true); }, 6000);
      window.addEventListener('pagehide', () => clearTimeout(stall), { once: true });
      window.location.assign(url);
    } catch (err) {
      clearJourney();
      setBusy(false);
      // Already owned: the server declined to sell it twice. Show what they
      // bought rather than an error they can do nothing about.
      if (err?.code === 'already_purchased') {
        markUnlocked(context, tier);
        setPaidTier(tier);
        setPayError('');
        setView(VIEW_FOR_TIER[tier] || 'options');
        return;
      }
      // With Stripe LIVE, a failed checkout call must never fall through to a
      // free unlock — that would give the paid product away on a network blip.
      if (paymentsEnabled) {
        // Server messages are already sanitised (app.js keeps internals out of
        // responses), so showing them beats a generic line that tells the user
        // nothing about whether retrying will help.
        setPayError(err?.message
          ? `We couldn’t start the secure checkout. ${err.message}`
          : 'We couldn’t start the secure checkout. Please check your connection and try again.');
        return;
      }
      // Stripe not configured (demo build) → fall back to demo scheduling.
      setPaidTier(tier);
      applyUnlock(tier); // demo mode has no redirect — mark the benchmark now
    }
  };

  // Rendering the certificate to a PNG costs a canvas paint and a blob encode,
  // and the share bar can fire several times (one per network). Build it once
  // per set of inputs; the effect below drops the cache when they change.
  const certFileRef = useRef(null);
  useEffect(() => { certFileRef.current = null; }, [segment, context?.product, savingPct, company, holderName]);
  const buildCertFile = async () => {
    if (!certFileRef.current) {
      certFileRef.current = await buildCertificateImage({ segment, product: context?.product, savingPct, company, holderName });
    }
    return certFileRef.current;
  };

  // Share the certificate itself as an IMAGE (with the caption text). On mobile
  // this uses the native share sheet's file support so the certificate PNG is
  // attached to the post; on desktop (no file share) it downloads the PNG and
  // copies the caption so the user can attach + post it.
  const shareCertificate = async () => {
    const url = SITE_URL;
    let file = null;
    try { file = await buildCertFile(); } catch { /* fall back below */ }

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
  const mailtoHref = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}`
    + (ccUs ? `&cc=${encodeURIComponent(CC_EMAIL)}` : '')
    + `&body=${encodeURIComponent(emailBody)}`;

  const back = () => { setView('options'); setExpert(null); setPayError(''); };

  // Where to go once a slot is booked. Close first, then navigate: the modal's
  // history effect strips its marker param from whatever the location is at
  // cleanup, so the hash we set here survives.
  const finishTo = (dest) => {
    onClose();
    window.location.hash = dest === 'dashboard' ? '#dashboard' : '#top';
  };

  return (
    <div className="jny" role="dialog" aria-modal="true" aria-label="Your next steps">
      <div className="jny__backdrop" onClick={requestClose} />
      <div className="jny__panel" ref={cardRef}>
        <div className="jny__head">
          <div className="jny__head-title">Your result</div>
          <div className="jny__head-sub">{SEG_LABEL[segment]} · {productLabel}</div>
        </div>
        <button className="jny__close" onClick={requestClose} aria-label="Close">×</button>

        {/* Reveal panel — the winning bank + saving, with a share button. Only on
            the options screen: once the user has picked an action, the sub-view
            has its own heading and repeating the result here just pushes the
            actual task below the fold. */}
        {view === 'options' && (
        <div className="jny-reveal">
          <div className="jny-reveal__top">
            {/* Only in the 'ahead' state, which renders no certificate to carry a
                share button of its own. Otherwise this would just duplicate it. */}
            {ahead && (
              <button className="jny-reveal__share" onClick={share} title="Share">
                {shared ? 'Shared ✓' : '↗ Share'}
              </button>
            )}
          </div>
          {/* The unlocked bank itself. This is what the reveal was paid for, so
              it leads the screen — everything below is what you do about it. */}
          {bank && (
            <div className="jny-unlock jny-unlock--reveal">
              <span className="jny-unlock__label">Your best-match bank</span>
              <span className="jny-unlock__name">{bank}</span>
              {context?.benchmarkRate != null && (
                <span className="jny-unlock__rate">Best price · {withUnit(context.benchmarkRate)}</span>
              )}
            </div>
          )}
          {ahead ? (
            <p className="jny-reveal__headline">You&apos;re already ahead of the market — beating <strong>{standing}</strong>. 🎉</p>
          ) : (
            /* Headline, amount and the rule that underscores them shrink-wrap
               together, so the rule stops where the widest line stops instead of
               running the full panel width, and the band is centred as a whole. */
            <div className="jny-reveal__summary">
              <p className="jny-reveal__headline">
                {isYield ? 'Earn the money your bank isn’t paying you.' : 'Save the money your bank is making off you.'}
              </p>
              {/* The amount and its rule shrink-wrap together inside the band,
                  so the rule underlines the figure at exactly its width. */}
              <div className="jny-reveal__amtline">
                {savings
                  ? <div className="jny-reveal__amt">{fmtSaving(savings)}<span> {isYield ? 'extra / year' : 'per year'}</span></div>
                  : <div className="jny-reveal__amt jny-reveal__amt--sm">Pick how you’d like to act below</div>}
                <div className="jny-reveal__rule jny-reveal__rule--thick" />
              </div>
            </div>
          )}
        </div>
        )}

        {/* OPTIONS — the shareable certificate + the three follow-on actions.
            The bank is already unlocked here (the ~$1 reveal was paid first). */}
        {view === 'options' && (
          <>
            {!context && (
              /* Only reachable when the context could not be rebuilt either — a
                 signed-in buyer's row is recovered from the server on return
                 (see recoverPaidContext), so they should never land here. Don't
                 send someone who IS signed in to look for a sign-in email. */
              <div className="jny-note jny-note--warn">
                Your payment is confirmed. {user
                  ? <>Your revealed bank is saved to your account — open{' '}
                    <a href="#dashboard">your dashboard</a> to see it.</>
                  : <>This tab couldn’t restore your benchmark details (it looks like the
                    page was opened fresh). Check your inbox for your sign-in link — it
                    puts the purchase on your account, on any device.</>}
              </div>
            )}
            <h4 className="jny-sectlabel">
              {paidTier && !TIERS.some((t) => TIER_RANK[t.id] > TIER_RANK[paidTier])
                ? 'You’re on our top tier — everything below is already yours.'
                : 'Your bank is unlocked — how would you like to act on it?'}
            </h4>
            <div className="jny-tiers">
              {TIERS.map((t, i) => {
                // Anything at or below what they've already paid for is theirs.
                // Re-offering it for sale (which is what this screen used to do
                // when reached via "Upgrade options") is just wrong.
                const owned = !!paidTier && TIER_RANK[t.id] <= TIER_RANK[paidTier];
                const current = paidTier === t.id;
                return (
                  <div className={`jny-tier jny-tier--${t.accent}${owned ? ' jny-tier--owned' : ''}`} key={t.id}>
                    <span className="jny-tier__badge">{current ? 'Your plan' : `Option ${i + 1}`}</span>
                    <div className="jny-tier__price">
                      {owned ? (current ? '✓ Purchased' : '✓ Included') : priceOf(t.id, t.price)}
                    </div>
                    <div className="jny-tier__title">{t.title}</div>
                    {/* CTA sits directly under the title; the detail reads as a
                        footnote beneath it rather than something to get past. */}
                    <button className="jny-tier__cta" onClick={() => chooseTier(t.id, owned)}>
                      {owned ? (current ? 'Manage this →' : 'Open →') : `${t.cta} →`}
                    </button>
                    <div className="jny-tier__desc">{t.desc}</div>
                  </div>
                );
              })}
            </div>
            {/* Last: the keepsake. Narrower than the options on purpose — it's a
                document to share, not another thing to act on. */}
            <Certificate
              segment={segment} product={context?.product} savingPct={savingPct}
              company={company} holderName={holderName}
              onShare={shareCertificate} shared={shared}
              caption={CERT_SHARE_TEXT} buildFile={buildCertFile}
            />
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
                <span className="jny-unlock__rate">Best price · {withUnit(context.benchmarkRate)}</span>
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

            {/* Off by default: this is the user's private correspondence with
                their own bank, including their rates. Opting them in silently
                isn't ours to do. Only affects the mail-app link — "Copy email"
                copies the body, which carries no recipients. */}
            <label className="jny-cc">
              <input type="checkbox" checked={ccUs} onChange={(e) => setCcUs(e.target.checked)} />
              <span>
                CC us on this email <em>({CC_EMAIL})</em>
                <small>So we can follow up and help if your bank pushes back.</small>
              </span>
            </label>

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
            {stalled && checkoutUrl && (
              <div className="jny-note jny-note--warn">
                The redirect didn’t go through — this can happen if a browser extension
                or a cached service worker blocks it.{' '}
                <a href={checkoutUrl} rel="noopener noreferrer">Open secure checkout →</a>
              </div>
            )}
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
                <Scheduler url={CALENDLY_URL} prefill={bookingPrefill} onDone={finishTo} onScheduled={stampBooking} feedback={{ source: 'call', benchmarkId: context?.benchmarkId }} note="You and the specialist both receive the calendar invite from Calendly." />
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
                        <AwayNote windows={x.away} />
                      </div>
                      <button className="jny-expert__pick" onClick={() => connectExpert(x)}>Select Me</button>
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
            {stalled && checkoutUrl && (
              <div className="jny-note jny-note--warn">
                The redirect didn’t go through — this can happen if a browser extension
                or a cached service worker blocks it.{' '}
                <a href={checkoutUrl} rel="noopener noreferrer">Open secure checkout →</a>
              </div>
            )}

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
                    <AwayNote windows={expert.away} name={expert.name} />
                    <Scheduler url={(expert.real && expert.calendly_url) || CALENDLY_URL} prefill={bookingPrefill} onDone={finishTo} onScheduled={stampBooking} feedback={{ source: 'expert', benchmarkId: context?.benchmarkId }} note={expert.real ? `${expert.name} and you both receive the calendar invite from Calendly.` : 'Your matched expert and you both receive the calendar invite from Calendly.'} />
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
