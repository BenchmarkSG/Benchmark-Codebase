// Canonical public site URL. Used for shareable QR codes and share links so they
// always point at the live site — never localhost (dev) or a *.vercel.app preview
// deploy. Override at build time with VITE_PUBLIC_SITE_URL (VITE_ vars are baked
// in at build, so rebuild/redeploy after changing it).
//
// NOTE: do NOT use this for auth redirects — those must return to the actual
// current origin (see AuthContext).
export const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://bankbenchmark.sg').replace(/\/+$/, '');
