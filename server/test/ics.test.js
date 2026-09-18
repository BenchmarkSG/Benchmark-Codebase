/* The calendar invite (client/src/lib/ics.js).
 *
 * Tested from here because `npm test --prefix server` is the only runner in
 * this repo, and the module is pure: no DOM, no network. It earns coverage —
 * the first version of it silently dropped every semicolon escape, because
 * '\;' is not an escape sequence in JavaScript and collapses to a bare ';'.
 * An unescaped semicolon in a text value is a property-parameter separator in
 * RFC 5545 and truncates the field in strict readers like Outlook.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callInvite } from '../../client/src/lib/ics.js';

const start = new Date('2026-09-21T01:00:00Z');
const base = { uid: 'call-abc@feeoptima', start, end: new Date(start.getTime() + 30 * 60000), summary: 'FeeOptima specialist call' };
// Continuation lines start with a single space; unfolding is how a reader sees
// the real values.
const unfold = (s) => s.replace(/\r\n /g, '');

test('ics: text values escape backslash, semicolon and comma', () => {
  const out = unfold(callInvite({ ...base, summary: 'a;b,c\\d' }));
  const line = out.split('\r\n').find((l) => l.startsWith('SUMMARY:'));
  assert.equal(line, String.raw`SUMMARY:a\;b\,c\\d`);
});

test('ics: newlines in a description become \\n, never a real line break', () => {
  const out = unfold(callInvite({ ...base, description: 'one\ntwo' }));
  assert.ok(out.includes('DESCRIPTION:one\\ntwo'));
  assert.ok(!/DESCRIPTION:one\r\ntwo/.test(out));
});

test('ics: every line is CRLF-terminated and at most 75 octets', () => {
  const out = callInvite({ ...base, description: 'x'.repeat(400) });
  assert.ok(!/(?<!\r)\n/.test(out), 'a bare LF would break strict readers');
  const enc = new TextEncoder();
  for (const line of out.split('\r\n')) {
    assert.ok(enc.encode(line).length <= 75, `line over 75 octets: ${line.slice(0, 40)}…`);
  }
});

test('ics: folding counts octets, and never splits a character', () => {
  // 'é' is two octets: a 75-CHARACTER line of these is 150 octets.
  const out = callInvite({ ...base, description: 'é'.repeat(120) });
  const enc = new TextEncoder();
  for (const line of out.split('\r\n')) assert.ok(enc.encode(line).length <= 75);
  // Unfolding must give the description back exactly — a split multi-byte
  // character would come back as replacement characters instead.
  assert.ok(unfold(out).includes(`DESCRIPTION:${'é'.repeat(120)}`));
});

test('ics: instants are written in UTC, so no VTIMEZONE is needed', () => {
  const out = unfold(callInvite(base));
  assert.ok(out.includes('DTSTART:20260921T010000Z'));
  assert.ok(out.includes('DTEND:20260921T013000Z'));
  assert.match(out, /DTSTAMP:\d{8}T\d{6}Z/);
});

test('ics: the envelope is well formed and carries a reminder', () => {
  const out = unfold(callInvite(base));
  assert.ok(out.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(out.trimEnd().endsWith('END:VCALENDAR'));
  for (const k of ['VERSION:2.0', 'BEGIN:VEVENT', 'END:VEVENT', 'UID:call-abc@feeoptima', 'STATUS:CONFIRMED', 'TRIGGER:-PT30M']) {
    assert.ok(out.includes(k), `missing ${k}`);
  }
});

test('ics: optional fields are omitted rather than written empty', () => {
  const out = unfold(callInvite(base));
  assert.ok(!/^DESCRIPTION:$/m.test(out));
  assert.ok(!out.includes('LOCATION:'));
  assert.ok(!out.includes('ORGANIZER:'));
});
