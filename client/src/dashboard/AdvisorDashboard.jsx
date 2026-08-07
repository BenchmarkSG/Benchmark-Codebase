import { useEffect, useMemo, useState } from 'react';
import './advisorDashboard.css';
import DashboardLayout from './DashboardLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdvisorRow } from '../hooks/useAdvisorRow.js';
import { formatMoney } from '../api.js';
import { ADVISOR_SEGMENTS, ADVISOR_PRODUCTS, ADVISOR_SPECIALIZATIONS } from '../lib/advisorFields.js';
import { listAssignedLeads, updateLead, updateMyAdvisor } from '../lib/dashboardApi.js';

const LEAD_STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'closed_won', label: 'Won' },
  { key: 'closed_lost', label: 'Lost' },
];
const OPEN = ['new', 'contacted', 'negotiating'];

export default function AdvisorDashboard() {
  const { user } = useAuth();
  const { advisor, loading, refresh } = useAdvisorRow();

  return (
    <DashboardLayout eyebrow="Advisor workspace" title="Advisor dashboard">
      {!user ? null : loading ? (
        <p className="dash__note">Loading…</p>
      ) : !advisor ? (
        <div className="dash__empty">
          <div className="dash__empty-icon">🧑‍💼</div>
          <h3>You’re not registered as an advisor yet</h3>
          <p>Apply to join as a founding advisor and get matched with clients who need your expertise.</p>
          <a className="btn btn--primary" href="#top">Apply to become an advisor →</a>
        </div>
      ) : (
        <AdvisorWorkspace advisor={advisor} onProfileSaved={refresh} />
      )}
    </DashboardLayout>
  );
}

function StatusBanner({ advisor }) {
  const s = advisor.status || 'pending';
  const map = {
    pending: { icon: '⏳', title: 'Application under review', text: 'Our team is reviewing your details. You’ll be matched with clients once approved.' },
    approved: { icon: '✅', title: 'Approved advisor', text: 'You’re live in the directory and can receive client leads.' },
    rejected: { icon: '🚫', title: 'Application not approved', text: 'Reach out if you think this was a mistake.' },
  };
  const m = map[s] || map.pending;
  return (
    <div className={`adv-status adv-status--${s}`}>
      <span className="adv-status__icon">{m.icon}</span>
      <div>
        <div className="adv-status__title">
          {m.title}
          <span className="adv-status__badge">🏅 Founding advisor</span>
        </div>
        <div className="adv-status__text">{m.text}</div>
      </div>
    </div>
  );
}

function AdvisorWorkspace({ advisor, onProfileSaved }) {
  const [tab, setTab] = useState('overview');
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    listAssignedLeads(advisor.id).then(setLeads).catch((e) => { setError(e.message || 'Could not load leads.'); setLeads([]); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [advisor.id]);

  const open = useMemo(() => (leads || []).filter((l) => OPEN.includes(l.stage)), [leads]);
  const won = useMemo(() => (leads || []).filter((l) => l.stage === 'closed_won'), [leads]);
  const bookings = useMemo(() => (leads || []).filter((l) => l.booked && OPEN.includes(l.stage)), [leads]);
  const delivered = won.reduce((s, l) => s + (Number(l.saved_amount) || 0), 0);
  const fees = won.reduce((s, l) => s + (Number(l.fee_amount) || 0), 0);
  const pipeline = open.reduce((s, l) => s + (Number(l.annual_saving) || 0), 0);

  const patchLead = async (lead, patch) => {
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, ...patch } : l)));
    try { await updateLead(lead.id, patch); } catch { load(); }
  };

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'leads', label: 'Leads', count: open.length },
    { key: 'bookings', label: 'Bookings', count: bookings.length },
    { key: 'profile', label: 'Profile' },
  ];

  return (
    <>
      <StatusBanner advisor={advisor} />

      <div className="dash__tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`dash__tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}{t.count != null && <span className="dash__tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {error && <p className="dash__err">{error}</p>}

      {tab === 'overview' && (
        <div className="dash__grid dash__cards-3">
          <div className="dash-card"><div className="dash-card__label">Open pipeline / yr</div>
            <div className="dash-card__big dash-card__big--accent">{formatMoney(Math.round(pipeline), 'SGD')}</div>
            <div className="dash-card__sub">{open.length} active lead(s)</div></div>
          <div className="dash-card"><div className="dash-card__label">Savings delivered</div>
            <div className="dash-card__big">{formatMoney(Math.round(delivered), 'SGD')}</div>
            <div className="dash-card__sub">{won.length} client(s) won</div></div>
          <div className="dash-card"><div className="dash-card__label">Fees earned</div>
            <div className="dash-card__big">{formatMoney(Math.round(fees), 'SGD')}</div>
            <div className="dash-card__sub">Success-fee model</div></div>
        </div>
      )}

      {tab === 'leads' && (
        <LeadList leads={leads} filter={(l) => l.stage !== 'closed_lost'} onPatch={patchLead} emptyText="No client leads yet. Approved advisors appear in the expert picker; matched requests show up here." />
      )}

      {tab === 'bookings' && (
        <LeadList leads={leads} filter={(l) => l.booked} onPatch={patchLead} showCalendly advisor={advisor}
          emptyText="No bookings yet. When a client books a call, it appears here." />
      )}

      {tab === 'profile' && <ProfileEditor advisor={advisor} onSaved={onProfileSaved} />}
    </>
  );
}

function LeadList({ leads, filter, onPatch, emptyText, showCalendly, advisor }) {
  if (leads == null) return <p className="dash__note">Loading…</p>;
  const rows = leads.filter(filter);
  if (!rows.length) {
    return <div className="dash__empty"><div className="dash__empty-icon">📥</div><h3>Nothing here yet</h3><p>{emptyText}</p></div>;
  }
  return (
    <div className="alead__list">
      {rows.map((l) => (
        <article className="alead" key={l.id}>
          <div className="alead__head">
            <div>
              <div className="alead__name">{l.full_name || 'Client'}{l.company ? ` · ${l.company}` : ''}</div>
              <div className="alead__meta">
                {l.product_label || l.product || 'Enquiry'} · {new Date(l.created_at).toLocaleDateString()}
                {l.annual_saving ? ` · opportunity ${formatMoney(Math.round(l.annual_saving), 'SGD')}/yr` : ''}
              </div>
            </div>
            <span className={`alead__pill alead__pill--${l.stage}`}>{LEAD_STAGES.find((s) => s.key === l.stage)?.label || l.stage}</span>
          </div>

          <div className="alead__contact">
            {l.email && <a href={`mailto:${l.email}`}>✉ {l.email}</a>}
            {l.phone && <a href={`https://wa.me/${String(l.phone).replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">💬 {l.phone}</a>}
          </div>
          {l.message && <p className="alead__msg">“{l.message}”</p>}

          {showCalendly && advisor?.calendly_url && (
            <a className="alead__cal" href={advisor.calendly_url} target="_blank" rel="noreferrer">Open scheduling link ↗</a>
          )}

          <div className="alead__stages">
            {LEAD_STAGES.map((s) => (
              <button key={s.key} className={`alead__stage ${l.stage === s.key ? 'is-current' : ''}`} onClick={() => onPatch(l, { stage: s.key })}>
                {s.label}
              </button>
            ))}
          </div>
          {l.stage === 'closed_won' && (
            <div className="alead__won">
              <label>Savings delivered <input type="number" min="0" step="100" value={l.saved_amount ?? ''} onChange={(e) => onPatch(l, { saved_amount: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <label>Success fee <input type="number" min="0" step="50" value={l.fee_amount ?? ''} onChange={(e) => onPatch(l, { fee_amount: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function ProfileEditor({ advisor, onSaved }) {
  const [form, setForm] = useState({
    company: advisor.company || '',
    years_experience: advisor.years_experience ?? '',
    serves: advisor.serves || 'both',
    specialization: advisor.specialization || '',
    description: advisor.description || '',
    calendly_url: advisor.calendly_url || '',
  });
  const [products, setProducts] = useState(advisor.products || []);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (p) => setProducts((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setSaved(false);
    try {
      await updateMyAdvisor(advisor.id, {
        company: form.company.trim() || null,
        years_experience: form.years_experience === '' ? null : Number(form.years_experience),
        serves: form.serves,
        specialization: form.specialization || null,
        description: form.description.trim() || null,
        calendly_url: form.calendly_url.trim() || null,
        products,
      });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <form className="aprof" onSubmit={save}>
      <p className="aprof__note">This is how clients see you in the expert picker. Your name and email are fixed — contact support to change them.</p>
      <div className="aprof__row">
        <label className="aprof__field"><span>Company / background</span>
          <input value={form.company} onChange={set('company')} placeholder="ex-DBS" /></label>
        <label className="aprof__field"><span>Years of experience</span>
          <input type="number" min="0" value={form.years_experience} onChange={set('years_experience')} /></label>
      </div>
      <div className="aprof__row">
        <label className="aprof__field"><span>Serves</span>
          <select value={form.serves} onChange={set('serves')}>
            {ADVISOR_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select></label>
        <label className="aprof__field"><span>Specialization</span>
          <select value={form.specialization} onChange={set('specialization')}>
            <option value="">Select…</option>
            {ADVISOR_SPECIALIZATIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
      </div>
      <label className="aprof__field"><span>Calendly / scheduling link</span>
        <input value={form.calendly_url} onChange={set('calendly_url')} placeholder="https://calendly.com/you/intro" /></label>
      <label className="aprof__field"><span>Bio</span>
        <textarea rows={3} value={form.description} onChange={set('description')} placeholder="Your background, notable deals, how you help clients." /></label>

      <div className="aprof__field">
        <span>Products you cover</span>
        <div className="aprof__chips">
          {ADVISOR_PRODUCTS.map((p) => (
            <label key={p} className={`aprof__chip ${products.includes(p) ? 'is-on' : ''}`}>
              <input type="checkbox" checked={products.includes(p)} onChange={() => toggle(p)} />{p}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="dash__err">{error}</p>}
      <div className="aprof__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        {saved && <span className="aprof__saved">Saved ✓</span>}
      </div>
    </form>
  );
}
