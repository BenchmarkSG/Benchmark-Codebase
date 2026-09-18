/* The slot picker for Option 2.
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
import { listCallSlots, NOT_INSTALLED, viewerZone, zoneLabel, dayKey, dayLabel, timeIn } from '../lib/booking.js';

export default function SlotPicker({ selected = null, onPick, busy = false, disabled = false, onUnavailable, refreshKey = 0 }) {
  const [slots, setSlots] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(null);
  const [retry, setRetry] = useState(0);
  const tz = useMemo(() => viewerZone(), []);
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
      if (!map.has(k)) map.set(k, { key: k, label: dayLabel(s.start, tz), slots: [] });
      map.get(k).slots.push(s);
    }
    return [...map.values()];
  }, [slots, tz]);

  // Follow the data: first load picks the soonest day, and a slot taken from
  // under us must not leave an empty grid selected.
  useEffect(() => {
    if (!days.length) { setDay(null); return; }
    setDay((d) => (d && days.some((x) => x.key === d) ? d : days[0].key));
  }, [days]);

  // Keep the chosen time visible even if it is on another date.
  useEffect(() => {
    if (!selected || !days.length) return;
    const k = dayKey(selected, tz);
    if (days.some((d) => d.key === k)) setDay(k);
  }, [selected, days, tz]);

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

  const current = days.find((d) => d.key === day) || days[0];

  return (
    <div className="slots">
      <div className="slots__days" role="tablist" aria-label="Choose a date">
        {days.map((d) => (
          <button
            key={d.key} type="button" role="tab"
            aria-selected={d.key === current.key}
            className={`slots__day${d.key === current.key ? ' is-on' : ''}`}
            onClick={() => setDay(d.key)}
          >
            <span className="slots__day-label">{d.label}</span>
            <span className="slots__day-count">{d.slots.length} free</span>
          </button>
        ))}
      </div>

      <div className="slots__times" role="group" aria-label={`Times on ${current.label}`}>
        {current.slots.map((s) => {
          const on = selected === s.start;
          return (
            <button
              key={s.start} type="button"
              className={`slots__time${on ? ' is-on' : ''}`}
              disabled={disabled || busy}
              aria-pressed={on}
              onClick={() => onPick?.(s.start)}
            >
              {timeIn(s.start, tz)}
              {/* Only when it is genuinely the last one — "1 left" on every slot
                  is pressure, not information. */}
              {s.remaining === 1 && !on && <em className="slots__last">last one</em>}
            </button>
          );
        })}
      </div>

      <p className="slots__zone">
        Times shown in <strong>{zoneLabel(tz)}</strong> — your device&apos;s clock.
      </p>
    </div>
  );
}
