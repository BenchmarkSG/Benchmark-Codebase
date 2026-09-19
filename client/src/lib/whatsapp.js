/* WhatsApp: our primary channel, and the only way to prove a number is on it.
 *
 * THE CONSTRAINT, STATED ONCE
 *   There is no API that answers "is this number on WhatsApp?". The On-Premises
 *   API's /v1/contacts check did exactly that and Meta shut it down on
 *   23 Oct 2025; the Cloud API deliberately ships no replacement, because an
 *   open registration check is a phone-number enumeration oracle. Third-party
 *   services that still offer it drive an unofficial WhatsApp Web client, which
 *   breaks their terms and gets numbers banned.
 *
 *   So a number can only be proven by a MESSAGE. Two honest ways:
 *     1. The customer messages US. A wa.me deep link opens WhatsApp with a code
 *        already typed; they press send. We receive it from their real WhatsApp
 *        number — which is the thing we actually wanted, and is better evidence
 *        than anything they could type into a form. No API, no cost, no Meta
 *        approval. This is what the app does today.
 *     2. We message THEM via the Cloud API and read the delivery webhook. That
 *        is automatic, but needs a verified Meta business, a WABA, an approved
 *        template and a per-message fee. It replaces step 1's manual match
 *        later without changing anything the customer sees.
 *
 *   Everything short of that — a regex, a checkbox, a libphonenumber parse — is
 *   a claim by the customer, not evidence. We still ask for the claim, because a
 *   deliberate "yes, this is my WhatsApp" catches honest mistakes (a landline, a
 *   work desk line) at the only moment the customer can fix them. We just never
 *   record it as verification.
 */

import { updateMyProfile } from './dashboardApi.js';

/* Digits only — wa.me rejects "+", spaces and dashes. */
const digits = (v) => String(v || '').replace(/\D/g, '');

/* Numbers that must never reach a customer. 6591234567 ships in
   client/.env.example as an illustration; if it is ever left in a real
   environment every "message us" link points at a stranger's phone. Treated as
   unconfigured rather than trusted. */
const PLACEHOLDERS = new Set(['6591234567', '6512345678', '15551234567']);

const RAW = digits(import.meta.env.VITE_WHATSAPP_NUMBER);

/** Our business WhatsApp number, or '' when it is unset or still a placeholder. */
export const BUSINESS_NUMBER = PLACEHOLDERS.has(RAW) || RAW.length < 8 ? '' : RAW;

/** Is WhatsApp wired up at all? Every WhatsApp affordance hides when false. */
export const whatsappReady = BUSINESS_NUMBER.length > 0;

/* A short, unambiguous code. No 0/O/1/I/L — these get read aloud on a call and
   retyped by a support agent, so the alphabet matters more than the entropy.
   This is a matching token, not a secret: it links an inbound WhatsApp message
   to a lead. It is not a password and must never gate anything on its own. */
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY23456789';
export function verificationCode(len = 5) {
  const out = [];
  const buf = new Uint32Array(len);
  (globalThis.crypto || {}).getRandomValues?.(buf);
  for (let i = 0; i < len; i++) {
    const n = buf[i] || Math.floor(Math.random() * 0xffffffff);
    out.push(ALPHABET[n % ALPHABET.length]);
  }
  return out.join('');
}

/**
 * The deep link the customer taps. Opens their WhatsApp, addressed to us, with
 * the code already in the input — all they do is press send.
 *
 * Note the direction: they message us. A link that made US message THEM would
 * need the Cloud API, and would prove nothing anyway — a delivery receipt to an
 * unverified number is not consent.
 */
export function confirmLink(code) {
  if (!whatsappReady) return null;
  const text = `Confirm my WhatsApp for FeeOptima. Code: ${code}`;
  return `https://wa.me/${BUSINESS_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** Open a chat with a CUSTOMER's number — used by the support queue. */
export function chatLink(phone, message = '') {
  const to = digits(phone);
  if (to.length < 8) return null;
  return `https://wa.me/${to}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

/**
 * Is this dialable at all? Deliberately loose — five markets, five numbering
 * plans, and a strict pattern rejects more real numbers than fake ones. It says
 * nothing about WhatsApp; only an inbound message does.
 */
export const looksDialable = (phone) => digits(phone).length >= 7;

/* A number with no country code is ambiguous the moment it leaves its own
   market, and every WhatsApp link is international. We can't reject on this —
   plenty of people type a local number that is still correct for their market —
   but we can say so while they are looking at the field. */
export const missingCountryCode = (phone) => {
  const s = String(phone || '').trim();
  return !!s && !s.startsWith('+') && !s.startsWith('00');
};

/**
 * Persist a callback number.
 *
 * Written to BOTH the profile row and auth user_metadata — the same pair
 * account settings writes — so whichever the next screen reads, it finds it and
 * never asks twice. `updateUserMetadata` comes from useAuth and is passed in:
 * this module is a lib and has no hooks of its own.
 *
 * Returns the verification code when one was issued (opted in AND WhatsApp is
 * configured), so the caller can offer the one-tap round trip. A claim is not
 * evidence — see the note at the top of this file.
 */
export async function saveWhatsAppNumber({ phone, onWhatsApp = true, updateUserMetadata } = {}) {
  const clean = String(phone || '').trim();
  if (!looksDialable(clean)) throw new Error('That number does not look dialable.');
  // Issued before the save so the same code lands in the profile and in the
  // deep link — support matches the inbound message against it.
  const issued = onWhatsApp && whatsappReady ? verificationCode() : null;
  const patch = { phone: clean, whatsapp_opt_in: !!onWhatsApp };
  if (issued) { patch.whatsapp_code = issued; patch.whatsapp_code_sent_at = new Date().toISOString(); }
  await updateMyProfile(patch);
  await updateUserMetadata?.({ phone: clean, whatsapp_opt_in: !!onWhatsApp });
  return issued;
}
