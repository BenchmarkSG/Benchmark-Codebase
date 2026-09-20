/* The slot picker for Option 2 — one card: pick a time, leave a number.
 *
 * WHY TWO DROPDOWNS AND NOT A GRID
 *   The grid this replaced printed every open half-hour as its own tile: five
 *   dates across the top, fifteen times below, seventy-five tiles for a week.
 *   That is a wall of near-identical boxes to read before you can answer a
 *   question you already know the answer to ("when am I free?"). Selects
 *   collapse it to one row, open the platform's own picker on a phone, and are
 *   navigable by keyboard and screen reader without us building any of it.
 *
 *   Date and time are separate controls because they are separate decisions:
 *   a day is chosen from a diary, an hour from what is left on it. One combined
 *   list makes you scroll past every hour of Monday to reach Tuesday.
 *
 * WHY A BUTTON AND NOT AN INSTANT HOLD
 *   Choosing is not committing. A select fires `change` on every arrow key, so
 *   keyboarding down the list on the old "pick = hold" contract would take and
 *   drop a hold per keystroke. The hold is taken when the button is pressed,
 *   once, deliberately.
 *
 * Deliberately shows times to ANYONE, signed in or not. Being asked to sign in
 * or pay before you can even see whether a workable time exists is what makes a
 * booking flow feel like a trap — and availability is not private. Taking a
 * slot is what needs an account (see hold_call_slot), and that is the moment the
 * sign-in prompt appears.
 *
 * Every time on screen is in the VIEWER'S OWN zone, named in full underneath.
 * A bare "09:00" on a cross-border product is a booking made for the wrong hour.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import './SlotPicker.css';
import { useAuth } from '../context/AuthContext.jsx';
import {
  listCallSlots, NOT_INSTALLED, viewerZone, zoneLabel,
  dayKey, dayLabel, relativeDayLabel, timeIn, slotMinutes,
} from '../lib/booking.js';
import { looksDialable, missingCountryCode, saveWhatsAppNumber, confirmLink } from '../lib/whatsapp.js';

const CalendarGlyph = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
    <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
const PhoneGlyph = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.2 2 2 0 0 1 5 3z" />
  </svg>
);
const VideoGlyph = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
  </svg>
);

/* "Mon 21 Sept", or "Tomorrow, 20 Sept" when there is a word for the day. The
   weekday is dropped in that case: "Tomorrow" already says which day it is, and
   the control is half a card wide. */
const dateOption = (d) => (d.rel === d.label ? d.label : `${d.rel}, ${d.label.replace(/^\S+\s/, '')}`);

export default function SlotPicker({
  selected = null, onPick, busy = false, disabled = false, onUnavailable, refreshKey = 0,
  phone = '', onPhoneSaved,
  // A time is already held: the card stays on screen showing what was picked,
  // but its own button steps aside for the confirm-and-pay one below it.
  held = false,
}) {
  const { updateUserMetadata } = useAuth();
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [day, setDay] = useState('');
  const [choice, setChoice] = useState(selected || '');
  const tz = useMemo(() => viewerZone(), []);

  // The number the specialist actually rings. Only collected when we don't
  // already have one — the profile and auth metadata are both checked upstream.
  const needNumber = !phone;
  const [num, setNum] = useState(phone || '');
  const [onWhatsApp, setOnWhatsApp] = useState(true);
  const [code, setCode] = useState('');     // issued once the number is saved
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  // onUnavailable swaps the whole screen back to Calendly. Held in a ref so a
  // parent that re-creates the callback each render can't re-trigger the load.
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    listCallSlots()
      .then(({ slots: rows, reason }) => {
        if (!alive) return;
        if (reason === NOT_INSTALLED) { unavailableRef.current?.(); return; }
        setSlots(rows);
      })
      .catch((e) => { if (alive) setError(e.message || 'Could not load available times.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey, retry]);

  // Group into calendar days in the viewer's zone. A slot at 23:30 in Singapore
  // is the following morning in London, and it has to sit under that date.
  const days = useMemo(() => {
    const map = new Map();
    for (const s of slots || []) {
      const k = dayKey(s.start, tz);
      if (!map.has(k)) map.set(k, { key: k, label: dayLabel(s.start, tz), rel: relativeDayLabel(s.start, tz), slots: [] });
      map.get(k).slots.push(s);
    }
    return [...map.values()];
  }, [slots, tz]);

  // Default to the soonest open day, and never leave a day selected that has
  // emptied while this card was on screen.
  useEffect(() => {
    if (!days.length) { setDay(''); return; }
    const wanted = selected ? dayKey(selected, tz) : '';
    setDay((d) => {
      if (d && days.some((x) => x.key === d)) return d;
      if (wanted && days.some((x) => x.key === wanted)) return wanted;
      return days[0].key;
    });
  }, [days, selected, tz]);

  // The time follows the day: changing the date lands on that day's first open
  // slot rather than keeping a time that belongs to a different date.
  const today = days.find((d) => d.key === day) || null;
  useEffect(() => {
    const open = (today?.slots || []).map((s) => s.start);
    if (!open.length) { setChoice(''); return; }
    setChoice((c) => (c && open.includes(c) ? c : (selected && open.includes(selected) ? selected : open[0])));
  }, [today, selected]);

  const minutes = slotMinutes((slots || [])[0]);

  async function submit(e) {
    e.preventDefault();
    setFormErr('');
    if (!choice) { setFormErr('Pick a time first.'); return; }
    // Save when the number is new to us, or when a stored one has been edited
    // here — this field is now always on screen, so it is always the truth.
    if (!looksDialable(num)) {
      setFormErr('Please enter a number we can reach you on, including the country code.');
      return;
    }
    if (needNumber || num.trim() !== phone.trim()) {
      setSaving(true);
      try {
        const issued = await saveWhatsAppNumber({ phone: num.trim(), onWhatsApp, updateUserMetadata });
        if (issued) setCode(issued);
        onPhoneSaved?.(num.trim());
      } catch {
        setFormErr('We couldn’t save that number. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    // The duration travels with the time: the calendar invite is written from
    // it, and booking_settings.slot_minutes is the owner's to change.
    onPick?.(choice, minutes || 0);
  }

  if (loading) return <div className="slots slots--msg">Loading available times…</div>;

  if (error) {
    return (
      <div className="slots slots--msg slots--err">
        <p>{error}</p>
        <button type="button" className="btn btn--ghost" onClick={() => setRetry((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }

  if (!days.length) {
    return (
      <div className="slots slots--msg">
        <strong>No times are open at the moment.</strong>
        <p>Our specialists are fully booked for the next few weeks. Message us on WhatsApp and we&apos;ll find you a slot.</p>
      </div>
    );
  }

  // Saved the number and WhatsApp is configured: offer the round trip that
  // turns a claim into evidence. It sits after the booking, never before it —
  // nothing here is blocked on the customer completing it.
  const waLink = code ? confirmLink(code) : null;

  return (
    <form className="slots" onSubmit={submit}>
      <div className="slots__head">
        <span className="slots__icon" aria-hidden="true"><CalendarGlyph /></span>
        <div className="slots__headings">
          <h5 className="slots__title">Choose Date &amp; Time</h5>
          <p className="slots__sub">{minutes ? `${minutes}-minute` : ''} specialist call</p>
        </div>
      </div>

      {/* The number the specialist rings, in the same kind of control as the
          date and the time — it is one of the three things this card collects,
          not a footnote under them. Prefilled when we already hold one, so an
          existing number is confirmed rather than re-typed. */}
      <label className="slots__field slots__field--phone">
        <span>
          <PhoneGlyph /><VideoGlyph />
          Phone or WhatsApp number
        </span>
        <input
          type="tel" value={num} onChange={(e) => setNum(e.target.value)}
          placeholder="+65 9123 4567" autoComplete="tel" inputMode="tel"
          disabled={disabled || busy || saving}
        />
      </label>
      {missingCountryCode(num) && (
        <p className="slots__hint">Start with your country code, e.g. +65 or +91 — WhatsApp needs it.</p>
      )}

      <div className="slots__row">
        <label className="slots__select">
          <span className="slots__label">Date</span>
          <select value={day} onChange={(e) => setDay(e.target.value)} disabled={disabled || busy || saving}>
            {days.map((d) => (
              <option key={d.key} value={d.key}>{dateOption(d)}</option>
            ))}
          </select>
        </label>
        <label className="slots__select">
          <span className="slots__label">Time</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} disabled={disabled || busy || saving}>
            {(today?.slots || []).map((s) => (
              <option key={s.start} value={s.start}>
                {timeIn(s.start, tz)}
                {/* Only when it is genuinely the last one — "1 left" on every
                    row is pressure, not information. */}
                {s.remaining === 1 ? ' — last one' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="slots__zone">
        Times shown in <strong>{zoneLabel(tz)}</strong> — your device&apos;s clock.
      </p>

      <label className="slots__check">
        <input
          type="checkbox" checked={onWhatsApp} onChange={(e) => setOnWhatsApp(e.target.checked)}
          disabled={disabled || busy || saving}
        />
        <span>This number is on WhatsApp</span>
      </label>
      {!onWhatsApp && (
        <p className="slots__hint">No problem — we’ll call you instead, and use email for anything in writing.</p>
      )}

      {formErr && <div className="jny-note jny-note--warn" role="alert">{formErr}</div>}

      {!held && (
        <button className="btn btn--primary slots__go" disabled={busy || saving || !choice}>
          {saving ? 'Saving…' : busy ? 'Holding your time…' : 'Hold this time →'}
        </button>
      )}

      {waLink && (
        <p className="slots__wa">
          <a href={waLink} target="_blank" rel="noopener noreferrer">Confirm on WhatsApp</a>{' '}
          — one tap, code <strong>{code}</strong>. Optional, and it means you never repeat your details on the call.
        </p>
      )}
    </form>
  );
}
