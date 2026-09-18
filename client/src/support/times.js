/* Two clocks, always.
 *
 * THE PROBLEM
 *   slot_start is a timestamptz — an absolute instant. The queue used to format
 *   it with no timeZone option, which renders it in whatever zone the SUPPORT
 *   PERSON's browser is in. The instant is right, but the agent has no idea what
 *   time it is for the customer: a slot showing 12:30 in Singapore is 11:30 in
 *   Bangkok and 10:00 in Delhi. An agent reading their own clock aloud tells the
 *   customer the wrong time, and an agent in another region can dial at 6am.
 *
 * THE FIX
 *   Show the agent's own time (what they act on) AND the customer's market time
 *   (what they say out loud), each labelled with its zone. Never one bare time.
 *
 * WHAT WE ACTUALLY KNOW
 *   We do not store the customer's real timezone — Calendly collects it, but we
 *   only keep the event URI. So we derive it from the market they benchmarked
 *   in, which is right for almost everyone and clearly labelled as the market's
 *   time rather than a claim about where the person is sitting.
 */

/* Market → IANA zone. Indonesia spans three zones (WIB/WITA/WIT); Jakarta (WIB)
   covers the large majority and is what we show — noted so nobody mistakes it
   for a verified per-customer zone. */
export const MARKET_TZ = {
  SG: 'Asia/Singapore',
  IN: 'Asia/Kolkata',
  MY: 'Asia/Kuala_Lumpur',
  ID: 'Asia/Jakarta',
  TH: 'Asia/Bangkok',
};

export const MARKET_TZ_NOTE = {
  ID: 'Indonesia spans three time zones — this is Jakarta (WIB).',
};

export const agentZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
};

const fmt = (tz) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
  timeZone: tz, timeZoneName: 'short',
});

/** An absolute instant rendered in one named zone, or null if unparseable. */
export function inZone(iso, tz) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try { return fmt(tz).format(d); }
  catch { return fmt('UTC').format(d); }   // bad/unknown zone must not blank the row
}

/** Date only — for "requested on", where the hour is noise. */
export function dateInZone(iso, tz) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: tz,
    }).format(d);
  } catch { return null; }
}

/** Both clocks for one instant: the agent's, and the customer's market. */
export function bothZones(iso, marketCode) {
  if (!iso) return null;
  const tz = MARKET_TZ[String(marketCode || '').toUpperCase()] || null;
  const mine = inZone(iso, agentZone());
  if (!mine) return null;
  const theirs = tz ? inZone(iso, tz) : null;
  return {
    mine,
    theirs,
    // Suppress the duplicate when the agent and the customer share a zone.
    sameZone: !!theirs && theirs === mine,
    marketNote: MARKET_TZ_NOTE[String(marketCode || '').toUpperCase()] || null,
  };
}

/**
 * Is this booking overdue — the slot has passed and nobody has recorded an
 * outcome? `new` is the only stage that means "not dealt with"; anything else
 * is a decision someone made.
 */
export function isOverdue(lead, now = Date.now()) {
  if (!lead?.slot_start) return false;
  if (lead.stage && lead.stage !== 'new') return false;
  const t = new Date(lead.slot_start).getTime();
  return Number.isFinite(t) && t < now;
}

/** How late, in plain words, for the badge on an overdue row. */
export function overdueBy(lead, now = Date.now()) {
  if (!lead?.slot_start) return null;   // no slot is not "overdue since the epoch"
  const t = new Date(lead.slot_start).getTime();
  if (!Number.isFinite(t) || t >= now) return null;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 60) return `${mins} min overdue`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h overdue`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} overdue`;
}

/** A datetime-local input value (in the agent's own zone) → ISO, or null. */
export const localInputToIso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Now, formatted for a datetime-local input in the agent's own zone. */
export function nowForInput(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
