import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './Certificate.css';
import { SITE_URL } from '../lib/site.js';
import { crownOutline, CROWN_BAND, CROWN_TOOTH } from '../lib/crownOutline.js';

// Shareable "certificate" shown on the $1 social-share path. SMEs get the
// "Smart Treasury" tagline; individuals get "Smart Saver" — everything else is
// shared copy. The QR is generated LOCALLY (in-browser) so it renders instantly,
// works offline, can't be blocked by ad/privacy filters, and is always baked
// into the screenshot the user shares — no third-party image host to fail on.
const TAGLINE = {
  sme: 'Certified Smart Treasury',
  individual: 'Certified Smart Saver',
};

// Last-resort fallback only if in-browser generation somehow fails.
const remoteQr = (site) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(site)}`;

// The crenellated card edge is drawn as one SVG path rather than with a CSS
// border, because a border can only trace a rectangle. That means the shape
// needs the card's live pixel size, so we measure it — synchronously on first
// paint (no flash of an unpainted card) and again whenever it reflows.
function useBoxSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setSize((prev) => (
        Math.abs(prev.w - width) < 0.5 && Math.abs(prev.h - height) < 0.5
          ? prev                      // same box — don't re-render
          : { w: width, h: height }
      ));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// Arrow-out-of-tray — the near-universal "share" glyph.
function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export default function Certificate({ segment = 'individual', product, savingPct, onShare, shared = false }) {
  const title = TAGLINE[segment] || TAGLINE.individual;
  const service = product || 'banking costs';
  const site = SITE_URL;
  const [qrSrc, setQrSrc] = useState('');
  const cardRef = useRef(null);
  const { w, h } = useBoxSize(cardRef);
  // useId can contain ':' — strip it so the url(#…) reference is a clean IDREF.
  const gradId = `certGrad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    let alive = true;
    // Lazy-load the encoder so it never touches the initial bundle.
    import('qrcode')
      .then((m) => (m.default || m).toDataURL(site, { margin: 0, width: 150, errorCorrectionLevel: 'M' }))
      .then((url) => { if (alive) setQrSrc(url); })
      .catch(() => { if (alive) setQrSrc(remoteQr(site)); }); // fall back to the image service
    return () => { alive = false; };
  }, [site]);

  const savedLine = savingPct
    ? <>We saved <strong>{savingPct}%</strong> on our <strong>{service}</strong> by comparing our bank costs with the fee-benchmarking tool at <strong>FeeOptima</strong> — you could too. Please share widely.</>
    : <>We compared our <strong>{service}</strong> against the market with the fee-benchmarking tool at <strong>FeeOptima</strong> — and found real savings. You could too. Please share widely.</>;

  // Inset by 1px so the 2px stroke sits inside the viewBox — SVG roots clip, and
  // a path drawn on the edge would lose the outer half of its outline.
  const outline = w && h ? crownOutline({ w: w - 2, h: h - 2, band: CROWN_BAND, tooth: CROWN_TOOTH }) : '';

  return (
    <div className="cert" ref={cardRef}>
      {outline && (
        <svg className="cert__edge" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            {/* Matches the gradient the canvas export draws. Runs white → faint
                blue, the reverse of the panel behind it, so the card reads as a
                raised surface rather than blending into the tinted ground. */}
            <linearGradient id={gradId} x1="0" y1="0" x2="0.5" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f1f7ff" />
            </linearGradient>
          </defs>
          <g transform="translate(1,1)">
            <path d={outline} fill={`url(#${gradId})`} stroke="#1d63c4" strokeWidth="2" strokeLinejoin="round" />
          </g>
        </svg>
      )}
      <span className="cert__frame" aria-hidden="true" />
      <div className="cert__top">
        <div className="cert__ribbon">👑 {title}</div>
        {onShare && (
          <button
            type="button" className="cert__share" onClick={onShare}
            title="Share this certificate"
            aria-label={shared ? 'Certificate shared' : 'Share this certificate'}
          >
            {shared ? <span className="cert__share-ok" aria-hidden="true">✓</span> : <ShareIcon />}
          </button>
        )}
      </div>
      <h3 className="cert__head">Stop Overpaying Your Bank by Thousands Every Year</h3>
      <p className="cert__body">{savedLine}</p>
      <p className="cert__q">Your bank is profiting from you — find out by how much.</p>
      <div className="cert__foot">
        <div className="cert__brand">
          <span className="cert__logo"><span>Fee</span>Optima</span>
          <span className="cert__handle">@FeeOptima · feeoptima.com</span>
        </div>
        {qrSrc
          ? (
            <img
              className="cert__qr" src={qrSrc} alt="Scan to benchmark your bank"
              onError={() => { if (qrSrc !== remoteQr(site)) setQrSrc(remoteQr(site)); }}
            />
          )
          : <div className="cert__qr cert__qr--ph" aria-hidden />}
      </div>
    </div>
  );
}
