import './SegmentsWhy.css';
import { Segments, WhyChoose } from './Sections.jsx';

export default function SegmentsWhy({ onGetStarted }) {
  return (
    <section className="section sw">
      <div className="container">
        <div className="sw__segments">
          <Segments onGetStarted={onGetStarted} />
        </div>
        <div className="sw__why">
          <WhyChoose />
        </div>
      </div>
    </section>
  );
}
