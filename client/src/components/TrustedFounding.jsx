import './TrustedFounding.css';
import { Testimonials, Founding } from './Sections.jsx';

export default function TrustedFounding({ onBecomeMember }) {
  return (
    <section className="section section--blue tf">
      <div className="container tf__grid">
        <div className="tf__col tf__col--tst">
          <Testimonials />
        </div>
        <div className="tf__col tf__col--join">
          <Founding onBecomeMember={onBecomeMember} />
        </div>
      </div>
    </section>
  );
}
