import './TrustedFounding.css';
import { Testimonials, Founding } from './Sections.jsx';
import PartnerBanks from './PartnerBanks.jsx';

export default function TrustedFounding({ onGetStarted }) {
  return (
    <section className="section tf">
      <div className="container tf__grid">
        <div className="tf__col tf__col--tst">
          <Testimonials />
        </div>
        <div className="tf__col tf__col--join">
          <Founding onGetStarted={onGetStarted} />
        </div>
      </div>

      <PartnerBanks />
    </section>
  );
}
