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
 *   Option 2 opts out (`holdOnSelect`): its countdown has to be running before
 *   the pay button appears. That stays one hold, not one per keystroke,
 *   because the caller disables the picker as soon as a time is held, and the
 *   list starts blank so the default time is never taken without being chosen.
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

/* The dial code a market's numbers start with. Only a first guess — the field
   is editable, and someone benchmarking Singapore may well carry a UK number. */
const DIAL_CODES = { SG: '+65', IN: '+91', MY: '+60', ID: '+62', TH: '+66' };

/* Split a stored number back into the two fields. "+65 9123 4567" was saved as
   one string (and still is), so this is what puts it back on screen. */
function splitPhone(phone, country) {
  const s = String(phone || '').trim().replace(/^00/, '+');
  const m = s.match(/^\+(\d{1,3})[\s-]*(.*)$/);
  if (m) return { code: `+${m[1]}`, rest: m[2].trim() };
  return { code: DIAL_CODES[String(country || '').toUpperCase()] || '+65', rest: s };
}

const fullNumber = (code, rest) => `${String(code || '').trim()} ${String(rest || '').trim()}`.trim();

/* ---- Month calendar -------------------------------------------------------
   Days come back as YYYY-MM-DD keys already resolved into the viewer's zone
   (see dayKey), so the grid is built from string maths — no second timezone
   conversion to disagree with the first. Only days the scheduler has open are
   clickable; the rest are visibly there but dead, which is what tells someone
   the gaps are real rather than a loading state. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const pad2 = (n) => String(n).padStart(2, '0');
const monthKey = (key) => (key || '').slice(0, 7);          // YYYY-MM
const addMonth = (ym, step) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m - 1) + step, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
};

/* What the closed control reads — the chosen day's own label ("Mon 21 Sept"). */
const dayLabelFor = (days, key) => (days || []).find((d) => d.key === key)?.label || '';

function MonthCalendar({ days, value, onPick, disabled }) {
  const open = useMemo(() => new Map((days || []).map((d) => [d.key, d])), [days]);
  const months = useMemo(() => [...new Set((days || []).map((d) => monthKey(d.key)))].sort(), [days]);
  const [ym, setYm] = useState(() => monthKey(value) || months[0] || '');
  // Follow the selection when it moves to another month (a restored booking).
  useEffect(() => { if (value) setYm(monthKey(value)); }, [value]);
  if (!ym) return null;

  const [y, m] = ym.split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;   // Monday-first
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  const canPrev = ym > months[0];
  const canNext = ym < months[months.length - 1];

  return (
    <div className="slots__cal">
      <div className="slots__cal-head">
        <button type="button" className="slots__cal-nav" onClick={() => setYm(addMonth(ym, -1))}
          disabled={disabled || !canPrev} aria-label="Previous month">‹</button>
        <span className="slots__cal-month">{MONTHS[m - 1]} {y}</span>
        <button type="button" className="slots__cal-nav" onClick={() => setYm(addMonth(ym, 1))}
          disabled={disabled || !canNext} aria-label="Next month">›</button>
      </div>
      <div className="slots__cal-grid" role="grid">
        {WEEKDAYS.map((w) => <span key={w} className="slots__cal-dow">{w}</span>)}
        {cells.map((d, i) => {
          if (!d) return <span key={`p${i}`} className="slots__cal-pad" />;
          const key = `${y}-${pad2(m)}-${pad2(d)}`;
          const has = open.has(key);
          const on = key === value;
          return (
            <button
              key={key}
              type="button"
              className={`slots__cal-day${on ? ' is-on' : ''}${has ? '' : ' is-off'}`}
              onClick={() => onPick(key)}
              disabled={disabled || !has}
              aria-pressed={on}
              aria-label={`${d} ${MONTHS[m - 1]} ${y}${has ? '' : ' — no times open'}`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SlotPicker({
  selected = null, onPick, busy = false, disabled = false, onUnavailable, refreshKey = 0,
  phone = '', onPhoneSaved,
  // The market being benchmarked, used only to guess the dial code shown first.
  country = 'SG',
  // A time is already held: the card stays on screen showing what was picked,
  // but its own button steps aside for the confirm-and-pay one below it.
  held = false,
  // What the button says. This IS the commitment on this screen now — it holds
  // the slot and goes on to payment in one press — so the caller words it.
  cta = 'Hold this time →',
  busyLabel = 'Holding your time…',
  // Fine print under the button, where the pay panel's used to be.
  footnote = null,
  // Take the hold the moment a time is chosen, rather than on the button. The
  // time list then starts blank, so nothing is held until someone picks one.
  // The button stays only as a retry, for when that hold could not be taken.
  holdOnSelect = false,
}) {
  const { updateUserMetadata } = useAuth();
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [day, setDay] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const calRef = useRef(null);
  const [choice, setChoice] = useState(selected || '');
  const tz = useMemo(() => viewerZone(), []);

  // The number the specialist actually rings. Only collected when we don't
  // already have one — the profile and auth metadata are both checked upstream.
  const needNumber = !phone;
  // Dial code and the rest of the number are two fields, so the country code
  // can't be left off (the commonest way a WhatsApp number arrives unusable)
  // and isn't buried in the same box as the digits.
  const [dialCode, setDialCode] = useState(() => splitPhone(phone, country).code);
  const [num, setNum] = useState(() => splitPhone(phone, country).rest);
  // The field is labelled "Phone or WhatsApp number", so the number is offered
  // for both — the opt-in checkbox that used to ask again was a step for a
  // question already answered.
  const onWhatsApp = true;
  const [code, setCode] = useState('');     // issued once the number is saved
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Close the calendar on a click outside it or on Escape — it behaves like the
  // native dropdown next to it, which closes the same two ways.
  useEffect(() => {
    if (!calOpen) return undefined;
    const onDown = (e) => { if (!calRef.current?.contains(e.target)) setCalOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setCalOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [calOpen]);

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
    setChoice((c) => (c && open.includes(c) ? c
      : selected && open.includes(selected) ? selected
      : holdOnSelect ? '' : open[0]));
  }, [today, selected, holdOnSelect]);

  const minutes = slotMinutes((slots || [])[0]);

  /* The number is checked (and saved when new) before any hold is taken. */
  async function ensureNumber() {
    // Save when the number is new to us, or when a stored one has been edited
    // here — this field is now always on screen, so it is always the truth.
    const full = fullNumber(dialCode, num);
    if (!looksDialable(full) || missingCountryCode(dialCode)) {
      setFormErr('Please enter a number we can reach you on, including the country code.');
      return false;
    }
    if (needNumber || full !== phone.trim()) {
      setSaving(true);
      try {
        const issued = await saveWhatsAppNumber({ phone: full, onWhatsApp, updateUserMetadata });
        if (issued) setCode(issued);
        onPhoneSaved?.(full);
      } catch {
        setFormErr('We couldn’t save that number. Please try again.');
        setSaving(false);
        return false;
      }
      setSaving(false);
    }
    return true;
  }

  async function commit(iso) {
    setFormErr('');
    if (!iso) { setFormErr('Pick a time first.'); return; }
    if (!(await ensureNumber())) return;
    // The duration travels with the time: the calendar invite is written from
    // it, and booking_settings.slot_minutes is the owner's to change.
    onPick?.(iso, minutes || 0);
  }

  function submit(e) {
    e.preventDefault();
    commit(choice);
  }

  function chooseTime(iso) {
    setChoice(iso);
    if (holdOnSelect && iso) commit(iso);
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
        <span className="slots__telrow">
          <input
            className="slots__dial"
            type="tel" value={dialCode} onChange={(e) => setDialCode(e.target.value)}
            placeholder="+65" autoComplete="tel-country-code" inputMode="tel"
            aria-label="Country code"
            disabled={disabled || busy || saving}
          />
          <input
            type="tel" value={num} onChange={(e) => setNum(e.target.value)}
            placeholder="9123 4567" autoComplete="tel-national" inputMode="tel"
            aria-label="Phone or WhatsApp number"
            disabled={disabled || busy || saving}
          />
        </span>
      </label>
      {missingCountryCode(dialCode) && (
        <p className="slots__hint">Start the code with +, e.g. +65 or +91 — WhatsApp needs it.</p>
      )}

      <div className="slots__row">
        <div className="slots__select" ref={calRef}>
          <span className="slots__label">Date</span>
          {/* A dropdown like the one beside it, except what drops down is a
              month rather than a list of days — the gaps in the diary are part
              of the answer, and a list of free days never shows them. */}
          <button
            type="button"
            className="slots__datebtn"
            onClick={() => setCalOpen((o) => !o)}
            disabled={disabled || busy || saving}
            aria-haspopup="dialog"
            aria-expanded={calOpen}
          >
            {dayLabelFor(days, day) || 'Pick a date'}
          </button>
          {calOpen && (
            <div className="slots__cal-pop" role="dialog" aria-label="Choose a date">
              <MonthCalendar
                days={days}
                value={day}
                onPick={(k) => { setDay(k); setCalOpen(false); }}
                disabled={disabled || busy || saving}
              />
            </div>
          )}
        </div>
        <label className="slots__select">
          <span className="slots__label">Time</span>
          <select value={choice} onChange={(e) => chooseTime(e.target.value)} disabled={disabled || busy || saving}>
            {holdOnSelect && !choice && <option value="" disabled>Select a time</option>}
            {(today?.slots || []).map((s) => (
              <option key={s.start} value={s.start}>
                {timeIn(s.start, tz)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="slots__zone">
        Times shown in <strong>{zoneLabel(tz)}</strong> — your device&apos;s clock.
      </p>


      {formErr && <div className="jny-note jny-note--warn" role="alert">{formErr}</div>}

      {!held && (!holdOnSelect || choice) && (
        <>
          <button className="btn btn--primary slots__go" disabled={busy || saving || !choice}>
            {saving ? 'Saving…' : busy ? busyLabel : cta}
          </button>
          {footnote && <p className="slots__foot">{footnote}</p>}
        </>
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
