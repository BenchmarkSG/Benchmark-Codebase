import { useEffect, useState } from 'react';
import './Certificate.css';
import { SITE_URL } from '../lib/site.js';

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

export default function Certificate({ segment = 'individual', product, savingPct }) {
  const title = TAGLINE[segment] || TAGLINE.individual;
  const service = product || 'banking costs';
  const site = SITE_URL;
  const [qrSrc, setQrSrc] = useState('');

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

  return (
    <div className="cert">
      <div className="cert__ribbon">🏅 {title}</div>
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
