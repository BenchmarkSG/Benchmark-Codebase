import { useState } from 'react';
import './PartnerBanks.css';
import { BANK_LOGOS } from './BankLogos.jsx';

/* Renders a real logo image, falling back to the SVG wordmark on load error. */
function BankLogo({ bank }) {
  const [failed, setFailed] = useState(false);
  if (failed || !bank.domain) return bank.el;
  return (
    <img
      className="marquee__logo"
      src={`https://logo.clearbit.com/${bank.domain}`}
      alt={bank.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* Single-row logo marquee, embedded inside the "Trusted by…" section. */
export default function PartnerBanks() {
  // Duplicate the list so the single row loops seamlessly.
  const loop = [...BANK_LOGOS, ...BANK_LOGOS];

  return (
    <div className="partners" id="partners">
      <p className="partners__label">Banking apps we benchmark &amp; partner with</p>

      <div className="marquee" aria-label="Partner banks carousel">
        <div className="marquee__track">
          {loop.map((b, i) => (
            <div className="marquee__item" key={`${b.name}-${i}`} title={b.name}>
              <BankLogo bank={b} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
