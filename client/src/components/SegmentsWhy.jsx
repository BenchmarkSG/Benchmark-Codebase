import './SegmentsWhy.css';
import { Segments, WhyChoose } from './Sections.jsx';

export default function SegmentsWhy({ onGetStarted, onCompare }) {
  return (
    <section className="section sw">
      <div className="container">
        <div className="sw__segments">
          <Segments onGetStarted={onGetStarted} onCompare={onCompare} />
        </div>
        <div className="sw__why">
          <WhyChoose />
        </div>
      </div>
    </section>
  );
}
