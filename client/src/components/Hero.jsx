import { useEffect, useRef, useState } from 'react';
import './Hero.css';
import BenchmarkCalculator from './BenchmarkCalculator.jsx';
import { CTA_PRIMARY } from '../lib/copy.js';

const SLIDES = [
  {
    title: (
      <>Stop Overpaying Your Bank by <span className="hero__title-accent">Thousands</span> Every Year</>
    ),
    lead: 'Compare your Bank against the best for mortgage, loans, remittance, trade finance, FX & current a/c credit interest. Your Bank is profiting from you — find out by how much in 60 secs.',
  },
  {
    title: (
      <>Your Bank is Quietly Overcharging You.<br /><span className="hero__title-accent">Did you know?</span></>
    ),
    lead: 'Independent benchmarking for individuals, SMEs, and corporates — see how your bank’s fees and rates compare to the best in the industry. No bank bias. Just the best deal for you!',
  },
  {
    title: (
      <>9 out of 10 SMEs overpay their Bank, <span className="hero__title-accent">You don’t have to</span></>
    ),
    lead: 'SMEs overpay, not because good rates don’t exist, but because the system is built for Banks profitability. We help you compute your savings and negotiate best savings for you.',
  },
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Hero({ onDetailedFeedback, onReveal, onStart, calcSelection, market, onMarketChange }) {
  const [active, setActive] = useState(0);
  // No play/pause control any more, so this is fixed at mount: users who ask for
  // reduced motion get a static carousel they drive with the dots (WCAG 2.2.2).
  const [paused] = useState(prefersReducedMotion);
  const hovering = useRef(false);

  // Auto-advance the left-column text carousel — but never while paused, hovered,
  // or for users who prefer reduced motion (WCAG 2.2.2).
  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => {
      if (!hovering.current) setActive((i) => (i + 1) % SLIDES.length);
    }, 5200);
    return () => clearInterval(id);
  }, [paused]);

  const slide = SLIDES[active];

  return (
    <section className="hero" id="top">
      <div className="hero__bg" aria-hidden />
      <div className="container hero__grid">
        {/* Left column — text carousel */}
        <div className="hero__copy">
          <div
            className="hero__textcarousel"
            onMouseEnter={() => { hovering.current = true; }}
            onMouseLeave={() => { hovering.current = false; }}
          >
            {/* Only the active slide is in the DOM — no clipping, and a single <h1>. */}
            <div className="hero__text" key={active}>
              <h1 className="hero__title">{slide.title}</h1>
              <p className="hero__lead">{slide.lead}</p>
            </div>
          </div>

          <div
            className="hero__controls"
            onFocusCapture={() => { hovering.current = true; }}
            onBlurCapture={() => { hovering.current = false; }}
          >
            <div className="hero__dots" role="tablist" aria-label="Highlights">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  className={`hero__dot ${i === active ? 'is-active' : ''}`}
                  onClick={() => setActive(i)}
                  role="tab"
                  aria-selected={i === active}
                  aria-label={`Show message ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <button className="btn btn--red hero__cta" onClick={onStart}>
            {CTA_PRIMARY} →
          </button>

          <ul className="hero__trust">
            <li>🛡️ Built by ex-bankers</li>
            <li>🔒 Anonymous &amp; Secure</li>
            <li>🔄 Data updated daily</li>
          </ul>
          {/* Moved off the calculator's heading band: it says the same thing the
              three claims above do, and it reads as a footnote to them rather
              than as a subtitle to "Free Benchmarking Calculator". */}
          <p className="hero__trust-sub">Live rates · no sign-up · no personal data stored</p>
        </div>

        {/* Right column — free benchmark calculator */}
        <div className="hero__media">
          <BenchmarkCalculator compact onDetailedFeedback={onDetailedFeedback} onReveal={onReveal} selection={calcSelection} market={market} onMarketChange={onMarketChange} />
        </div>
      </div>
    </section>
  );
}
