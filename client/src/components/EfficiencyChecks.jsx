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

  if (!questionnaires.length) return null;

  return (
    <section className="section effc" id="health-check">
      <div className="container">
        <h2 className="section-title">Free Treasury &amp; Operations Health Check</h2>
        <p className="section-sub">
          Two-minute assessments that score how efficient your banking setup is — and where an expert
          can unlock quick wins.
        </p>

        <p className="effc__segment">For SMEs &amp; Corporates</p>

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

      {active && (
        <QuestionnaireModal
          questionnaire={active}
          onClose={() => {
            setActive(null);
            // Drop a deep link once used, so following it again reopens it.
            if (/^#health-check\//.test(window.location.hash)) {
              window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#health-check`);
            }
          }}
        />
      )}
    </section>
  );
}
