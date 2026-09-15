import './HowItWorks.css';

/* Simple line icons (stroke = currentColor) shown inside the step circles. */
const IconDoc = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M9 12h6M9 16h6M9 8h2" />
  </svg>
);
const IconChart = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16" /><rect x="6" y="12" width="3" height="6" /><rect x="11" y="8" width="3" height="10" /><rect x="16" y="5" width="3" height="13" />
    <path d="M4 9l5-4 4 3 6-5" />
  </svg>
);
const IconDeal = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.2c0-1 .9-1.7 2.5-1.7s2.5.7 2.5 1.7-.9 1.6-2.5 1.9-2.5.9-2.5 1.9.9 1.7 2.5 1.7 2.5-.7 2.5-1.7" />
  </svg>
);

const STEPS = [
  {
    n: 1,
    Icon: IconDoc,
    title: 'Tell Us About Your Banking',
    body: 'Share basic details about your current provider and usage. Takes < 1 minute. Anonymous.',
  },
  {
    n: 2,
    Icon: IconChart,
    title: 'Get Instant Benchmarks',
    body: 'See clear side-by-side comparisons across mortgages, loans, FX, cross-border fees & current account rates.',
  },
  {
    n: 3,
    Icon: IconDeal,
    title: 'Unlock Your Savings',
    body: 'Download the results, get a negotiation playbook, or select one of our advisors, negotiate on your behalf with your Bank.',
  },
];

export default function HowItWorks({ onGetStarted }) {
  return (
    <div className="hiw">
      <h2 className="section-title hiw__title">
        How <span className="accent-blue">Fee</span>Optima Works
      </h2>
      <p className="hiw__sub">Compare your Bank against the Best in the market to unlock your savings.</p>

      <div className="hiw__steps">
        {STEPS.map(({ n, Icon, title, body }) => (
          <article className="hiw-step" key={n}>
            <div className="hiw-step__marker">
              <div className="hiw-step__icon"><Icon /></div>
              <span className="hiw-step__num">{n}</span>
            </div>
            <div className="hiw-step__body">
              <h3 className="hiw-step__title">{title}</h3>
              <p className="hiw-step__text">{body}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="hiw__cta">
        <div>
          <strong>Ready to save?</strong>
          <span>Your free benchmark computes instantly — no sign-up.</span>
        </div>
        <button className="btn btn--primary" onClick={onGetStarted}>Calculate My Savings</button>
      </div>
    </div>
  );
}
