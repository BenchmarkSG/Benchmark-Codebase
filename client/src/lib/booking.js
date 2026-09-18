/* Option 2 (specialist call) self-scheduling — the client half.
 *
 * Everything here goes through the SECURITY DEFINER functions in
 * supabase/call_booking.sql. The tables themselves are admin-only: the browser
 * can ask what is bookable and take a slot, and cannot read working hours,
 * blackout reasons, or anybody else's booking.
 *
 * WHY THERE IS A "NOT INSTALLED" PATH
 *   The migration is run by hand in the Supabase SQL editor (see HANDOVER §7).
 *   Until it has been, these functions do not exist — and the booking screen
 *   must not break for that. Exactly one error means "not run yet", and only
 *   that one falls back to Calendly. Every other failure is surfaced, because
 *   silently swapping the scheduler when something is genuinely wrong is how a
 *   broken booking flow stays broken for a week.
 */
import { supabase, isSupabaseConfigured } from './supabase.js';

/** Returned instead of slots when the migration has not been run. */
export const NOT_INSTALLED = 'not_installed';

// 42883 = Postgres "function does not exist". PGRST202 = PostgREST could not
// find it in its schema cache, which is the same thing seen from one layer up.
const isMissingFunction = (error) => error?.code === '42883' || error?.code === 'PGRST202';

// The slot this user wanted went while they were looking at it. Raised by
// hold_call_slot() as P0001; worth its own flag so the UI can refresh the grid
// rather than just showing a message next to stale times.
export class SlotTakenError extends Error {
  constructor(message) { super(message || 'That time has just been taken. Please pick another.'); this.name = 'SlotTakenError'; }
}

const rpc = async (fn, args) => {
  if (!isSupabaseConfigured) throw new Error('Booking is not available right now.');
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.code === 'P0001') throw new SlotTakenError(error.message);
    throw new Error(error.message || 'Something went wrong with your booking.');
  }
  return data;
};

/**
 * Bookable slots, soonest first.
 * `{ slots }` on success, `{ slots: null, reason: NOT_INSTALLED }` when the
 * migration has not been run. Throws on a real failure.
 */
export async function listCallSlots(days = null) {
  if (!isSupabaseConfigured) return { slots: null, reason: NOT_INSTALLED };
  const { data, error } = await supabase.rpc('call_slots', { p_days: days });
  if (error) {
    if (isMissingFunction(error)) return { slots: null, reason: NOT_INSTALLED };
    throw new Error(error.message || 'Could not load available times.');
  }
  return {
    slots: (data || []).map((r) => ({
      start: r.slot_start,
      end: r.slot_end,
      remaining: Number(r.remaining) || 0,
    })),
  };
}

/** Take a slot for this lead. Returns the ISO instant the hold expires. */
export const holdCallSlot = (leadId, slotStartIso) =>
  rpc('hold_call_slot', { p_lead_id: leadId, p_slot_start: slotStartIso });

/** Payment landed — the hold becomes a booking. */
export const confirmCallSlot = (leadId) => rpc('confirm_call_slot', { p_lead_id: leadId });

/** Give an unconfirmed hold back. Never touches a booking already paid for. */
export const releaseCallSlot = (leadId) => rpc('release_call_slot', { p_lead_id: leadId });

/* ---- Display -------------------------------------------------------------- */

/** The viewer's own IANA zone, which is the clock they will actually act on. */
export const viewerZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
};

/** "Singapore Standard Time" — named, so nobody has to decode "+08". */
export function zoneLabel(tz = viewerZone()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'long' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}

/** Calendar day key in a given zone — the grouping the date strip is built on. */
/* new Date(null) is the epoch, not an error — so every formatter below refuses a
   missing instant outright rather than confidently printing 1 Jan 1970. */
const noInstant = (iso) => iso == null || iso === '' || Number.isNaN(new Date(iso).getTime());

export const dayKey = (iso, tz = viewerZone()) => {
  if (noInstant(iso)) return '';
  // en-CA gives YYYY-MM-DD, which sorts correctly as a string.
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso)); }
  catch { return String(iso).slice(0, 10); }
};

export const timeIn = (iso, tz = viewerZone()) => {
  if (noInstant(iso)) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(iso));
  } catch { return ''; }
};

export const dayLabel = (iso, tz = viewerZone()) => {
  if (noInstant(iso)) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
      .format(new Date(iso));
  } catch { return ''; }
};

/** Long form for the confirmation line: "Mon 21 Sep 2026, 09:00". */
export const fullLabel = (iso, tz = viewerZone()) => {
  if (noInstant(iso)) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  } catch { return ''; }
};
