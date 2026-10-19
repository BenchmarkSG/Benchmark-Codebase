import { useEffect, useState } from 'react';
import './EfficiencyChecks.css';
import { getReference } from '../api.js';
import QuestionnaireModal from './QuestionnaireModal.jsx';

// The two assessments' logos (same files as the booking confirmation's circles).
const LOGOS = {
  treasury_efficiency: '/images/treasury-efficiency.png',
  operational_efficiency: '/images/operational-efficiency.png',
  personal_wealth: '/images/personal-wealth.png',
};

// Who each group of cards is for, in the order they sit on the page.
const GROUPS = [
  { segment: 'sme', label: 'For SMEs & Corporates' },
  { segment: 'individual', label: 'For Individuals' },
];


/* SME/corporate treasury & operations health checks — a short questionnaire that
   returns a maturity score and routes to an expert. Not a rate benchmark. */
export default function EfficiencyChecks() {
  const [questionnaires, setQuestionnaires] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    getReference().then((r) => setQuestionnaires(r.questionnaires || [])).catch(() => {});
  }, []);

  // Deep link: #health-check/<questionnaire id> scrolls here and opens that
  // assessment (the confirmation screen links to both).
  useEffect(() => {
    if (!questionnaires.length) return undefined;
    const openFromHash = () => {
      const m = window.location.hash.match(/^#health-check\/([\w-]+)$/);
      if (!m) return;
      const q = questionnaires.find((x) => x.id === m[1]);
      if (!q) return;
      document.getElementById('health-check')?.scrollIntoView({ behavior: 'smooth' });
      setActive(q);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [questionnaires]);

  const closeActive = () => {
    setActive(null);
    // Drop a deep link once used, so following it again reopens it.
    if (/^#health-check\//.test(window.location.hash)) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#health-check`);
    }
  };

  if (!questionnaires.length) return null;

  return (
    <section className="section effc" id="health-check">
      <div className="container">
        <h2 className="section-title">Free Treasury &amp; Operations Health Check</h2>
        <p className="section-sub">
          Two-minute assessments that score how efficient your banking setup is — and where an expert
          can unlock quick wins.
        </p>

        {/* One column per audience, each with its own heading: the SME checks
            on the left, the personal scorecard on the right. */}
        <div className="effc__groups">
          {GROUPS.map((g) => {
            const list = questionnaires.filter((q) => (q.segment || 'sme') === g.segment);
            if (!list.length) return null;
            return (
              <div key={g.segment} className={`effc__group effc__group--${g.segment}`} style={{ '--cols': list.length }}>
                <h3 className="effc__segment">{g.label}</h3>
                <div className="effc__grid">
                  {list.map((q) => (
                    <button key={q.id} className="effc__card" onClick={() => setActive(q)}>
                      <span className={`effc__icon${LOGOS[q.id] ? ' effc__icon--logo' : ''}${q.id === 'personal_wealth' ? ' effc__icon--badge' : ''}`} aria-hidden="true">
                        {LOGOS[q.id] ? <img src={LOGOS[q.id]} alt="" width="34" height="34" /> : '📋'}
                      </span>
                      <span className="effc__body">
                        <span className="effc__title">{q.label}</span>
                        <span className="effc__desc">{q.intro}</span>
                      </span>
                      <span className="effc__cta">Start assessment →</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Every check, the personal scorecard included, runs in the same pop-up:
          instructions, then one question at a time, then the score. */}
      {active && <QuestionnaireModal questionnaire={active} onClose={closeActive} />}
    </section>
  );
}
