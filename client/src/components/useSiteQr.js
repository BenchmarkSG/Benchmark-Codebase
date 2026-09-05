import { useEffect, useState } from 'react';
import { SITE_URL } from '../lib/site.js';

// Last-resort fallback only if in-browser generation somehow fails.
const remoteQr = (site) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(site)}`;

// The certificates' QR code, generated LOCALLY (in-browser) so it renders
// instantly, works offline, can't be blocked by ad/privacy filters, and is
// always baked into the screenshot the user shares — no third-party image host
// to fail on. Shared by both certificate designs.
export function useSiteQr(site = SITE_URL) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let alive = true;
    // Lazy-load the encoder so it never touches the initial bundle.
    import('qrcode')
      .then((m) => (m.default || m).toDataURL(site, { margin: 0, width: 150, errorCorrectionLevel: 'M' }))
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(remoteQr(site)); }); // fall back to the image service
    return () => { alive = false; };
  }, [site]);

  // onError lets a failed data-URL render retry through the remote service once.
  const onError = () => { if (src !== remoteQr(site)) setSrc(remoteQr(site)); };
  return { src, onError };
}
