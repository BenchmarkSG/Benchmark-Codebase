/* The slot picker for Options 2 and 3 — one card: pick a date, pick a time,
 * leave your contact details.
 *
 * Dates and times are chips, not dropdowns: every open slot is visible at a
 * glance and one tap picks it. The time chips only show the chosen day's slots,
 * so the grid stays a handful of tiles rather than a week's worth.
 *
 * With `holdOnSelect` (both options use it), tapping a time takes the hold
 * straight away, so the countdown is running before the pay button appears.
 * The hold needs a reachable number, so when the number isn't filled in yet the
 * time is remembered and held as soon as the number field is left complete.
 * The picker is disabled once a time is held, so it's one hold, not one per tap.
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

/* The dial code a market's numbers start with. Only a first guess — the field
   is editable, and someone benchmarking Singapore may well carry a UK number. */
const DIAL_CODES = { SG: '+65', IN: '+91', MY: '+60', ID: '+62', TH: '+66' };

/* Split a stored number back into the two fields. "+65 9123 4567" was saved as
   one string (and still is), so this is what puts it back on screen. */
export function splitPhone(phone, country) {
  const s = String(phone || '').trim().replace(/^00/, '+');
  const m = s.match(/^\+(\d{1,3})[\s-]*(.*)$/);
  if (m) return { code: `+${m[1]}`, rest: m[2].trim() };
  return { code: DIAL_CODES[String(country || '').toUpperCase()] || '+65', rest: s };
}

/* "IST", "SGT"-style short zone name for the time heading. Intl only knows a
   few abbreviations per locale, so fall back to the GMT offset ("GMT+8"). */
const ZONE_ABBR = { 'Asia/Kolkata': 'IST', 'Asia/Calcutta': 'IST', 'Asia/Singapore': 'SGT', 'Asia/Kuala_Lumpur': 'MYT', 'Asia/Jakarta': 'WIB', 'Asia/Bangkok': 'ICT' };
export function zoneShort(tz) {
  if (ZONE_ABBR[tz]) return ZONE_ABBR[tz];
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const fullNumber = (code, rest) => `${String(code || '').trim()} ${String(rest || '').trim()}`.trim();

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
  // The email under "Your Contact Details". Read-only (an account's own email)
  // unless the caller passes onEmailChange — a guest types it in.
  email = '',
  onEmailChange,
  // Called before the number is saved, so there is a session (a guest one if
  // need be) to save it on. Resolves falsy when none can be had.
  prepare,
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
  // Only the next five open days, starting tomorrow — never today.
  const days = useMemo(() => {
    const todayKey = dayKey(new Date().toISOString(), tz);
    const map = new Map();
    for (const s of slots || []) {
      const k = dayKey(s.start, tz);
      if (k <= todayKey) continue;
      if (!map.has(k)) map.set(k, { key: k, label: dayLabel(s.start, tz), rel: relativeDayLabel(s.start, tz), slots: [] });
      map.get(k).slots.push(s);
    }
    return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(0, 5);
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

  const emailOk = !onEmailChange || EMAIL_RE.test(String(email || '').trim());

  /* The number is checked (and saved when new) before any hold is taken. */
  async function ensureNumber() {
    if (!emailOk) {
      setFormErr('Please enter your email — your booking confirmation goes there.');
      return false;
    }
    // Save when the number is new to us, or when a stored one has been edited
    // here — this field is now always on screen, so it is always the truth.
    const full = fullNumber(dialCode, num);
    if (!looksDialable(full) || missingCountryCode(dialCode)) {
      setFormErr('Please enter a number we can reach you on, including the country code.');
      return false;
    }
    if (needNumber || full !== phone.trim()) {
      setSaving(true);
      // No session to save it on: carry on to the pick, which asks to sign in.
      if (prepare && !(await prepare())) { setSaving(false); return true; }
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
    setFormErr('');
    // Hold now if the number is ready; otherwise numberDone() holds it once
    // the number is filled in.
    if (holdOnSelect && iso && emailOk && looksDialable(fullNumber(dialCode, num)) && !missingCountryCode(dialCode)) commit(iso);
  }

  // Leaving a contact field with a time already chosen takes the hold.
  function numberDone() {
    if (holdOnSelect && choice && !held && !busy && !saving && emailOk
      && looksDialable(fullNumber(dialCode, num)) && !missingCountryCode(dialCode)) commit(choice);
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

  const off = disabled || busy || saving;
  const numberOk = emailOk && looksDialable(fullNumber(dialCode, num)) && !missingCountryCode(dialCode);

  return (
    <form className={`slots${held ? ' slots--held' : ''}`} onSubmit={submit}>
      <div className="slots__sec">
        <h5 className="slots__title">Choose Date</h5>
        <div className="slots__chips slots__chips--dates" role="group" aria-label="Date">
          {days.map((d) => {
            // "Mon 21 Sep" → "Mon" over "21 Sep"; "Tomorrow" replaces the weekday.
            const [wk, ...rest] = d.label.split(' ');
            const on = d.key === day;
            return (
              <button
                key={d.key} type="button"
                className={`slots__chip slots__chip--date${on ? ' is-on' : ''}`}
                onClick={() => { setDay(d.key); setFormErr(''); }}
                disabled={off}
                aria-pressed={on}
              >
                <span>{d.rel === 'Tomorrow' ? d.rel : wk}</span>
                <strong>{rest.join(' ')}</strong>
              </button>
            );
          })}
        </div>
      </div>

      <div className="slots__sec">
        <h5 className="slots__title" title={`Times shown in ${zoneLabel(tz)}`}>
          Choose Time ({zoneShort(tz)}) <span>– Available slots</span>
        </h5>
        <div className="slots__chips slots__chips--times" role="group" aria-label="Time">
          {(today?.slots || []).map((s) => {
            const on = s.start === choice;
            return (
              <button
                key={s.start} type="button"
                className={`slots__chip${on ? ' is-on' : ''}`}
                onClick={() => chooseTime(s.start)}
                disabled={off}
                aria-pressed={on}
              >
                {timeIn(s.start, tz)}
              </button>
            );
          })}
        </div>
      </div>

      {/* The number the specialist rings, and the email the invite goes to.
          Prefilled when we already hold them. */}
      <div className="slots__sec">
        <h5 className="slots__title">Your Contact Details</h5>
        <div className="slots__contact">
          <label className="slots__field">
            <span>WhatsApp number <i aria-hidden="true">*</i></span>
            <span className="slots__telrow">
              <input
                className="slots__dial"
                type="tel" value={dialCode} onChange={(e) => setDialCode(e.target.value)}
                onBlur={numberDone}
                placeholder="+65" autoComplete="tel-country-code" inputMode="tel"
                aria-label="Country code" required
                disabled={off}
              />
              <input
                type="tel" value={num} onChange={(e) => setNum(e.target.value)}
                onBlur={numberDone}
                placeholder="9123 4567" autoComplete="tel-national" inputMode="tel"
                aria-label="WhatsApp number" required
                disabled={off}
              />
            </span>
          </label>
          <label className="slots__field">
            <span>Email <i aria-hidden="true">*</i></span>
            <input
              type="email" value={email}
              readOnly={!onEmailChange}
              onChange={onEmailChange ? (e) => onEmailChange(e.target.value) : undefined}
              onBlur={numberDone}
              placeholder="you@example.com" autoComplete="email" inputMode="email"
              aria-label="Email" required
              disabled={!!onEmailChange && off}
            />
          </label>
        </div>
        {missingCountryCode(dialCode) && (
          <p className="slots__hint">Start the code with +, e.g. +65 or +91 — WhatsApp needs it.</p>
        )}
      </div>

      {formErr && <div className="jny-note jny-note--warn" role="alert">{formErr}</div>}

      {/* With holdOnSelect the hold happens on its own once a time and a number
          are both in; until the number is, say so rather than show a button. */}
      {!held && choice && holdOnSelect && !numberOk && !formErr && (
        <p className="slots__hint slots__hint--center">Add your WhatsApp number and email to hold this time.</p>
      )}
      {/* Without holdOnSelect this is the commit; with it, a retry for when the
          automatic hold didn't go through. */}
      {!held && choice && (!holdOnSelect || numberOk) && (
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
