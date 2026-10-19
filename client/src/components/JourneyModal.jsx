import { useEffect, useMemo, useRef, useState } from 'react';
import './JourneyModal.css';
import { formatMoney, getReference, createCheckout, getCheckoutSession, getTierPrice } from '../api.js';
import { safeHttpUrl, isStripeCheckoutUrl } from '../lib/safeUrl.js';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase, isSupabaseConfigured } from '../lib/supabase.js';
import { listAdvisorDirectory, listAdvisorAvailability, createLead, recordBooking, updateBenchmark, submitFeedback, getMyProfile, updateMyProfile } from '../lib/dashboardApi.js';
import Certificate from './Certificate.jsx';
import CertificateShare from './CertificateShare.jsx';
import { buildCertificateImage } from '../lib/certificateImage.js';
import { SITE_URL } from '../lib/site.js';
import { useModalA11y } from '../hooks/useModalA11y.js';
import { useConfirm } from './ConfirmProvider.jsx';
import { stashJourney, clearJourney } from '../lib/checkoutReturn.js';
import { markUnlocked } from '../lib/unlocks.js';
import { storeAfterAuth, clearAfterAuth } from '../lib/afterAuth.js';
import { getAccessToken } from '../lib/supabase.js';
import { chatLink, confirmLink, verificationCode, whatsappReady, looksDialable, missingCountryCode, saveWhatsAppNumber } from '../lib/whatsapp.js';
import { logoForBank } from './BankLogos.jsx';
import { expertAvatar } from '../lib/avatars.js';
import { CALL_FAQ, EXPERT_FAQ } from '../lib/faqs.js';
import StepBar from './StepBar.jsx';
import SlotPicker, { zoneShort } from './SlotPicker.jsx';
import ContactFields from './ContactFields.jsx';
import { prefetchCallSlots, holdCallSlot, confirmCallSlot, rescheduleCallSlot, releaseCallSlot, SlotTakenError, fullLabel, viewerZone, zoneLabel } from '../lib/booking.js';
import { callInvite, downloadInvite } from '../lib/ics.js';

/* How long is left on a held slot.
 *
 * The hold is the whole reason for owning the calendar: it lets someone walk
 * into Stripe Checkout with the time reserved, and gives the time back on its
 * own if they never come out. That only works if they can SEE it — an
 * unexplained "that time has gone" on the way back would read as a bug.
 *
 * Ticks every second; `onExpire` fires once, when it actually runs out. */
function HoldTimer({ until, onExpire, idleMins = 10 }) {
  // No hold yet: the full allowance, standing still, so the box reads the same
  // before and after — only the clock starting tells them the hold is live.
  const idle = !until;
  const [left, setLeft] = useState(() => (idle ? idleMins * 60000 : Math.max(0, new Date(until).getTime() - Date.now())));
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
    if (idle) { setLeft(idleMins * 60000); return undefined; }
    const tick = () => {
      const ms = Math.max(0, new Date(until).getTime() - Date.now());
      setLeft(ms);
      if (ms <= 0 && !firedRef.current) { firedRef.current = true; onExpire?.(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // onExpire is recreated every render by the parent; re-subscribing on it
    // would restart the countdown each tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  if (!idle && left <= 0) return null;
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return (
    <span className={`jny-hold__timer${idle ? ' is-idle' : ''}`}>
      {/* A small clock beside the countdown: the second hand ticks once a
          second, the minute hand sweeps slowly. Decoration only. */}
      <svg className="jny-hold__dial" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <line className="jny-hold__hand jny-hold__hand--min" x1="12" y1="12" x2="12" y2="6.5"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line className="jny-hold__hand jny-hold__hand--sec" x1="12" y1="13.5" x2="12" y2="4.5"
          stroke="var(--red-600)" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      </svg>
      <span className="jny-hold__clock">{mins}:{String(secs).padStart(2, '0')}</span>
    </span>
  );
}

/* Screen 3 — the "reveal + act on it" screen. Three vertical tiers: negotiate
   yourself (free), get a coaching call (US$19 / US$49 SME), or hire an expert (US$49 / US$99 SME). The paid
   tiers charge via Stripe Checkout (server /api/checkout); on return the modal
   resumes to the Calendly scheduler. If Stripe isn't configured, the paid tiers
   fall back to demo scheduling so the flow still works. */

const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || '';
const SEG_LABEL = { individual: 'Individual', sme: 'SME / Corporate' };

// USD list prices, shown only until the localized price loads. The charge
// itself is always computed server-side (payments.js).
const LIST_PRICE = {
  call:   { individual: 'US$19', sme: 'US$49' },
  expert: { individual: 'US$49', sme: 'US$99' },
};

// The confirmation screens' FAQs (CALL_FAQ, EXPERT_FAQ) live in lib/faqs.js,
// shared with the landing page's FAQ section.

// The booking track for Options 2 and 3, shown in the header while booking.
const CALL_STEPS = [
  { key: 'book',      label: 'Book' },
  { key: 'confirm',   label: 'Confirm' },
  { key: 'negotiate', label: 'Negotiate' },
];

const TIERS = [
  {
    id: 'email', price: 'Free', tag: 'DIY', accent: 'green',
    name: 'Draft my Email',
    title: 'I’ll negotiate directly with my bank',
    points: ['Ready-to-send email template you can send to your relationship manager'],
    cta: 'Generate Email',
  },
  {
    id: 'call', tag: 'Recommended', popular: true, accent: 'blue', // price: LIST_PRICE (USD), FX-localized at runtime
    name: 'Book a Call',
    title: 'Help me negotiate with my bank!',
    points: ['Select a date & time', '15-min 1:1 coaching call'],
    cta: 'Book a Call',
  },
  {
    id: 'expert', tag: 'Best Results', accent: 'violet', // price: LIST_PRICE (USD), FX-localized at runtime
    name: 'Book an Expert',
    title: 'I need an expert to negotiate on my behalf',
    points: ['Select an expert', 'Preparation & planning', 'Expert leads the negotiation'],
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
/* The WhatsApp mark, inline so the button needs no asset. Decorative — the
   button's own text already says where it goes. */
const WhatsAppGlyph = () => (
  <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M16.04 3.5c-6.9 0-12.5 5.6-12.5 12.5 0 2.2.58 4.35 1.68 6.25L3.5 28.5l6.42-1.68a12.46 12.46 0 0 0 6.12 1.56c6.9 0 12.5-5.6 12.5-12.5S22.94 3.5 16.04 3.5Zm0 22.83c-1.9 0-3.77-.51-5.4-1.48l-.39-.23-3.81 1 1.02-3.71-.25-.4a10.34 10.34 0 0 1-1.59-5.5c0-5.72 4.66-10.38 10.4-10.38 5.73 0 10.38 4.66 10.38 10.39 0 5.73-4.65 10.38-10.37 10.38Zm5.7-7.77c-.31-.16-1.85-.91-2.14-1.02-.29-.1-.5-.16-.71.16-.21.31-.82 1.02-1 1.23-.19.21-.37.24-.68.08-.31-.16-1.32-.49-2.51-1.55-.93-.83-1.55-1.85-1.74-2.16-.18-.31-.02-.48.14-.64.14-.14.31-.37.47-.55.16-.19.21-.32.31-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.53-.71-.54l-.6-.01c-.21 0-.55.08-.84.4-.29.31-1.1 1.08-1.1 2.63 0 1.55 1.13 3.05 1.29 3.26.16.21 2.22 3.39 5.38 4.76.75.32 1.34.51 1.8.66.76.24 1.44.21 1.99.13.61-.09 1.85-.76 2.11-1.48.26-.73.26-1.35.18-1.48-.08-.13-.29-.21-.6-.37Z" />
  </svg>
);

/* WhatsApp is how we reach people, so this is where we ask for it.

   WHAT THIS CAN AND CANNOT ESTABLISH
   No API will tell us whether a number is on WhatsApp — Meta retired the
   On-Premises /v1/contacts check in Oct 2025 and the Cloud API ships no
   replacement, because an open registration check is an enumeration oracle.
   Only a message proves it. So this gate does two separate things and keeps
   them separate:
     · asks the customer to CONFIRM the number is on WhatsApp — a claim, which
       catches the honest mistakes (a desk line, a landline, an old SIM) at the
       one moment the customer can still fix them; and
     · offers a one-tap deep link that opens WhatsApp with a code already typed.
       When they press send, a message arrives from their real WhatsApp number
       and support marks it verified. That is the evidence.

   The claim never masquerades as the evidence. A booking proceeds on the claim
   alone — blocking on a round trip would cost more bookings than it saves bad
   numbers — but the support queue shows which of the two we actually have.

   Saved to BOTH the profile row and auth user_metadata, the same pair account
   settings writes, so the next booking never asks again. */
function PhoneGate({ onSaved }) {
  const { updateUserMetadata } = useAuth();
  const [phone, setPhone] = useState('');
  const [onWhatsApp, setOnWhatsApp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    // Deliberately loose: numbering plans differ across five markets and a
    // strict pattern rejects more real numbers than fake ones. Enough digits to
    // be dialable is the bar.
    const clean = phone.trim();
    if (!looksDialable(clean)) {
      setError('Please enter a number we can reach you on, including the country code.');
      return;
    }
    setBusy(true); setError('');
    // Issued before the save so the same code lands in the profile and in the
    // deep link — support matches the inbound message against it.
    const issued = onWhatsApp && whatsappReady ? verificationCode() : null;
    try {
      const patch = { phone: clean, whatsapp_opt_in: onWhatsApp };
      if (issued) { patch.whatsapp_code = issued; patch.whatsapp_code_sent_at = new Date().toISOString(); }
      await updateMyProfile(patch);
      await updateUserMetadata({ phone: clean, whatsapp_opt_in: onWhatsApp });
      if (issued) setCode(issued);
      onSaved(clean);
    } catch {
      setError('We couldn’t save that. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // Saved, and WhatsApp is configured: offer the round trip that proves it.
  if (code) {
    const href = confirmLink(code);
    return (
      <div className="jny-phone jny-phone--confirm">
        <h5>One tap to confirm WhatsApp</h5>
        <p>
          This opens WhatsApp with a message already written. Send it and we’ll know we can
          reach you there — it also means you never have to repeat your details on a call.
        </p>
        <a className="btn btn--primary jny-wa-btn" href={href} target="_blank" rel="noopener noreferrer">
          <WhatsAppGlyph /> Confirm on WhatsApp
        </a>
        <p className="jny-phone__code">Your code: <strong>{code}</strong></p>
        <button type="button" className="jny-linkbtn" onClick={() => setCode('')}>
          Skip for now — pick a time →
        </button>
      </div>
    );
  }

  return (
    <form className="jny-phone" onSubmit={submit}>
      <h5>What’s your WhatsApp number?</h5>
      <p>
        We do everything on WhatsApp — your callback, the bank’s reply, the paperwork.
        It’s faster than email and nothing gets lost in a spam folder.
      </p>
      <label>
        <span className="sr-only">WhatsApp number</span>
        <input
          type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="+65 9123 4567" autoComplete="tel" required
        />
      </label>
      {missingCountryCode(phone) && (
        <p className="jny-phone__hint">Start with your country code, e.g. +65 or +91 — WhatsApp needs it.</p>
      )}
      <label className="jny-phone__check">
        <input type="checkbox" checked={onWhatsApp} onChange={(e) => setOnWhatsApp(e.target.checked)} />
        <span>This number is on WhatsApp</span>
      </label>
      {!onWhatsApp && (
        <p className="jny-phone__hint">
          No problem — we’ll call you instead, and use email for anything in writing.
        </p>
      )}
      {error && <div className="jny-note jny-note--warn" role="alert">{error}</div>}
      <button className="btn btn--primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save & pick a time →'}
      </button>
    </form>
  );
}

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

/* "Set a password" for an account that was a guest a moment ago. */
function SetPassword({ onSave }) {
  const [pw, setPw] = useState('');
  const [state, setState] = useState(''); // '' | saving | error
  const save = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { setState('short'); return; }
    setState('saving');
    try {
      const { error } = await onSave(pw);
      setState(error ? 'error' : '');
    } catch { setState('error'); }
  };
  return (
    <form className="jny-done5__note" onSubmit={save} noValidate>
      <label className="jny-field">
        <span className="jny-label">Your account is ready — set a password to sign in with</span>
        <input type="password" autoComplete="new-password" minLength={6} placeholder="At least 6 characters"
          value={pw} onChange={(e) => { setPw(e.target.value); setState(''); }} />
      </label>
      {state === 'short' && <p className="jny-done5__note">Use 6 or more characters.</p>}
      {state === 'error' && <p className="jny-done5__note">We couldn&apos;t save that just now. Please try again.</p>}
      <button type="submit" className="btn btn--primary" disabled={state === 'saving'}>
        {state === 'saving' ? 'Saving…' : 'Set password'}
      </button>
    </form>
  );
}

export default function JourneyModal({ open, onClose, context, onRequireAuth, resume }) {
  const { user, guest, startGuestSession, upgradeGuest, updateUserMetadata, updatePassword, passwordPending } = useAuth();
  const [view, setView] = useState('options'); // 'options' | 'email' | 'call' | 'expert'
  const [expert, setExpert] = useState(null);
  const [expertPage, setExpertPage] = useState(0); // Option 3 shows experts four at a time
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
  const [prices, setPrices] = useState({}); // { call: 'US$19' | '₹1,599', expert: … }
  const [paidTier, setPaidTier] = useState(null); // 'call' | 'expert' once paid (or demo)
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [checkoutUrl, setCheckoutUrl] = useState(''); // set once Stripe hands us a URL
  const [stalled, setStalled] = useState(false);      // redirect didn't take
  // Back from Checkout and still checking the payment (and, for a call, locking
  // the held time in). Shown on its own, so the screen they paid from doesn't
  // flash up before the confirmation replaces it.
  const [verifying, setVerifying] = useState(false);
  const bookedRef = useRef(null); // Stripe session already logged to the dashboard
  const paidSessionRef = useRef(null); // the Stripe session this confirmation was paid with
  const leadRef = useRef(null);   // the lead row for THIS engagement, stamped once a slot is booked
  const unlockRef = useRef(null); // benchmark stage already marked for this tier
  const cardRef = useRef(null);
  const confirm = useConfirm();

  const segment = context?.segment && SEG_LABEL[context.segment] ? context.segment : 'individual';
  const savings = context?.annualSaving ?? null;
  // Cross-border savings are sized on one transfer, not a year (server/app.js).
  const perTransfer = context?.productId === 'cross_border';
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
  // The revealed bank's mark, looked up in the market it was benchmarked in.
  const bankLogo = useMemo(() => logoForBank(context?.country, bank), [context?.country, bank]);
  const withUnit = (v) => {
    const u = context?.unit;
    if (!u) return `${v}%`;
    return u.startsWith('%') ? `${v}${u}` : `${v} ${u}`;
  };
  const productLabel = context?.product || 'banking product';

  // Identity used to prefill Calendly + attribute the booking (set once signed in).
  /* The callback number. Seeded from the profile, filled by PhoneGate when it
     is missing. Held locally because auth user_metadata does not refresh in
     place after updateUser, and the lead is filed moments later. */
  const [phone, setPhone] = useState('');
  useEffect(() => { setPhone((user || guest)?.user_metadata?.phone || ''); }, [user, guest]);
  /* The email the booking is filed under. An account's own email when there is
     one; otherwise what the guest typed in "Your Contact Details". */
  const [contactEmail, setContactEmail] = useState('');
  useEffect(() => { if (user?.email) setContactEmail(user.email); }, [user]);
  /* Read call availability the moment the modal opens, while the options are
     still being read, so "Book a Call" opens straight onto the times. */
  useEffect(() => {
    if (open) prefetchCallSlots().catch(() => { /* SlotPicker retries and reports */ });
  }, [open]);
  useEffect(() => {
    if (!open || !user || phone) return;
    // The profile row is the other place a number may already live.
    getMyProfile().then((p) => { if (p?.phone) setPhone(p.phone); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

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

  /* Booking never asks for an account: whoever is here — an account, or a
     guest session started on the spot — owns the booking. Signing in or up is
     only ever offered on the confirmation, after payment. Null only when
     "Anonymous sign-ins" is switched off in Supabase (or it can't be reached);
     callers then show NO_SESSION rather than a sign-in prompt. */
  const ensureSession = async () => (await authUser()) || startGuestSession();
  const NO_SESSION = 'We couldn’t start your booking just now. Please try again in a moment.';

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
        phone: phone || u.user_metadata?.phone || null,
        whatsapp_opt_in: u.user_metadata?.whatsapp_opt_in ?? null,
        booked: false, // flipped by record_booking() once a slot is actually picked
      });
      leadRef.current = row?.id || null;
    } catch { bookedRef.current = null; } // allow a retry if the insert failed
  };

  // A slot was picked in the Calendly widget. Calendly's message carries only
  // opaque URIs — scripts/sync-calendly.mjs turns the event URI into the actual
  // start time later. Best-effort: the booking is already made either way.
  /* The call tier now books the time BEFORE taking payment, so the modal has to
     remember that a slot exists — across a Stripe round trip, which throws away
     component state. Stashed on the way out, read back on the way in. */
  const [slotBooked, setSlotBooked] = useState(false);
  /* Our own scheduler (supabase/call_booking.sql). `ownScheduler` flips to false
     only when the migration has not been run — SlotPicker tells us — and the
     screen falls back to the Calendly embed, which is still what Option 3 uses. */
  const [ownScheduler, setOwnScheduler] = useState(true);
  const [slotIso, setSlotIso] = useState(null);      // the held (or booked) instant
  const [holdUntil, setHoldUntil] = useState(null);  // when an unconfirmed hold lapses
  const [slotErr, setSlotErr] = useState('');
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotsKey, setSlotsKey] = useState(0);       // bump to re-read availability
  // Back from the "you're confirmed" screen: pick a new time for a call that is
  // already paid for. The booking keeps its current time until a new one is
  // secured (reschedule_call_slot), so backing out of this changes nothing.
  const [rescheduling, setRescheduling] = useState(false);
  // "Manage this" on a paid option: the booking is being read back (the options
  // stay on screen meanwhile; their buttons are held so it isn't clicked twice).
  const [restoringBooking, setRestoringBooking] = useState(false);
  /* How long the booked slot runs. Read from the availability the customer
     actually chose from, so an owner who changes booking_settings.slot_minutes
     gets calendar invites that match. 30 is the table's own default, and the
     fallback for a booking resumed from a stash after Stripe. */
  const slotMinsRef = useRef(30);

  /* The lead a hold is attached to. Option 2 takes the slot BEFORE payment, so
     the row has to exist before the money does — `booked` stays false until
     Stripe confirms, and the admin list already reads `booked`, not existence. */
  const ensureCallLead = async () => {
    if (leadRef.current) return leadRef.current;
    const u = await authUser();
    if (!u) return null;
    const row = await createLead({
      source: 'call',
      segment: context?.segment || 'individual',
      product: context?.productId || null,
      product_label: context?.product || null,
      benchmark_id: context?.benchmarkId || null,
      annual_saving: context?.annualSaving ?? null,
      full_name: u.user_metadata?.full_name || null,
      email: contactEmail || u.email || null,
      phone: phone || u.user_metadata?.phone || null,
      whatsapp_opt_in: u.user_metadata?.whatsapp_opt_in ?? null,
      booked: false,
    });
    leadRef.current = row?.id || null;
    return leadRef.current;
  };

  /* Option 2 and Option 3 each have their own booking. The slot state above is
     one set, so it is swapped when the customer moves between them: without
     this, a call booked under Option 2 showed up on Option 3 as "Your time is
     booked", and an Option 3 hold was filed against the call's lead. Holds are
     left alone on the way out — they lapse on their own if never paid for. */
  const bookingOwnerRef = useRef(null);  // 'call' | 'expert' — whose booking is in state
  const savedBookingsRef = useRef({});   // the other tier's, parked
  const switchBookingTier = (id) => {
    if (id !== 'call' && id !== 'expert') return;
    const owner = bookingOwnerRef.current;
    if (owner === id) return;
    if (owner) savedBookingsRef.current[owner] = { slotIso, holdUntil, slotBooked, leadId: leadRef.current };
    const next = savedBookingsRef.current[id] || {};
    // A hold that ran out while they were on the other option is gone.
    const live = next.slotBooked || (next.holdUntil && new Date(next.holdUntil).getTime() > Date.now());
    setSlotIso(live ? next.slotIso : null);
    setHoldUntil(live && !next.slotBooked ? next.holdUntil : null);
    setSlotBooked(!!next.slotBooked);
    setSlotErr('');
    leadRef.current = next.leadId || null;
    bookingOwnerRef.current = id;
  };

  /* Which tier the scheduler on screen is booking, and whether it is paid for.
     A higher tier covers a lower one (an expert purchase includes the call), so
     ownership is a rank comparison, not an equality. */
  const bookingTier = view === 'expert' ? 'expert' : 'call';
  const ownsTier = (tier) => !!paidTier && TIER_RANK[paidTier] >= TIER_RANK[tier];
  // The expert view is showing its confirmation, not the picker.
  const expertConfirmed = view === 'expert' && (verifying || paidTier === 'expert');

  /* Take a time.
     Already paid (or nothing to pay) → the hold is confirmed on the spot, since
     there is no checkout to come back from. Otherwise it stays a hold and the
     pay button below turns it into a booking. */
  const pickSlot = async (iso, mins = 0) => {
    setSlotErr('');
    if (mins) slotMinsRef.current = mins;
    // Busy from the first moment, so the hold box shows "Holding your time…"
    // while a guest session starts too, not only once the hold is requested.
    setSlotBusy(true);
    if (!(await ensureSession())) { setSlotBusy(false); setSlotErr(NO_SESSION); return null; }
    try {
      const leadId = await ensureCallLead();
      if (!leadId) throw new Error('We could not start your booking. Please try again.');
      const expires = await holdCallSlot(leadId, iso);
      setSlotIso(iso);
      setHoldUntil(expires || null);
      // A fresh hold is a hold, whatever a previous screen left behind.
      setSlotBooked(false);
      // Confirm on the spot only when THIS screen's tier is already paid for —
      // then there is no checkout to come back from. Keyed to the tier being
      // booked, not to "some tier was paid for at some point": the latter booked
      // an unpaid call outright for anyone who had bought a different tier.
      let booked = false;
      if (ownsTier(bookingTier) || !paymentsEnabled) {
        await confirmCallSlot(leadId);
        setSlotBooked(true);
        setHoldUntil(null);
        booked = true;
      }
      // Handed back, not just flagged: the caller needs the slot ITSELF. Reading
      // it from state instead gets the value from before this call — setState is
      // asynchronous, and the redirect to Stripe happens in the same tick.
      return { iso, holdUntil: booked ? null : (expires || null), booked };
    } catch (e) {
      // Someone else took it while this grid was on screen: re-read availability
      // so they are not staring at a time that no longer exists.
      if (e instanceof SlotTakenError) setSlotsKey((n) => n + 1);
      setSlotErr(e.message || 'We could not hold that time. Please pick another.');
      return null;
    } finally {
      setSlotBusy(false);
    }
  };

  /* Give a held time back. Never touches a confirmed booking — release_call_slot
     refuses that outright, and cancelling something paid for is a support action
     with a refund attached, not a button on this screen. */
  const dropHold = async ({ quiet = false } = {}) => {
    const leadId = leadRef.current;
    setSlotIso(null); setHoldUntil(null);
    if (!quiet) setSlotErr('');
    setSlotsKey((n) => n + 1);
    if (leadId) { try { await releaseCallSlot(leadId); } catch { /* it lapses on its own */ } }
  };

  /* Move a paid call to the time just picked. Nothing to pay and no hold: the
     booking moves in one step, or stays exactly where it was. */
  const moveCall = async (iso, mins = 0) => {
    setSlotErr('');
    if (mins) slotMinsRef.current = mins;
    const leadId = leadRef.current;
    if (!leadId) {
      setSlotErr('We couldn’t find your booking to move it. Message us on WhatsApp and we’ll change it for you.');
      return;
    }
    setSlotBusy(true);
    try {
      await rescheduleCallSlot(leadId, iso);
      setSlotIso(iso);
      setRescheduling(false);
      setSlotsKey((n) => n + 1);
    } catch (e) {
      if (e instanceof SlotTakenError) setSlotsKey((n) => n + 1);
      setSlotErr(e.message || 'We could not change your time. Please try again.');
    } finally {
      setSlotBusy(false);
    }
  };

  const onHoldExpired = () => {
    setSlotIso(null); setHoldUntil(null);
    setSlotsKey((n) => n + 1);
    setSlotErr('Your hold ran out, so the time went back into the pool. Pick another — it only takes a moment.');
  };

  const addToCalendar = () => {
    if (!slotIso) return;
    const start = new Date(slotIso);
    const end = new Date(start.getTime() + (slotMinsRef.current || 30) * 60000);
    downloadInvite(callInvite({
      uid: `call-${leadRef.current || context?.benchmarkId || start.getTime()}@feeoptima`,
      start, end,
      summary: 'FeeOptima specialist call',
      description: context?.product
        ? `Negotiation coaching on your ${context.product}. Your specialist will call the number you gave us.`
        : 'Negotiation coaching with a FeeOptima specialist.',
      location: 'Phone / WhatsApp',
    }), 'feeoptima-call.ics');
  };

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
      ? `\n• That's roughly ${fmtSaving(savings)} ${perTransfer ? 'on every transfer' : 'a year'} I could ${isYield ? 'earn' : 'save'}.`
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

  // The enlarged certificate. Escape closes it before the modal itself, so the
  // first press never dismisses the thing the user paid for.
  const [certOpen, setCertOpen] = useState(false);
  const [signupState, setSignupState] = useState(''); // '' | sending | sent | taken | error
  // The confirmation's FAQ shows its first question until the drop-down opens it.
  const [faqOpen, setFaqOpen] = useState(false);
  /* Option 3 has no time slot: the expert contacts the customer. Choosing an
     expert (with contact details in) starts a 10-minute window to pay — kept
     in the browser only; nothing is reserved server-side. */
  const [expertContact, setExpertContact] = useState({ phone: '', valid: false });
  const [expertHoldUntil, setExpertHoldUntil] = useState(null);
  // The paid-for expert's WhatsApp number. Only ever comes from the server's
  // check of the Stripe session (see /api/checkout/session) — never stored.
  const [expertWhatsApp, setExpertWhatsApp] = useState('');
  const [expertNote, setExpertNote] = useState('');
  useEffect(() => {
    if (view !== 'expert' || !expert || !expertContact.valid || expertHoldUntil || paidTier === 'expert') return;
    setExpertHoldUntil(new Date(Date.now() + 10 * 60e3).toISOString());
    setExpertNote('');
  }, [view, expert, expertContact.valid, expertHoldUntil, paidTier]);
  useEffect(() => {
    if (!certOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setCertOpen(false); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [certOpen]);

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
    setCheckoutUrl(''); setStalled(false); setVerifying(false);
    if (resume?.afterAuth) {
      // Returned from signing in/up — restore the exact screen they were on.
      // `unlockedTier` lets the dashboard reopen an already-purchased tier in
      // read/manage mode (bank + scheduler shown, no re-payment prompt).
      setView(resume.view || 'options');
      switchBookingTier(resume.view);
      setExpert(resume.expert || null);
      setSentTo(null); setPaidTier(resume.unlockedTier || null); setPayError('');
      setSignupState('');
      // Signed in from a confirmation screen: put the confirmation back.
      const c = resume.confirmed;
      if (c?.tier) {
        bookingOwnerRef.current = c.tier === 'call' || c.tier === 'expert' ? c.tier : null;
        savedBookingsRef.current = {};
        leadRef.current = c.leadId || null;
        setPaidTier(c.tier);
        setSlotIso(c.slotIso || null);
        setSlotBooked(!!c.slotBooked);
        setHoldUntil(null);
        setRescheduling(false);
        if (c.phone) setPhone(c.phone);
        if (c.contactEmail) setContactEmail(c.contactEmail);
        paidSessionRef.current = c.sessionId || null;
        if (c.tier === 'expert' && c.sessionId) {
          getAccessToken().then((tok) => getCheckoutSession(c.sessionId, tok))
            .then((s) => { if (s?.paid) setExpertWhatsApp(s.expertWhatsApp || ''); })
            .catch(() => { /* the confirmation reads fine without it */ });
        }
      }
      return;
    }
    setRescheduling(false);
    if (resume) {
      setView(VIEW_FOR_TIER[resume.tier] || resume.tier || 'options');
      bookingOwnerRef.current = resume.tier === 'call' || resume.tier === 'expert' ? resume.tier : null;
      savedBookingsRef.current = {};
      setExpert(resume.expert || null);
      setSentTo(resume.expert?.id || null);
      if (resume.contactEmail) setContactEmail(resume.contactEmail);
      setSlotBooked(!!resume.slotBooked);
      setSlotIso(resume.slotIso || null);
      // Only while it is still in the future — a lapsed hold must not come back
      // as a ticking clock.
      setHoldUntil(resume.holdUntil && new Date(resume.holdUntil).getTime() > Date.now() ? resume.holdUntil : null);
      if (resume.canceled) { setPaidTier(null); setPayError('Payment canceled — you can try again below.'); return; }
      setPayError(''); setPaidTier(resume.tier); // optimistic; verify below
      if (resume.sessionId) {
        setVerifying(true);
        // Signed in? Say so. Without the token the server treats every payer as
        // anonymous and mails them a sign-in link they don't need.
        getAccessToken().then((tok) => getCheckoutSession(resume.sessionId, tok)).then((s) => {
          if (!s?.paid) {
            setPaidTier(null);
            setPayError('We couldn’t confirm your payment. Please try again.');
            return;
          }
          // Payment confirmed — log the paid engagement + unlock the source benchmark.
          paidSessionRef.current = resume.sessionId;
          applyUnlock(resume.tier);
          if (resume.tier === 'expert') setExpertWhatsApp(s.expertWhatsApp || '');
          if (resume.tier === 'call' || resume.tier === 'expert') {
            // The hold becomes a booking HERE and nowhere else: this is the first
            // point at which the payment is known to have gone through. Until it
            // runs the slot is still only held, and still lapses on its own.
            // Returned so the verifying state lasts until the slot is locked in.
            return recordPaidBooking(resume.tier, resume.sessionId, resume.leadId, resume.expert)
              .then(() => {
                const leadId = resume.leadId || leadRef.current;
                if (!resume.slotIso || !leadId) return undefined;
                return confirmCallSlot(leadId).then(() => {
                  setSlotBooked(true);
                  setHoldUntil(null);
                });
              })
              .catch(() => {
                // They have paid and the hold will lapse, so this cannot fail
                // quietly. The row still carries the held slot, so support can
                // see it — but the customer needs to know to act.
                setSlotErr('Your payment went through, but we could not lock the time in. Pick your time again below — you will not be charged twice.');
              });
          }
          return undefined;
        }).finally(() => setVerifying(false));
      }
    } else {
      setView('options'); setExpert(null); setSentTo(null); setPaidTier(null); setPayError(''); setSlotBooked(false);
      setExpertWhatsApp('');
      setSlotIso(null); setHoldUntil(null); setSlotErr('');
      bookingOwnerRef.current = null; savedBookingsRef.current = {}; leadRef.current = null;
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
    Promise.all(['call', 'expert'].map((t) => getTierPrice(t, ccy, segment).then((p) => [t, p])))
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
  }, [open, context?.currency, segment]);

  // Localized label for a tier; until it loads (or if the lookup fails), the
  // USD list price — which is also what checkout charges when FX is down.
  const priceOf = (tier) =>
    prices[tier] || LIST_PRICE[tier]?.[segment === 'sme' ? 'sme' : 'individual'] || '';

  // Upcoming blocked windows, keyed by advisor (admin → Advisor availability).
  const blackoutsFor = (id) => blackouts.filter((b) => b.advisor_id === id).slice(0, 6);

  // Real advisors if any are approved; otherwise the labelled demo set.
  const experts = advisors.length
    ? advisors.map((a) => ({
        id: a.id, real: true, name: a.full_name,
        role: a.specialization || 'Banking specialist',
        company: a.company || '', years: a.years_experience || null,
        blurb: a.description || '',
        photo: expertAvatar({ photo_url: a.photo_url, specialization: a.specialization, id: a.id }),
        calendly_url: a.calendly_url || '', accent: '#2f7bd8',
        away: blackoutsFor(a.id),
      }))
    : SAMPLE_EXPERTS.map((x) => ({ ...x, photo: expertAvatar({ role: x.role, id: x.id }) }));

  /* Four experts on screen at a time — the screen has to fit without scrolling,
     so more than four are paged with arrows rather than stacked. */
  const EXPERTS_PER_PAGE = 4;
  // The "Recommended" badge: the most experienced expert on the list.
  const recommendedExpertId = experts.reduce((best, x) => ((x.years || 0) > (best?.years || 0) ? x : best), null)?.id || null;
  const expertPages = Math.max(1, Math.ceil(experts.length / EXPERTS_PER_PAGE));
  const expertIdx = expert ? experts.findIndex((x) => x.id === expert.id) : -1;
  // Open on the chosen expert's page (e.g. restored after Stripe), and never
  // sit past the last page if the directory shrinks.
  useEffect(() => {
    if (expertIdx >= 0) setExpertPage(Math.floor(expertIdx / EXPERTS_PER_PAGE));
  }, [expertIdx]);
  const page = Math.min(expertPage, expertPages - 1);
  const pagedExperts = experts.slice(page * EXPERTS_PER_PAGE, (page + 1) * EXPERTS_PER_PAGE);

  // Selecting a real advisor while signed in creates an assigned lead (their inbox).
  const connectExpert = async (adv, phoneOverride = '') => {
    setExpert(adv);
    if (!adv?.real || sentTo === adv.id) return;
    const u = await ensureSession();
    if (!u) return;
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
        full_name: u.user_metadata?.full_name || null,
        email: contactEmail || u.email || null,
        phone: phoneOverride || phone || u.user_metadata?.phone || null,
        whatsapp_opt_in: u.user_metadata?.whatsapp_opt_in ?? null,
        // Picking a specialist isn't a booking — record_booking() flips this
        // once they actually choose a slot, which is what the admin list reads.
        booked: false,
      });
      leadRef.current = row?.id || null;
      setSentTo(adv.id);
    } catch { /* non-blocking */ }
  };

  // No sign-in to pick an option: contact details are collected in the
  // booking itself, and the account is offered once the booking is confirmed.
  const chooseTier = async (id, owned = false) => {
    switchBookingTier(id);
    // Already paid for: go straight to the finished confirmation, with no
    // loading message or empty panel in between. The expert confirmation needs
    // nothing from the lookup (the purchase alone confirms it), so it opens at
    // once and the row fills in the name and number. A call needs its time, so
    // that waits for the lookup, but never on one that hangs: after a moment
    // the screen switches anyway.
    if (owned && id === 'expert') restoreBooking(id);
    else if (owned && id === 'call') {
      await Promise.race([restoreBooking(id), new Promise((r) => setTimeout(r, 1500))]);
      setRestoringBooking(false); // a hung lookup must not leave the buttons dead
    }
    setView(id);
  };

  /* Read a paid option's booking back from the database, so "Manage this" opens
     the confirmation. The browser only remembers THAT it was paid for; the time
     and expert live on the lead row (readable by its owner, guests included).
     Matched to this benchmark when it was saved, else to the product. */
  const restoreBooking = async (tier) => {
    if (!isSupabaseConfigured) return;
    setRestoringBooking(true);
    try {
      let q = supabase.from('leads')
        .select('id, slot_start, phone, email, advisor_id, advisor_name, booked')
        .eq('source', tier)
        .order('created_at', { ascending: false })
        .limit(1);
      // A call counts once its time is booked; an expert has no time to book.
      if (tier === 'call') q = q.eq('booked', true);
      q = context?.benchmarkId ? q.eq('benchmark_id', context.benchmarkId) : q.eq('product', context?.productId || '');
      const { data } = await q;
      const row = data?.[0];
      if (!row) return; // paid, nothing booked yet: the form is right after all
      leadRef.current = row.id;
      if (row.phone) setPhone(row.phone);
      if (row.email && !user) setContactEmail(row.email);
      if (tier === 'call') {
        setSlotIso(row.slot_start || null);
        setSlotBooked(true);
        setHoldUntil(null);
      } else {
        setExpert(experts.find((x) => x.id === row.advisor_id)
          || { id: row.advisor_id || 'expert', name: row.advisor_name || 'Your expert' });
      }
    } catch { /* fall back to the form */ } finally {
      setRestoringBooking(false);
    }
  };

  // Redirect to Stripe Checkout for a paid tier; stash context to resume on return.
  const pay = async (tier, adv, over = {}) => {
    // A guest session is enough to pay: the booking rows are owned by it, and
    // the Stripe receipt goes to the email from the contact details. No session
    // means nowhere to record the booking — never take the money then.
    if (!(await ensureSession())) { setPayError(NO_SESSION); return; }
    setBusy(true); setPayError('');
    const snap = adv ? {
      id: adv.id, real: !!adv.real, name: adv.name, role: adv.role, company: adv.company,
      years: adv.years, blurb: adv.blurb, photo: adv.photo, accent: adv.accent, calendly_url: adv.calendly_url,
    } : null;
    try {
      // holdUntil travels too: without it a customer who comes back from
      // Checkout without paying sees "your time is held" and no countdown —
      // the hold is still live in the database, but nothing on screen says for
      // how long.
      stashJourney({
        tier, expert: snap, context, leadId: leadRef.current,
        // `over` is what a just-taken hold passes in; state is a render behind it.
        slotBooked: over.slotBooked ?? slotBooked,
        slotIso: over.slotIso ?? slotIso,
        holdUntil: over.holdUntil ?? holdUntil,
        contactEmail: contactEmail || null,
      });
      const { url } = await createCheckout({
        tier,
        currency: context?.currency || 'SGD', // bill in the currency we showed
        advisorId: adv?.real ? adv.id : undefined,
        product: context?.product || null,
        segment: context?.segment || 'individual',
        email: contactEmail || user?.email || undefined,
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

  /* Option 3's "Confirm & Pay": save the number, file the lead against the
     chosen expert, then go to checkout — all on a guest session if need be. */
  const payExpert = async () => {
    if (!expert || !expertContact.valid) return;
    setBusy(true);
    const u = await ensureSession();
    if (u) {
      if (expertContact.phone !== phone) {
        try {
          await saveWhatsAppNumber({ phone: expertContact.phone, onWhatsApp: true, updateUserMetadata });
          setPhone(expertContact.phone);
        } catch { /* the lead below still carries it */ }
      }
      await connectExpert(expert, expertContact.phone);
    }
    setBusy(false);
    pay('expert', expert?.real ? expert : null);
  };

  const onExpertHoldExpired = () => {
    setExpertHoldUntil(null); setExpert(null);
    setExpertNote('Your hold ran out. Select your expert again — it only takes a moment.');
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

  const back = () => {
    // Give a held slot back immediately. It would lapse on its own, but leaving
    // it parked for the full window blocks a customer who is ready to book now.
    if (slotIso && !slotBooked) dropHold({ quiet: true });
    setRescheduling(false);
    // A paid expert stays chosen, so "Manage this" reopens the same confirmation.
    if (!ownsTier('expert')) setExpert(null);
    setView('options'); setPayError(''); setExpertHoldUntil(null);
  };

  // Where to go once a slot is booked. Close first, then navigate: the modal's
  // history effect strips its marker param from whatever the location is at
  // cleanup, so the hash we set here survives.
  const finishTo = (dest) => {
    onClose();
    window.location.hash = dest === 'dashboard' ? '#dashboard' : '#top';
  };

  // The efficiency-score links: close this, then open that assessment on the
  // page (EfficiencyChecks reads the hash). Closing first, as finishTo does, so
  // the modal's history cleanup can't undo the navigation.
  const openCheck = (id) => (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab: let the link go
    e.preventDefault();
    onClose();
    window.location.hash = `#health-check/${id}`;
  };

  /* Signing in or up from a confirmation screen lands back ON it — including
     through a Google or email-confirm reload, which throws all of this state
     away. So the intent carries what the confirmation shows. The expert's
     WhatsApp number is not stored: it only ever comes from the server's check
     of the Stripe session, so the session id travels instead and the number
     is asked for again on the way back. */
  const confirmedIntent = () => ({
    kind: 'journey', context, view, expert,
    confirmed: paidTier ? {
      tier: paidTier, slotIso, slotBooked, leadId: leadRef.current,
      phone: phone || null, contactEmail: contactEmail || null,
      sessionId: paidSessionRef.current,
    } : null,
  });

  /* "Sign Up" on the confirmation: the guest session becomes an account with
     the email they booked with — same user id, so the booking comes along.
     Supabase emails a link to confirm it; opening it signs them in and brings
     them back here. No guest session (Option 1 is free, so nothing started
     one) or no email to use → the regular sign-up form instead. */
  const signUp = async () => {
    if (!guest || !contactEmail) {
      onRequireAuth?.(confirmedIntent(), { mode: 'signup', email: contactEmail || '' });
      return;
    }
    setSignupState('sending');
    storeAfterAuth(confirmedIntent());
    try {
      const { error } = await upgradeGuest(contactEmail.trim());
      if (error) {
        clearAfterAuth();
        setSignupState(/already|registered|exists/i.test(error.message || '') ? 'taken' : 'error');
      } else setSignupState('sent');
    } catch { clearAfterAuth(); setSignupState('error'); }
  };

  // Screen #5 for Option 3 — the expert is paid for.
  const renderExpertConfirmed = () => renderConfirmed({
    title: 'You’re confirmed',
    body: (
      <p className="jny-done5__line jny-done5__line--lead">
        <strong>{expert?.name || 'Your expert'}</strong>
        {/* Their WhatsApp number in the brackets — only there when the server
            verified the payment and the expert is a real advisor (the sample
            experts have no number). */}
        {expertWhatsApp ? (
          <> ({chatLink(expertWhatsApp)
            ? <a href={chatLink(expertWhatsApp)} target="_blank" rel="noopener noreferrer"><strong>{expertWhatsApp}</strong></a>
            : <strong>{expertWhatsApp}</strong>})</>
        ) : null}
        {' '}will contact you{phone ? <> on <strong>{phone}</strong></> : null} and plan with you to lead the negotiation with your bank.
      </p>
    ),
    calendar: false,
    faq: EXPERT_FAQ,
  });

  /* "Potential Annual Savings": label, coin mark, amount. The options screen's
     card, and the same thing (smaller) in the Option 2 and 3 headers. */
  const renderSavings = () => (
    <>
      <p className="jny-top__label">
        {perTransfer ? 'Potential Savings' : isYield ? 'Potential Extra Earnings' : 'Potential Annual Savings'}
      </p>
      <div className="jny-top__amtrow">
        {/* Savings mark: a stack of coins with an up arrow. */}
        <svg className="jny-top__coins" viewBox="0 0 56 56" width="64" height="64" aria-hidden="true">
          <rect width="56" height="56" rx="14" fill="#e3f4ec" />
          <g fill="#3f8a6c">
            <ellipse cx="24" cy="15" rx="11" ry="4.2" />
            <path d="M13 18.2 a11 4.2 0 0 0 22 0 v5.6 a11 4.2 0 0 1 -22 0 Z" />
            <path d="M13 27 a11 4.2 0 0 0 22 0 v5.6 a11 4.2 0 0 1 -22 0 Z" />
            <path d="M13 35.8 a11 4.2 0 0 0 22 0 v5.6 a11 4.2 0 0 1 -22 0 Z" />
          </g>
          <circle cx="38" cy="38" r="9.5" fill="#2f6b55" stroke="#e3f4ec" strokeWidth="2" />
          <path d="M38 43 V33.4 M34 37.2 L38 33.2 L42 37.2" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="jny-top__amt">
          {savings ? fmtSaving(savings) : '—'}
          {savings ? <span> /{perTransfer ? 'transfer' : 'year'}</span> : null}
        </p>
      </div>
    </>
  );

  // Screen #5 for Option 2 — the call is paid for and booked.
  const renderCallConfirmed = () => {
    const tz = viewerZone();
    const when = slotIso ? new Date(slotIso) : null;
    const dateText = when ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(when) : '';
    const timeText = when ? new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(when) : '';
    return renderConfirmed({
      title: 'You’re confirmed for a telecall with a specialist',
      body: (
        <>
          {when ? (
            <p className="jny-done5__when">
              <span>{dateText}</span>
              <strong>{timeText} {zoneShort(tz)}</strong>
            </p>
          ) : (
            <p className="jny-done5__line">Your call is confirmed for the time you picked.</p>
          )}
          <p className="jny-done5__line">
            We&apos;ll WhatsApp you{phone ? <> on <strong>{phone}</strong></> : null} before the call.
          </p>
        </>
      ),
      calendar: !!when,
      faq: CALL_FAQ,
    });
  };

  // The shared confirmation layout: heading, details, actions, certificate,
  // FAQ, and the "what next" circles.
  const renderConfirmed = ({ title, body, calendar, faq }) => {
    const sme = segment === 'sme';
    return (
      <div className="jny-done5">
        <h4 className="jny-done5__title">{title}</h4>
        {body}

        <div className="jny-done5__actions">
          {!user && (
            <button type="button" className="jny-done5__act" onClick={signUp} disabled={signupState === 'sending' || signupState === 'sent'}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="8" r="4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M19 8v6M16 11h6" />
              </svg>
              {signupState === 'sending' ? 'Sending…' : signupState === 'sent' ? 'Check your inbox' : 'Sign Up'}
            </button>
          )}
          {(user || !calendar) && (
            <button type="button" className="jny-done5__act" onClick={() => finishTo('dashboard')}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
              {calendar ? 'My Dashboard' : 'Go to Dashboard'}
            </button>
          )}
          {calendar && (
            <button type="button" className="jny-done5__act" onClick={addToCalendar}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
              </svg>
              Add to my Calendar
            </button>
          )}
        </div>
        {signupState === 'sent' && (
          <p className="jny-done5__note">We&apos;ve sent a link to <strong>{contactEmail}</strong> — open it to finish creating your account. Your booking is already saved to it.</p>
        )}
        {signupState === 'taken' && (
          <p className="jny-done5__note">
            That email already has an account.{' '}
            <button type="button" className="jny-linkbtn" onClick={() => onRequireAuth?.(confirmedIntent(), { mode: 'signin', email: contactEmail || '' })}>Sign in</button>
          </p>
        )}
        {signupState === 'error' && (
          <p className="jny-done5__note">We couldn&apos;t start your sign-up just now. Please try again.</p>
        )}
        {/* Signed up from here: the email is confirmed, the password is not set
            yet (Supabase only takes one after the email is verified). */}
        {user && passwordPending && <SetPassword onSave={updatePassword} />}

        {/* The shareable certificate: title over a thumbnail that opens it full
            size on the left; "Share" over the network buttons on the right. */}
        <div className="jny-done5__cert">
          <div className="jny-done5__certcol">
            <p className="jny-done5__certtitle">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="9" r="6" /><path d="M8.5 14 7 22l5-3 5 3-1.5-8" />
              </svg>
              Your certificate
            </p>
            <button type="button" className="jny-done5__thumb" onClick={() => setCertOpen(true)} aria-label="Open your certificate">
              <span className="jny-done5__thumb-inner" aria-hidden="true">
                <Certificate segment={segment} product={context?.product} savingPct={savingPct} company={company} holderName={holderName} />
              </span>
            </button>
          </div>
          <div className="jny-done5__certbody">
            <CertificateShare segment={segment} caption={CERT_SHARE_TEXT} buildFile={buildCertFile} onShare={shareCertificate} shared={shared} shareHeading />
          </div>
        </div>

        <div className={`jny-done5__faq${faqOpen ? ' is-open' : ''}`}>
          <h5>FAQ</h5>
          {(faqOpen ? faq : faq.slice(0, 1)).map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
          {/* The drop-down sits on the box's bottom edge: more questions below. */}
          {faq.length > 1 && (
            <button
              type="button" className="jny-done5__faqmore"
              aria-expanded={faqOpen}
              aria-label={faqOpen ? 'Show fewer questions' : `Show ${faq.length - 1} more questions`}
              onClick={() => setFaqOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <path d="M6 9.5 L12 15.5 L18 9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="jny-done5__next">
          <p className="jny-done5__nexttitle">
            {sme ? 'Find your financial efficiency score — benchmarked against your peers' : 'Have you done your financial health checkup?'}
          </p>
          <div className="jny-done5__circles">
            {sme ? (
              <>
                <div className="jny-done5__circle-wrap jny-done5__circle-wrap--btn">
                  <span className="jny-done5__circle jny-done5__circle--logo" aria-hidden="true">
                    <img className="jny-done5__circle-img" src="/images/treasury-efficiency.png" alt="" width="44" height="44" />
                  </span>
                  {/* Only the button opens the assessment; the icon is decoration. */}
                  <a className="jny-done5__circle-btn" href="#health-check/treasury_efficiency" onClick={openCheck('treasury_efficiency')}>Treasury<br />Efficiency</a>
                </div>
                <div className="jny-done5__circle-wrap jny-done5__circle-wrap--btn">
                  <span className="jny-done5__circle jny-done5__circle--logo" aria-hidden="true">
                    <img className="jny-done5__circle-img" src="/images/operational-efficiency.png" alt="" width="44" height="44" />
                  </span>
                  {/* Only the button opens the assessment; the icon is decoration. */}
                  <a className="jny-done5__circle-btn" href="#health-check/operational_efficiency" onClick={openCheck('operational_efficiency')}>Operational<br />Efficiency</a>
                </div>
              </>
            ) : (
              <div className="jny-done5__circle-wrap jny-done5__circle-wrap--btn">
                <span className="jny-done5__circle jny-done5__circle--badge" aria-hidden="true">
                  <img className="jny-done5__circle-img" src="/images/personal-wealth.png" alt="" width="76" height="76" />
                </span>
                {/* Only the button opens the scorecard; the icon is decoration. */}
                <a className="jny-done5__circle-btn" href="#health-check/personal_wealth" onClick={openCheck('personal_wealth')}>Personal Wealth<br />Scorecard</a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="jny" role="dialog" aria-modal="true" aria-label="Your next steps">
      <div className="jny__backdrop" onClick={requestClose} />
      <div className={`jny__panel${view === 'options' ? ' jny__panel--wide' : (view === 'call' || view === 'expert') ? ' jny__panel--call' : ''}`} ref={cardRef}>
        <div className="jny__head">
          {/* Back, top-left: out of a sub-view to the options, and off the
              options screen back to the result behind the modal. The × is a
              dismiss; this is the step-back the funnel's own bar implies. */}
          <button
            className="jny__backarrow"
            onClick={() => {
              if (view === 'options') { requestClose(); return; }
              // A booked call: back from the confirmation means "change my
              // time". Back from THAT leaves for the options, booking intact —
              // nothing moves until a new time is confirmed.
              if (view === 'call' && ownScheduler && ownsTier('call') && slotBooked && !rescheduling) {
                setSlotErr('');
                setRescheduling(true);
                return;
              }
              // The expert list is a step inside its own view: back leaves the
              // chosen expert before it leaves the view. Not once it is paid
              // for: then this is the confirmation, and back means the options.
              if (expert && !expertConfirmed) { setExpert(null); setPayError(''); return; }
              back();
            }}
            aria-label={view === 'options' ? 'Back to your result'
              : (view === 'call' && ownScheduler && ownsTier('call') && slotBooked)
                ? (rescheduling ? 'Back to options' : 'Change the date and time')
              : expert && !expertConfirmed ? 'Back to experts' : 'Back to options'}
          >
            {/* An SVG chevron, not a "‹": the glyph's own side bearings sit it
                off-centre in a round button, and every font moves it again. */}
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
              <path d="M15 5 L8 12 L15 19" stroke="currentColor" strokeWidth="2.4"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* Last step of the funnel, on every view in here: the reveal is paid
              for by the time this modal opens, so Unlock is behind us. It lives
              in the header because the progress is chrome, exactly as it is in
              the calculator's own band. */}
          {view === 'call' || view === 'expert' ? (
            /* Booking: choose (Book), pay for what is held (Confirm), then the
               negotiation itself. */
            <StepBar
              steps={CALL_STEPS}
              current={verifying ? 'negotiate' /* back from paying: no jump */
                : view === 'call'
                ? ((ownsTier('call') && slotBooked && !rescheduling) ? 'negotiate' : rescheduling ? 'book' : slotIso ? 'confirm' : 'book')
                : (paidTier === 'expert' ? 'negotiate' : expertHoldUntil ? 'confirm' : 'book')}
              className="steps--jny steps--onblue"
            />
          ) : (
            <StepBar current="negotiate" className="steps--jny steps--onblue" />
          )}
          {/* In the header row, mirroring the back button: same size, same
              centreline. Drawn, not "×" — the glyph sits high in its box. */}
          <button className="jny__close" onClick={requestClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* The reveal, as two cards side by side: the bank that was paid for,
            and what switching (or negotiating) is worth. Only on the options
            screen — each sub-view has its own heading. */}
        {view === 'options' && (
        <div className="jny-top">
          <div className="jny-top__card jny-top__card--bank">
            <p className="jny-top__label">Here’s the bank that beats your bank</p>
            {/* Icon on the left, spanning both lines; the logo + name on the
                first line and the note under them, starting below the logo. */}
            <div className="jny-top__body">
              {/* "Verified bank" mark: a bank building with a tick, on a mint disc. */}
              <svg className="jny-top__verified" viewBox="0 0 56 56" width="64" height="64" aria-hidden="true">
                <circle cx="28" cy="28" r="28" fill="#e3f4ec" />
                <g fill="#3f8a6c">
                  <path d="M28 12 L42 19.5 V22 H14 V19.5 Z" />
                  <rect x="16" y="24" width="4.5" height="12" rx="1" />
                  <rect x="23.5" y="24" width="4.5" height="12" rx="1" />
                  <rect x="31" y="24" width="4.5" height="12" rx="1" />
                  <rect x="14" y="38" width="24" height="3.5" rx="1" />
                </g>
                <circle cx="28" cy="17.6" r="1.8" fill="#e3f4ec" />
                <circle cx="39.5" cy="38.5" r="8.5" fill="#2f6b55" stroke="#e3f4ec" strokeWidth="2" />
                <path d="M35.6 38.6 L38.4 41.3 L43.4 35.9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="jny-top__id">
                {bankLogo
                  ? <img className="jny-top__logo" src={bankLogo.img} alt="" width="120" height="40" />
                  : <span className="jny-top__logo jny-top__logo--blank" aria-hidden="true">🏦</span>}
                <span className="jny-top__name">{bank || 'Your best-match bank'}</span>
              </div>
              <p className="jny-top__note">
                Based on the details you provided
              </p>
            </div>
          </div>
          <div className="jny-top__card jny-top__card--save">
            {ahead ? (
              <>
                <p className="jny-top__label">You’re already ahead of the market</p>
                <p className="jny-top__ahead">Beating <strong>{standing}</strong> 🎉</p>
                <button className="jny-top__cert" onClick={share}>{shared ? 'Shared ✓' : 'Share'}</button>
              </>
            ) : (
              <>
                {renderSavings()}
              </>
            )}
          </div>
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
            {/* Only when there is something to say that the headline above does
                not already say. "Three ways to get the savings of $X" is the
                instruction; repeating it here just pushed the options down. */}
            <h3 className="jny-choose">
              {paidTier && !TIERS.some((t) => TIER_RANK[t.id] > TIER_RANK[paidTier])
                ? 'You’re on our top tier — everything below is already yours.'
                : 'Choose how you want to save'}
            </h3>
            <div className="jny-plans">
              {TIERS.map((t) => {
                // Anything at or below what they've already paid for is theirs.
                // Re-offering it for sale (which is what this screen used to do
                // when reached via "Upgrade options") is just wrong.
                const owned = !!paidTier && TIER_RANK[t.id] <= TIER_RANK[paidTier];
                const current = paidTier === t.id;
                return (
                  <div
                    className={`jny-plan jny-plan--${t.accent}${t.popular ? ' jny-plan--popular' : ''}${owned ? ' jny-plan--owned' : ''}`}
                    key={t.id}
                  >
                    {(current || t.popular) && (
                      <span className="jny-plan__badge">{current ? 'Your plan' : 'Most popular'}</span>
                    )}
                    <div className="jny-plan__top">
                      <span className="jny-plan__price">
                        {owned ? (current ? '✓ Purchased' : '✓ Included') : ((t.id === 'email' ? t.price : priceOf(t.id)) || '…')}
                      </span>
                      <span className="jny-plan__tag">{t.tag}</span>
                    </div>
                    <div className="jny-plan__name">{t.name}</div>
                    <div className="jny-plan__title">{t.title}</div>
                    <ul className="jny-plan__points">
                      {t.points.map((pt) => <li key={pt}>{pt}</li>)}
                    </ul>
                    <button className="jny-plan__cta" disabled={restoringBooking} onClick={() => chooseTier(t.id, owned)}>
                      {owned ? (current ? 'Manage this' : 'Open') : t.cta}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* OPTION 1 (free) — the ready-to-send negotiation email. The bank is
            already unlocked (the ~$1 reveal was paid before this modal). */}
        {certOpen && (
          <div className="jny-certbox" role="dialog" aria-modal="true" aria-label="Your certificate">
            <div className="jny-certbox__backdrop" onClick={() => setCertOpen(false)} />
            <div className="jny-certbox__panel">
              <button className="jny-certbox__close" onClick={() => setCertOpen(false)} aria-label="Close certificate">×</button>
              {/* The scroller is INSIDE the panel: the close button sits on the
                  panel's corner, and a scroll container clips anything that
                  overhangs its own edges — which is what cropped the ×. */}
              <div className="jny-certbox__scroll">
              <Certificate
                segment={segment} product={context?.product} savingPct={savingPct}
                company={company} holderName={holderName}
                onShare={shareCertificate} shared={shared}
                caption={CERT_SHARE_TEXT} buildFile={buildCertFile}
              />
              </div>
            </div>
          </div>
        )}

        {view === 'email' && (
          <div className="jny-sub">
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
              <button className="btn btn--primary jny-btn-blue" onClick={copyEmail}>{copied ? 'Copied ✓' : 'Copy email'}</button>
              <a className="btn btn--red jny-btn-blue" href={mailtoHref}>Open in mail app →</a>
            </div>
            <p className="jny-note">You send this yourself from your own inbox — we never email your bank on your behalf.</p>
            {/* Option 1's equivalent of the confirmation screen's "Sign Up". */}
            {!user && (
              <p className="jny-note">
                Want this saved to a dashboard?{' '}
                <button type="button" className="jny-linkbtn" onClick={() => onRequireAuth?.(confirmedIntent(), { mode: 'signup' })}>Sign up</button>
                {' '}or{' '}
                <button type="button" className="jny-linkbtn" onClick={() => onRequireAuth?.(confirmedIntent(), { mode: 'signin' })}>sign in</button>
                {' '}— you&apos;ll come straight back here.
              </p>
            )}
          </div>
        )}

        {/* BOOK A CALL (US$19 individual · US$49 SME) */}
        {view === 'call' && (
          <div className="jny-sub">
            {!(verifying && slotIso) && !(ownsTier('call') && slotBooked && !rescheduling) && (
            <div className="jny-callhead">
              <div className="jny-callhead__text">
                <h4 className="jny-sub__title">Book your call with a specialist</h4>
                <p className="jny-sub__sub">A FeeOptima specialist reviews your numbers and coaches you.</p>
              </div>
              {savings ? (
                <div className="jny-callhead__save">{renderSavings()}</div>
              ) : null}
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
            {/* ORDER: time first, payment second. Nobody is asked to pay
                before they know a slot exists that suits them.

                With our own calendar that is now safe: picking a time takes a
                HOLD, not a booking, and the hold lapses on its own if the
                customer never comes back out of Checkout. The Calendly fallback
                below cannot do that — it books for good the moment they pick —
                which is exactly why this exists. */}
            {/* Back from Stripe with a held time: show the confirmation straight
                away while the payment is checked behind it. The check almost
                always passes; if it doesn't, this falls back to the form with
                the error, exactly as before. */}
            {verifying && slotIso ? (
              renderCallConfirmed()
            ) : ownScheduler ? (
              <>
                {ownsTier('call') && slotBooked && rescheduling ? (
                  /* Changing the time of a paid call. The same picker, but a
                     pick MOVES the booking — it never makes a second one. */
                  <>
                    <div className="jny-note jny-note--ok">
                      Your call is booked for <strong>{fullLabel(slotIso)} {zoneShort(viewerZone())}</strong>.
                      Pick a new time below — your current time stays booked until you confirm the new one.
                    </div>
                    {slotErr && <div className="jny-note jny-note--warn">{slotErr}</div>}
                    <SlotPicker
                      onPick={moveCall}
                      busy={slotBusy}
                      refreshKey={slotsKey}
                      phone={phone}
                      onPhoneSaved={setPhone}
                      email={contactEmail}
                      onEmailChange={user ? undefined : setContactEmail}
                      prepare={ensureSession}
                      country={context?.country}
                      cta="Move my call to this time →"
                      busyLabel="Moving your call…"
                    />
                    <p className="jny-note" style={{ textAlign: 'center' }}>
                      <button type="button" className="jny-linkbtn" disabled={slotBusy}
                        onClick={() => { setRescheduling(false); setSlotErr(''); }}>
                        Keep my current time
                      </button>
                    </p>
                  </>
                ) : ownsTier('call') && slotBooked ? (
                  /* Paid AND timed — the whole job is done. Showing the picker
                     again here is how you get two bookings for one call. */
                  renderCallConfirmed()
                ) : (
                  <>
                    {/* Two different post-payment states. Coming back from
                        Stripe with a held time is the normal path — telling that
                        customer to "pick a time below" is what made people book
                        twice. Only someone who paid WITHOUT a time still has to
                        choose one. */}
                    {ownsTier('call') && !slotIso && (
                      <div className="jny-note jny-note--ok">✓ Payment received — pick a time below.</div>
                    )}
                    {ownsTier('call') && slotIso && !slotBooked && !slotErr && (
                      <div className="jny-note jny-note--ok">✓ Payment received — confirming your time…</div>
                    )}
                    {/* The phone number is what the specialist actually calls, so
                        it is still taken before the slot is held — but inside the
                        booking card rather than as a wall in front of it. Being
                        asked for a number before you can see whether a workable
                        time even exists is what made this screen feel like a form. */}
                    {slotErr && <div className="jny-note jny-note--warn">{slotErr}</div>}

                    {/* One screen, not two: holding a time no longer swaps the
                        picker out for a summary card. The picker stays put,
                        locked to what was chosen, and the hold and the payment
                        appear under it. */}
                    {/* Choosing a time takes the hold straight away, so the
                        countdown is running before any payment is asked for.
                        The pay button appears under it; Stripe opens only
                        when that is pressed. */}
                    <SlotPicker
                      selected={slotIso}
                      onPick={pickSlot}
                      holdOnSelect
                      busy={slotBusy || busy}
                      disabled={!!slotIso}
                      held={!!slotIso}
                      refreshKey={slotsKey}
                      onUnavailable={() => setOwnScheduler(false)}
                      phone={phone}
                      onPhoneSaved={setPhone}
                      email={contactEmail}
                      onEmailChange={user ? undefined : setContactEmail}
                      prepare={ensureSession}
                      country={context?.country}
                      cta={ownsTier('call') || !paymentsEnabled ? 'Confirm this time →'
                        : 'Hold this time →'}
                      busyLabel="Holding your time…"
                    />

                    {/* On screen from the start, not swapped in once a time is
                        held: until then it sits idle with the clock at full
                        time, and the countdown starts only when the hold is
                        taken — i.e. once a time AND the contact details are in. */}
                    {(slotIso || (paymentsEnabled && !ownsTier('call'))) && (() => {
                      /* Three states, not two: "holding…" sits between idle and
                         held while the hold is being taken, so the box eases
                         through the change instead of snapping. The text is
                         keyed on the state so each swap fades in (CSS). */
                      const holdState = slotIso ? 'held' : slotBusy ? 'pending' : 'idle';
                      return (
                      <div className={`jny-hold jny-hold--${holdState}`} aria-live="polite">
                        <div className="jny-hold__row">
                          {/* The date and the zone are in the picker directly
                              above, so this says only what the picker cannot:
                              that the time is now held, and for how long. */}
                          <span className="jny-hold__when" key={holdState}>
                            <strong>{slotBooked ? '✓ Your time is booked' : slotIso ? '✓ Your time is held' : slotBusy ? 'Holding your time…' : 'Your time will be held here'}</strong>
                            {!slotIso ? (
                              <em><HoldTimer until={null} /> {slotBusy ? 'reserving it for you now.' : 'to confirm once you pick a time and add your details.'}</em>
                            ) : holdUntil && !slotBooked && (
                              <em><HoldTimer until={holdUntil} onExpire={onHoldExpired} /> left to confirm — nobody else can take it.</em>
                            )}
                          </span>
                          <button type="button" className="jny-hold__change" onClick={() => dropHold()} disabled={slotBusy || !slotIso}>
                            Change time
                          </button>
                        </div>
                        {slotBooked && !paymentsEnabled && (
                          <p className="jny-hold__note">✓ Booked. We&apos;ll message you on WhatsApp before the call.</p>
                        )}
                      </div>
                      );
                    })()}

                    {/* Payment, only once a time is actually held — and the
                        same panel when they come back from Checkout without
                        paying, since the hold is still live. */}
                    {!slotBooked && paymentsEnabled && !ownsTier('call') && (
                      /* Just the button and one line: the box above already says
                         the time is held and for how long, and the screen has to
                         fit without scrolling. Shown before a hold too — disabled
                         until there is one — so nothing pops in later. */
                      <div className="jny-confirmpay jny-confirmpay--call">
                        <button className="btn btn--primary jny-pay" disabled={busy || !slotIso || slotBusy} onClick={() => pay('call')}>
                          {busy ? 'Redirecting to secure checkout…'
                            : `Confirm & Pay${priceOf('call') ? ` ${priceOf('call')}` : ''}`}
                        </button>
                        <p className="jny-note">100% refund if not satisfied · Secure payment via Stripe</p>
                      </div>
                    )}
                    {slotIso && slotBooked && !paymentsEnabled && (
                      <button type="button" className="btn btn--ghost jny-ics" onClick={addToCalendar}>
                        ＋ Add to my calendar
                      </button>
                    )}
                  </>
                )}
              </>
            ) : /* ---- Fallback: supabase/call_booking.sql has not been run ---- */
            ownsTier('call') ? (
              <>
                {slotBooked ? renderCallConfirmed() : (
                  <>
                    <div className="jny-note jny-note--ok">✓ Payment received — pick a time below.</div>
                    <p className="jny-sub__sub">A FeeOptima specialist coaches you through the negotiation.</p>
                    {phone
                      ? <Scheduler url={CALENDLY_URL} prefill={bookingPrefill} onDone={finishTo} onScheduled={stampBooking} feedback={{ source: 'call', benchmarkId: context?.benchmarkId }} note="You and the specialist both receive the calendar invite from Calendly." />
                      : <PhoneGate onSaved={setPhone} />}
                  </>
                )}
              </>
            ) : !paymentsEnabled ? (
              /* Stripe not configured — booking is all there is to do. */
              <>
                <p className="jny-sub__sub">A FeeOptima specialist coaches you through the negotiation.</p>
                {phone
                  ? <Scheduler url={CALENDLY_URL} prefill={bookingPrefill} onDone={finishTo} onScheduled={stampBooking} feedback={{ source: 'call', benchmarkId: context?.benchmarkId }} note="You and the specialist both receive the calendar invite from Calendly." />
                  : <PhoneGate onSaved={setPhone} />}
              </>
            ) : (
              <>
                <p className="jny-sub__sub">
                  A FeeOptima specialist reviews your numbers and coaches you through the negotiation.
                </p>
                {!phone ? <PhoneGate onSaved={setPhone} /> : (
                  <>
                    <Scheduler
                      url={CALENDLY_URL} prefill={bookingPrefill}
                      onScheduled={(payload) => { stampBooking(payload); setSlotBooked(true); }}
                      note={slotBooked ? null : 'Pick a time that suits you — you pay on the next step.'}
                    />
                    {slotBooked && (
                      <div className="jny-confirmpay">
                        <p className="jny-confirmpay__lead">
                          <strong>Your time is held.</strong> Confirm it with payment and the
                          specialist is booked — you&apos;ll get the calendar invite and a WhatsApp message before the call.
                        </p>
                        <button className="btn btn--primary jny-pay" disabled={busy} onClick={() => pay('call')}>
                          {busy ? 'Redirecting to secure checkout…' : 'Confirm →'}
                        </button>
                        <p className="jny-note">
                          {priceOf('call') && <>{priceOf('call')} to pay · </>}
                          Full refund if not satisfied. Secure payment via Stripe
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* GET ME AN EXPERT (US$49 individual · US$99 SME) — one screen, as sketched: the experts as a
            grid of cards, date & time under them, then a rule and the pay
            button. Nothing opens or folds as you go; each part is simply
            enabled once the part above it is done. */}
        {view === 'expert' && (
          <div className="jny-sub">
            {/* Same on a Stripe return: the confirmation, checked behind it. */}
            {verifying || paidTier === 'expert' ? (
              renderExpertConfirmed()
            ) : (
              <>
                <div className="jny-callhead">
                  <div className="jny-callhead__text">
                    <h4 className="jny-sub__title">Book an Expert <span className="jny-callhead__aside">(ex-banker)</span></h4>
                    <p className="jny-sub__sub">An expert will lead the negotiation with your bank. They know how banks move.</p>
                  </div>
                  {savings ? (
                    <div className="jny-callhead__save">{renderSavings()}</div>
                  ) : null}
                </div>

                {payError && <div className="jny-note jny-note--warn">{payError}</div>}
                {stalled && checkoutUrl && (
                  <div className="jny-note jny-note--warn">
                    The redirect didn’t go through — this can happen if a browser extension
                    or a cached service worker blocks it.{' '}
                    <a href={checkoutUrl} rel="noopener noreferrer">Open secure checkout →</a>
                  </div>
                )}
                {expertNote && <div className="jny-note jny-note--warn">{expertNote}</div>}

                {/* The experts as rows: avatar, name, a select box. */}
                <div className="jny-xlist">
                  <div className="jny-xlist__head">
                    <h5 className="slots__title">Select one</h5>
                    {expertPages > 1 && (
                      <span className="jny-xlist__pager">
                        <button type="button" className="jny-expert-nav" aria-label="Previous experts"
                          disabled={page === 0} onClick={() => setExpertPage(page - 1)}>‹</button>
                        <span className="jny-expert-count">{page + 1} / {expertPages}</span>
                        <button type="button" className="jny-expert-nav" aria-label="More experts"
                          disabled={page >= expertPages - 1} onClick={() => setExpertPage(page + 1)}>›</button>
                      </span>
                    )}
                  </div>
                  {pagedExperts.map((x) => {
                    const picked = expert?.id === x.id;
                    const recommended = x.id === recommendedExpertId;
                    return (
                      <button
                        type="button" key={x.id}
                        className={`jny-xrow${picked ? ' is-on' : ''}`}
                        aria-pressed={picked}
                        disabled={!!expertHoldUntil && !picked}
                        onClick={() => { if (!picked) { setExpert(x); setExpertNote(''); } }}
                      >
                        {x.photo ? (
                          <img className="jny-xrow__avatar" src={x.photo} alt="" />
                        ) : (
                          <span className="jny-xrow__avatar" style={{ background: x.accent }} aria-hidden="true">
                            {x.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
                          </span>
                        )}
                        <span className="jny-xrow__body">
                          <span className="jny-xrow__name">
                            {x.name}
                            {recommended && <span className="jny-xrow__badge">Recommended</span>}
                          </span>
                          <span className="jny-xrow__role">
                            {[x.role, x.company, x.years ? `${x.years} yrs` : ''].filter(Boolean).join(' · ')}
                          </span>
                          <AwayNote windows={x.away} />
                        </span>
                        {/* Looks like a button; the whole row is the actual button. */}
                        <span className="jny-xrow__pick" aria-hidden="true">{picked ? '✓ Selected' : 'Select Me'}</span>
                      </button>
                    );
                  })}
                  {!advisors.length && (
                    <p className="jny-note">Example specialists — you’ll be matched with a verified advisor for your situation.</p>
                  )}
                </div>

                <ContactFields
                  phone={phone}
                  email={contactEmail}
                  onEmailChange={user ? undefined : setContactEmail}
                  country={context?.country}
                  disabled={busy}
                  onChange={setExpertContact}
                />
                {expert && !expertContact.valid && (
                  <p className="slots__hint slots__hint--center">Add your WhatsApp number and email to hold {expert.name}.</p>
                )}

                {/* Same as Option 2: the hold box and the pay button are there
                    from the start, idle until an expert is chosen and the
                    contact details are in — that is when the clock starts. */}
                <div className={`jny-hold${expertHoldUntil ? '' : ' jny-hold--idle'}`}>
                  <div className="jny-hold__row">
                    <span className="jny-hold__when">
                      <strong>{expertHoldUntil ? '✓ Your expert is held' : 'Your expert will be held here'}</strong>
                      {expertHoldUntil
                        ? <em><HoldTimer until={expertHoldUntil} onExpire={onExpertHoldExpired} /> left to confirm.</em>
                        : <em><HoldTimer until={null} /> to confirm once you pick an expert and add your details.</em>}
                    </span>
                    <button type="button" className="jny-hold__change" disabled={!expertHoldUntil}
                      onClick={() => { setExpertHoldUntil(null); setExpert(null); }}>
                      Change
                    </button>
                  </div>
                </div>

                <div className="jny-confirmpay jny-confirmpay--call">
                  <button className="btn btn--primary jny-pay" disabled={busy || !expertHoldUntil} onClick={payExpert}>
                    {busy ? 'Redirecting to secure checkout…'
                      : `Confirm & Pay${priceOf('expert') ? ` ${priceOf('expert')}` : ''}`}
                  </button>
                  <p className="jny-note">100% refund if not satisfied · Secure payment via Stripe</p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
