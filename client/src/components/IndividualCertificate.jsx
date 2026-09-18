import './IndividualCertificate.css';
import { SITE_HOST } from '../lib/site.js';
import { ornamentDataUri } from '../lib/certOrnament.js';
import { useSiteQr } from './useSiteQr.js';

// The individual certificate: a formal award document in the classic style —
// navy field with gold filigree, a heavy gold frame, a ribbon banner, and a
// seal flanked by the date and signature.
//
// The filigree is one shared SVG (lib/certOrnament.js) used as a repeating
// background here and drawn to canvas by the PNG export, so the image someone
// shares is the document they were just looking at.

const fmtDate = (d = new Date()) => {
  try { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d.toISOString().slice(0, 10); }
};

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 15V4" /><path d="M8 8l4-4 4 4" />
      <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export default function IndividualCertificate({ holderName, product, savingPct, onShare, shared = false }) {
  const { src: qrSrc, onError } = useSiteQr();
  const service = product || 'banking costs';
  // An unnamed certificate looks broken, so there is always something here.
  const holder = (holderName || '').trim() || 'A Smart Saver';
  const band = { backgroundImage: `url("${ornamentDataUri()}")` };

  return (
    <div className="icert">
      <span className="icert__band icert__band--top" style={band} aria-hidden="true" />
      <span className="icert__band icert__band--bottom" style={band} aria-hidden="true" />

      {onShare && (
        <button
          type="button" className="icert__share" onClick={onShare}
          title="Share this certificate"
          aria-label={shared ? 'Certificate shared' : 'Share this certificate'}
        >
          {shared ? <span className="icert__share-ok" aria-hidden="true">✓</span> : <ShareIcon />}
        </button>
      )}

      <div className="icert__gold">
        <div className="icert__paper">
          <div className="icert__ribbon"><span>FeeOptima</span></div>

          <h3 className="icert__title">Certificate</h3>
          <p className="icert__sub">Of Achievement</p>

          <p className="icert__holder">{holder}</p>

          <p className="icert__body">
            for benchmarking their <strong>{service}</strong> against the market with FeeOptima
            {savingPct ? <> and uncovering <strong>{savingPct}%</strong> in recoverable annual cost</> : null}
            {' '}— proof that the best rate is worth asking for.
          </p>

          <div className="icert__foot">
            <div className="icert__meta">
              <span className="icert__meta-val">{fmtDate()}</span>
              <span className="icert__meta-label">Date</span>
            </div>

            <div className="icert__seal" aria-hidden="true">
              <span className="icert__seal-ring">
                <em>Certified</em>
                <strong>Smart Saver</strong>
                <i>{SITE_HOST}</i>
              </span>
            </div>

            <div className="icert__meta">
              {qrSrc
                ? <img className="icert__qr" src={qrSrc} alt="Scan to benchmark your bank" onError={onError} />
                : <span className="icert__qr icert__qr--ph" />}
              <span className="icert__meta-label">Verify</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
