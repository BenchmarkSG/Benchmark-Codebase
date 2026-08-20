import { useEffect, useRef, useState } from 'react';
import './Hero.css';
import BenchmarkCalculator from './BenchmarkCalculator.jsx';
import { CTA_PRIMARY } from '../lib/copy.js';

const SLIDES = [
  {
    title: (
      <>Stop Overpaying Your Bank by <span className="hero__title-accent">Thousands</span> Every Year</>
    ),
    lead: 'Find out your number in 30 secs. Compare your bank against the best for mortgages, loans, remittances, trade finance, FX fees & current account credit interest. Your bank is profiting from you — find out by how much.',
  },
  {
    title: (
      <>Your Bank is Quietly <span className="hero__title-accent">Overcharging You.</span></>
    ),
    lead: (
      <>
        We compare and uncover the hidden FX markups, loan margins and deposit rates that banks never advertise.{' '}
        <span className="hero__underline">See exactly how much you overpay</span> — in 30 secs. No login required.
      </>
    ),
  },
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Hero({ onDetailedFeedback, onReveal, onStart, calcSelection, onRequireAuth, onMarketChange }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(prefersReducedMotion); // don't auto-rotate for reduced-motion users
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

          <div className="hero__controls">
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
            {SLIDES.length > 1 && (
              <button
                className="hero__playpause"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Play highlights' : 'Pause highlights'}
              >
                {paused ? '▶' : '❚❚'}
              </button>
            )}
          </div>

          <button className="btn btn--red hero__cta" onClick={onStart}>
            {CTA_PRIMARY} →
          </button>

          <ul className="hero__trust">
            <li>🛡️ Built by ex-JPM, Citi &amp; SCB bankers</li>
            <li>🔒 Anonymous &amp; Secure</li>
            <li>🔄 Data updated daily</li>
          </ul>
        </div>

        {/* Right column — free benchmark calculator */}
        <div className="hero__media">
          <BenchmarkCalculator compact onDetailedFeedback={onDetailedFeedback} onReveal={onReveal} selection={calcSelection} onRequireAuth={onRequireAuth} onMarketChange={onMarketChange} />
        </div>
      </div>
    </section>
  );
}
