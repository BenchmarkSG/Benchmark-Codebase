import './WorksProducts.css';
import HowItWorks from './HowItWorks.jsx';
import { Products } from './Sections.jsx';

export default function WorksProducts({ onGetStarted }) {
  return (
    <section className="section section--soft wp" id="how">
      <div className="container wp__grid">
        <div className="wp__col wp__col--how">
          <HowItWorks onGetStarted={onGetStarted} />
        </div>
        <div className="wp__col wp__col--products">
          <Products />
        </div>
      </div>
    </section>
  );
}
