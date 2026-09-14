// Returns a normalized http(s) URL, or null if the value is unsafe/empty.
//
// React does NOT sanitize the href/src attribute, so a stored value like
// `javascript:alert(document.cookie)` in an advisor's calendly_url / photo_url
// would execute in the victim's origin when clicked. Run any user- or
// directory-sourced URL through this before putting it in an href/src or
// navigating to it. Blocks javascript:, data:, vbscript:, file:, etc.
export function safeHttpUrl(value) {
  if (typeof value !== 'string') return null;
  let s = value.trim();
  if (!s) return null;
  // Bare host (e.g. "calendly.com/acme") → assume https.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/* A scheduling link the booking screen can actually render.
 *
 * The reveal modal embeds this with Calendly's own widget
 * (window.Calendly.initInlineWidget), which only drives calendly.com URLs — a
 * Cal.com or SavvyCal link would store fine and then show a blank booking step.
 * So the host is part of what "valid" means here, not just the scheme.
 *
 * Returns the normalized https URL, or null. */
export function calendlyUrl(value) {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  try {
    const u = new URL(safe);
    if (!/(^|\.)calendly\.com$/i.test(u.hostname)) return null;
    // calendly.com on its own is the marketing site, not anyone's booking page.
    if (u.pathname.replace(/\/+$/, '').length < 2) return null;
    u.protocol = 'https:';
    return u.href;
  } catch { return null; }
}

// True if the URL is on Stripe's checkout domain — used to gate the redirect
// returned by our /api/checkout before window.location.assign().
export function isStripeCheckoutUrl(value) {
  const safe = safeHttpUrl(value);
  if (!safe) return false;
  try {
    return /(^|\.)stripe\.com$/i.test(new URL(safe).hostname);
  } catch {
    return false;
  }
}
