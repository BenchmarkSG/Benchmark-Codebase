import { useEffect, useRef, useState } from 'react';
import './CertificateShare.css';
import { NETWORKS, NETWORKS_FOR, isHandheld, supportsFileShare, saveFile, copyText } from '../lib/socialShare.js';
import { SITE_URL } from '../lib/site.js';

// The share bar that caps the certificate. Both designs use it; the network
// list and the palette come from the segment (see socialShare.js for why each
// button behaves the way it does). A fourth, network-less button hands the
// whole thing to the OS share sheet — or saves the PNG on a laptop.

/* Brand marks, drawn inline: an <img> per logo would be four network requests
   on a card built to render offline, and remote logo hosts are exactly the kind
   of thing an ad blocker eats. */
function BrandIcon({ id }) {
  switch (id) {
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
        </svg>
      );
    case 'x':
      return (
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" />
          <circle cx="12" cy="12" r="4.1" />
          <circle cx="17.5" cy="6.6" r="1.15" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'meta':
      // Meta's lemniscate, stroked — recognisable at 20px and one path.
      return (
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2.1"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          <path d="M12 12c-1.8-3.6-3.4-5.4-5.1-5.4C4.4 6.6 3 9 3 12s1.4 5.4 3.9 5.4c1.7 0 3.3-1.8 5.1-5.4 1.8-3.6 3.4-5.4 5.1-5.4 2.5 0 3.9 2.4 3.9 5.4s-1.4 5.4-3.9 5.4c-1.7 0-3.3-1.8-5.1-5.4z" />
        </svg>
      );
    default:
      return null;
  }
}

/* The generic "share or save it" glyph — the same tray-up arrow the certificate
   used to carry in its corner, so the control is recognisable in its new home. */
function ShareIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 15V4" /><path d="M8 8l4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export default function CertificateShare({ segment = 'individual', caption = '', buildFile, onShare, shared = false }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const say = (msg) => {
    setNote(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(''), 7000);
  };

  const ids = NETWORKS_FOR[segment] || NETWORKS_FOR.individual;
  const text = caption || 'I just benchmarked my bank on FeeOptima.';

  const shareTo = async (net) => {
    // Which of the three routes, decided BEFORE any await — the window has to be
    // opened inside the click itself or the popup blocker swallows it.
    //   phone + file share → OS sheet, certificate attached; picking the network
    //                        there opens its app ready to post (Instagram included)
    //   phone, no sheet    → the https link, which the OS hands to the app
    //   laptop             → the network's website, plus the saved image
    const handheld = isHandheld();
    const sheet = handheld && supportsFileShare();
    if (!sheet) window.open(net.href(SITE_URL, text), '_blank', 'noopener,noreferrer');

    setBusy(net.id);
    let file = null;
    try { file = await buildFile?.(); } catch { /* fall through to text-only */ }
    setBusy('');

    if (sheet) {
      try {
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: `${text} ${SITE_URL}`, title: 'FeeOptima' });
        } else {
          await navigator.share({ title: 'FeeOptima', text, url: SITE_URL });
        }
        say('Shared ✓');
      } catch { /* the user dismissed the sheet — not an error */ }
      return;
    }

    // Hand them everything the app or site we just opened can't be given.
    if (file) saveFile(file);
    const copied = await copyText(`${text} ${SITE_URL}`);
    const where = handheld ? `the ${net.label} app` : `the ${net.label} tab`;
    say(file
      ? `Certificate saved to your device${copied ? ' and caption copied' : ''} — attach it in ${where}.`
      : `Caption ${copied ? 'copied' : 'ready'} — post it in ${where}.`);
  };

  // No network chosen: hand the whole thing to the OS share sheet, or on a
  // laptop save the PNG and copy the caption. The caller owns that logic (it
  // also drives the `shared` tick), so this only manages the busy state.
  const shareGeneric = async () => {
    if (!onShare) return;
    setBusy('generic');
    try { await onShare(); } finally { setBusy(''); }
  };

  return (
    <div className={`certshare certshare--${segment === 'sme' ? 'sme' : 'individual'}`}>
      <span className="certshare__label">Share your certificate</span>
      <div className="certshare__btns">
        {ids.map((id) => {
          const net = NETWORKS[id];
          if (!net) return null;
          return (
            <button
              key={id}
              type="button"
              className={`certshare__btn certshare__btn--${id}`}
              onClick={() => shareTo(net)}
              disabled={busy === id}
              title={net.title}
              aria-label={net.title}
            >
              <BrandIcon id={id} />
            </button>
          );
        })}
        {onShare && (
          <button
            type="button"
            className="certshare__btn certshare__btn--generic"
            onClick={shareGeneric}
            disabled={busy === 'generic'}
            title="Share or save the certificate"
            aria-label={shared ? 'Certificate shared' : 'Share or save the certificate'}
          >
            {shared ? <span className="certshare__ok" aria-hidden="true">✓</span> : <ShareIcon />}
          </button>
        )}
      </div>
      {/* Assertive would interrupt a screen reader mid-certificate; this is a
          confirmation, not an alert. */}
      <p className="certshare__note" role="status" aria-live="polite">{note}</p>
    </div>
  );
}
