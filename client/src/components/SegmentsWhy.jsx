import './SegmentsWhy.css';
import { Segments, WhyChoose } from './Sections.jsx';

export default function SegmentsWhy({ onGetStarted, onConnect }) {
  return (
    <section className="section sw">
      <div className="container sw__grid">
        <div className="sw__col sw__col--seg">
          <Segments onGetStarted={onGetStarted} />
        </div>
        <div className="sw__col sw__col--why">
          <WhyChoose onConnect={onConnect} />
        </div>
      </div>
    </section>
  );
}
