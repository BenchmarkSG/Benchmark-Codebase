// Canonical public site URL. Used for shareable QR codes and share links so they
// always point at the live site — never localhost (dev) or a one-off deployment
// URL. Override at build time with VITE_PUBLIC_SITE_URL (VITE_ vars are baked in
// at build, so rebuild/redeploy after changing it).
//
// The default is the domain actually serving the product. It was
// https://feeoptima.com, which has no DNS at all — so every QR code and every
// certificate pointed at a dead host. Do not put a domain here until it resolves.
//
// NOTE: do NOT use this for auth redirects — those must return to the actual
// current origin (see AuthContext).
export const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://feeoptima.vercel.app').replace(/\/+$/, '');

/* The bare host, for printing on certificates and share cards. Derived rather
   than written out again: the display text and the link it implies drifted apart
   once already, and a certificate is the one artefact that travels to people who
   have never used the site. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
