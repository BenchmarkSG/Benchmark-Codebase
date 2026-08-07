import { useEffect, useState } from 'react';
import './EfficiencyChecks.css';
import { getReference } from '../api.js';
import QuestionnaireModal from './QuestionnaireModal.jsx';

const ICONS = { treasury_efficiency: '🏦', operational_efficiency: '⚙️' };

/* SME/corporate treasury & operations health checks — a short questionnaire that
   returns a maturity score and routes to an expert. Not a rate benchmark. */
export default function EfficiencyChecks() {
  const [questionnaires, setQuestionnaires] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    getReference().then((r) => setQuestionnaires(r.questionnaires || [])).catch(() => {});
  }, []);

  if (!questionnaires.length) return null;

  return (
    <section className="section effc" id="health-check">
      <div className="container">
        <span className="eyebrow effc__eyebrow">For SMEs &amp; Corporates</span>
        <h2 className="section-title">Free Treasury &amp; Operations Health Check</h2>
        <p className="section-sub">
          Two-minute assessments that score how efficient your banking setup is — and where an expert
          can unlock quick wins.
        </p>

        <div className="effc__grid">
          {questionnaires.map((q) => (
            <button key={q.id} className="effc__card" onClick={() => setActive(q)}>
              <span className="effc__icon">{ICONS[q.id] || '📋'}</span>
              <span className="effc__body">
                <span className="effc__title">{q.label}</span>
                <span className="effc__desc">{q.intro}</span>
              </span>
              <span className="effc__cta">Start assessment →</span>
            </button>
          ))}
        </div>
      </div>

      {active && <QuestionnaireModal questionnaire={active} onClose={() => setActive(null)} />}
    </section>
  );
}
