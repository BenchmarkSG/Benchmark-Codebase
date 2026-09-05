import './CorporateCertificate.css';
import { SITE_URL } from '../lib/site.js';
import { useSiteQr } from './useSiteQr.js';

// The SME / corporate certificate: a formal award document rather than the
// social-share card individuals get. Treasury teams forward these internally
// and to boards, so it's built to survive being printed and pinned up —
// centred typography, a ruled name line, a dated attestation, signature blocks
// and a seal. The saver card's crown edge would read as a gimmick here.
//
// Deliberately restrained on ornament: gold frame and corner accents carry the
// "award" signal, and the palette stays FeeOptima's navy and green so it reads
// as issued by us rather than as a stock template.

const fmtDate = (d = new Date()) => {
  try { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return d.toISOString().slice(0, 10); }
};

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

export default function CorporateCertificate({ company, product, savingPct, onShare, shared = false }) {
  const { src: qrSrc, onError } = useSiteQr();
  const service = product || 'banking costs';
  // Never leave the holder line blank — an unnamed certificate looks broken.
  const holder = (company || '').trim() || 'Your Company';

  return (
    <div className="ccert">
      <div className="ccert__frame" aria-hidden="true">
        <span className="ccert__corner ccert__corner--tl" />
        <span className="ccert__corner ccert__corner--tr" />
        <span className="ccert__corner ccert__corner--bl" />
        <span className="ccert__corner ccert__corner--br" />
      </div>

      {onShare && (
        <button
          type="button" className="ccert__share" onClick={onShare}
          title="Share this certificate"
          aria-label={shared ? 'Certificate shared' : 'Share this certificate'}
        >
          {shared ? <span className="ccert__share-ok" aria-hidden="true">✓</span> : <ShareIcon />}
        </button>
      )}

      <div className="ccert__inner">
        <h3 className="ccert__title">Certificate</h3>
        <div className="ccert__subtitle">
          <span className="ccert__rule" />
          <span>of Treasury Efficiency</span>
          <span className="ccert__rule" />
        </div>

        <p className="ccert__presented">This certificate is proudly presented to</p>
        <p className="ccert__holder">{holder}</p>
        <div className="ccert__holder-rule" />

        <p className="ccert__body">
          for benchmarking their <strong>{service}</strong> against the market with FeeOptima
          {savingPct ? <> and identifying <strong>{savingPct}%</strong> in recoverable annual cost</> : null}
          {' '}— demonstrating active stewardship of company funds.
        </p>

        <p className="ccert__date">{fmtDate()}</p>

        <div className="ccert__signatures">
          <div className="ccert__sig">
            <span className="ccert__sig-line" />
            <span className="ccert__sig-name">FeeOptima</span>
            <span className="ccert__sig-role">Benchmarking authority</span>
          </div>
          <div className="ccert__sig">
            <span className="ccert__sig-line" />
            <span className="ccert__sig-name">{holder}</span>
            <span className="ccert__sig-role">Authorised signatory</span>
          </div>
        </div>

        <div className="ccert__foot">
          <div className="ccert__seal" aria-hidden="true">
            <span className="ccert__seal-inner">
              <em>Certified</em>
              <strong>Smart Treasury</strong>
            </span>
          </div>
          <div className="ccert__brand">
            <span className="ccert__logo"><span>Fee</span>Optima</span>
            <span className="ccert__handle">@FeeOptima · feeoptima.com</span>
          </div>
          {qrSrc
            ? <img className="ccert__qr" src={qrSrc} alt="Scan to benchmark your bank" onError={onError} />
            : <div className="ccert__qr ccert__qr--ph" aria-hidden />}
        </div>
      </div>
    </div>
  );
}

export { SITE_URL };
