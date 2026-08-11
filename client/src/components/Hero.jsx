import { useEffect, useState } from 'react';
import './Hero.css';
import BenchmarkCalculator from './BenchmarkCalculator.jsx';

const SLIDES = [
  {
    title: (
      <>Stop Overpaying<br />Your Bank by<br /><span className="hero__title-accent">Thousands</span> Every Year</>
    ),
    lead: 'Instantly compare your current bank (individuals or SMEs) against the best options in Singapore & SEA for mortgages, personal loans, cross-border payments, FX fees & current accounts.',
  },
  {
    title: (
      <>Your Bank is Quietly<br /><span className="hero__title-accent">Overcharging You.</span></>
    ),
    lead: 'Find out how much you are overpaying by comparing against what others are paying — instantly in 30 secs. No login required.',
  },
];

export default function Hero({ onDetailedFeedback, onStart, calcSelection, onRequireAuth }) {
  const [active, setActive] = useState(0);

  // Auto-advance the left-column text carousel.
  useEffect(() => {
    const id = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), 4600);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hero" id="top">
      <div className="hero__bg" aria-hidden />
      <div className="container hero__grid">
        {/* Left column — text carousel */}
        <div className="hero__copy">
          <div className="hero__textcarousel">
            {SLIDES.map((s, i) => (
              <div key={i} className={`hero__text ${i === active ? 'is-active' : ''}`} aria-hidden={i !== active}>
                <h1 className="hero__title">{s.title}</h1>
                <p className="hero__lead">{s.lead}</p>
              </div>
            ))}
          </div>

          <div className="hero__dots">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                className={`hero__dot ${i === active ? 'is-active' : ''}`}
                onClick={() => setActive(i)}
                aria-label={`Show message ${i + 1}`}
              />
            ))}
          </div>

          <button className="btn btn--red hero__cta" onClick={onStart}>
            Calculate Your Free Benchmark →
          </button>

          <ul className="hero__trust">
            <li>🛡️ Trusted by SMEs &amp; professionals</li>
            <li>🔒 Anonymous &amp; Secure</li>
            <li>🔄 Data updated daily</li>
          </ul>
        </div>

        {/* Right column — free benchmark calculator */}
        <div className="hero__media">
          <BenchmarkCalculator compact onDetailedFeedback={onDetailedFeedback} selection={calcSelection} onRequireAuth={onRequireAuth} />
        </div>
      </div>
    </section>
  );
}
