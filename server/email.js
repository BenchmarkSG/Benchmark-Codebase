// Transactional email — a pluggable provider (Resend's REST API by default, no
// SDK needed). Mirrors payments.js: if RESEND_API_KEY isn't set the module logs
// and no-ops, so the app runs fine without email configured.
//
// - The purchase CONFIRMATION is sent server-side when a checkout is verified
//   paid (see /api/checkout/session).
// - REMINDER (before a booked call/expert session) and FEEDBACK (after) can't be
//   scheduled from here alone — they need the booking time, which lives in
//   Calendly. They're exposed as sendReminder/sendFeedback and driven by the
//   guarded /api/internal/notify endpoint, which a cron job or Calendly webhook
//   calls when a session is due.
//
// Config (env):
//   RESEND_API_KEY     enables sending (re_…)
//   EMAIL_FROM         from address, e.g. 'FeeOptima <hello@feeoptima.com>'
//   INTERNAL_TASK_KEY  shared secret guarding /api/internal/notify

const KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.EMAIL_FROM || 'FeeOptima <hello@feeoptima.com>';
export const isEmailConfigured = !!KEY;

// Send one email. Never throws — returns { ok } so callers can fire-and-forget.
export async function sendMail({ to, subject, html, text }) {
  if (!to || !subject) return { ok: false, skipped: 'missing-fields' };
  if (!isEmailConfigured) {
    console.log(`[email:stub] would send → ${to} · "${subject}"`);
    return { ok: false, skipped: 'not-configured' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return { ok: true };
  } catch (err) {
    console.error('[email]', err.message);
    return { ok: false, error: err.message };
  }
}

// ---- Templates -------------------------------------------------------------
const BRAND = 'FeeOptima';
const TIER_LABEL = {
  reveal: 'best-match bank reveal',
  call: 'negotiation coaching call',
  expert: 'expert-led negotiation',
};
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']);

function money(amount, currency) {
  if (amount == null) return '';
  const cur = String(currency || 'sgd').toUpperCase();
  const major = ZERO_DECIMAL.has(cur.toLowerCase()) ? amount : amount / 100;
  try { return new Intl.NumberFormat('en-SG', { style: 'currency', currency: cur }).format(major); }
  catch { return `${cur} ${major}`; }
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Minimal, inline-styled shell so it renders consistently across mail clients.
function shell(heading, bodyHtml) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f4f8fd;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e9f2;border-radius:14px;overflow:hidden">
    <div style="padding:18px 22px;border-bottom:1px solid #e4e9f2;font-weight:800;font-size:18px;color:#0b1f3a">
      <span style="color:#2f7bd8">Fee</span>Optima
    </div>
    <div style="padding:22px">
      <h1 style="margin:0 0 12px;font-size:19px;color:#0b1f3a">${heading}</h1>
      <div style="font-size:14.5px;line-height:1.6;color:#12294d">${bodyHtml}</div>
    </div>
    <div style="padding:14px 22px;border-top:1px solid #e4e9f2;font-size:11.5px;color:#5b6b82">
      ${BRAND} · independent bank fee &amp; rate benchmarking. Reply to this email any time.
    </div>
  </div>
</div>`;
}

export function confirmationEmail({ tier, name, amountTotal, currency, product }) {
  const label = TIER_LABEL[tier] || 'order';
  const amt = money(amountTotal, currency);
  const hi = name ? `Hi ${name},` : 'Hi,';
  const line = tier === 'reveal'
    ? `Your best-match bank is unlocked${product ? ` for your ${product}` : ''}. Head back to ${BRAND} to see it, grab your shareable certificate, and draft your negotiation email — free.`
    : `Thanks for booking your ${label}${product ? ` for your ${product}` : ''}. You'll choose a time next, and the calendar invite arrives by email.`;
  const html = shell(`${cap(label)} confirmed`, `<p>${hi}</p><p>${line}</p>${amt ? `<p style="margin-top:14px"><strong>Amount:</strong> ${amt}</p>` : ''}<p style="margin-top:14px">Not satisfied? Just reply — full refund, no questions.</p>`);
  const text = `${hi}\n\n${line}\n${amt ? `\nAmount: ${amt}\n` : ''}\nNot satisfied? Reply for a full refund.\n\n— ${BRAND}`;
  return { subject: `Your ${BRAND} ${label} is confirmed`, html, text };
}

export function reminderEmail({ name, kind, whenText }) {
  const label = TIER_LABEL[kind] || 'session';
  const hi = name ? `Hi ${name},` : 'Hi,';
  const line = `A quick reminder about your ${label}${whenText ? ` on ${whenText}` : ' coming up soon'}. Have your latest statement handy so we can move fast on the numbers.`;
  const html = shell('See you soon', `<p>${hi}</p><p>${line}</p>`);
  const text = `${hi}\n\n${line}\n\n— ${BRAND}`;
  return { subject: `Reminder: your ${BRAND} ${label} is coming up`, html, text };
}

export function feedbackEmail({ name, product }) {
  const hi = name ? `Hi ${name},` : 'Hi,';
  const line = `We'd love to hear how your negotiation${product ? ` on your ${product}` : ''} went — and how much you ended up saving. Just reply to this email; it helps us sharpen the benchmarks for everyone.`;
  const html = shell('How did it go?', `<p>${hi}</p><p>${line}</p>`);
  const text = `${hi}\n\n${line}\n\n— ${BRAND}`;
  return { subject: 'How did it go? Tell us what you saved', html, text };
}

// ---- High-level senders ----------------------------------------------------
export const sendConfirmation = (opts) => sendMail({ to: opts.to, ...confirmationEmail(opts) });
export const sendReminder = (opts) => sendMail({ to: opts.to, ...reminderEmail(opts) });
export const sendFeedback = (opts) => sendMail({ to: opts.to, ...feedbackEmail(opts) });
