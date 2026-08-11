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
