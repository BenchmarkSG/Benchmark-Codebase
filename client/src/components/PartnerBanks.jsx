import { useState } from 'react';
import './PartnerBanks.css';
import { logosForMarket } from './BankLogos.jsx';

/* Renders the local logo image, falling back to the SVG wordmark on load error. */
function BankLogo({ bank }) {
  const [failed, setFailed] = useState(false);
  if (failed || !bank.img) return bank.el;
  return (
    <img
      className="marquee__logo"
      src={bank.img}
      alt={bank.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* Single-row logo marquee — reflects the market picked in the calculator.
   Duplicate the list so the single row loops seamlessly. */
export default function PartnerBanks({ market = 'SG' }) {
  const logos = logosForMarket(market);
  const loop = [...logos, ...logos];

  return (
    <section className="partners" id="partners">
      <p className="partners__label">Banks &amp; Companies We Track</p>

      <div className="marquee" aria-label="Banks we track carousel">
        {/* key restarts the loop cleanly when the market (and list length) changes */}
        <div className="marquee__track" key={market}>
          {loop.map((b, i) => (
            <div className="marquee__item" key={`${b.name}-${i}`} title={b.name}>
              <BankLogo bank={b} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
