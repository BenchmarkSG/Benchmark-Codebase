/* A calendar file for a confirmed call.
 *
 * Calendly's real remaining value was the calendar invite, and WhatsApp — now
 * the primary channel — cannot put anything in someone's calendar. An .ics is
 * what every calendar app on earth accepts, it needs no integration, no OAuth
 * and no server, and it works offline.
 *
 * RFC 5545 is picky in three ways that bite immediately: lines longer than 75
 * octets must be folded, commas/semicolons/backslashes in text must be escaped,
 * and the line break is CRLF, not LF. Google Calendar is forgiving; Outlook is
 * not.
 */

const pad = (n) => String(n).padStart(2, '0');

/** UTC basic format — 20260921T010000Z. Anchoring in UTC avoids shipping a
    VTIMEZONE block, which is where most hand-rolled .ics files go wrong. */
function stamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T`
       + `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const escape = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/* Fold at 75 octets, not 75 characters: a line of accented text can be well
   under 75 characters and still over the limit. Continuation lines start with
   one space. */
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {                       // by code point, never mid-character
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

/**
 * One VEVENT for a booked specialist call.
 * `uid` should be stable for the booking so a re-send updates rather than
 * duplicates the entry in the attendee's calendar.
 */
export function callInvite({ uid, start, end, summary, description, location, organizerEmail }) {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FeeOptima//Specialist call//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escape(uid)}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(summary)}`,
    description ? `DESCRIPTION:${escape(description)}` : null,
    location ? `LOCATION:${escape(location)}` : null,
    organizerEmail ? `ORGANIZER:mailto:${escape(organizerEmail)}` : null,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Your FeeOptima specialist call starts in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Hand the file to the browser. Returns false if the download was blocked. */
export function downloadInvite(text, filename = 'feeoptima-call.ics') {
  try {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick: revoking synchronously can cancel the download
    // in Safari before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch { return false; }
}
