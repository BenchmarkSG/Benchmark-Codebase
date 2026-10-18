import { useEffect, useMemo, useState } from 'react';
import AvatarPicker from '../components/AvatarPicker.jsx';
import { expertAvatar } from '../lib/avatars.js';
import './advisorDashboard.css';
import DashboardLayout from './DashboardLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdvisorRow } from '../hooks/useAdvisorRow.js';
import { formatMoney } from '../api.js';
import { ADVISOR_SEGMENTS, ADVISOR_PRODUCTS, ADVISOR_SPECIALIZATIONS } from '../lib/advisorFields.js';
import { listAssignedLeads, updateLead, updateMyAdvisor } from '../lib/dashboardApi.js';
import { safeHttpUrl, calendlyUrl } from '../lib/safeUrl.js';
import { formatDate } from '../lib/formatDate.js';
import { friendlyError } from '../lib/friendlyError.js';
import AccountSettings from './AccountSettings.jsx';

// Advisor workspace tabs — kept in the URL hash (#advisor/<tab>) so refresh and
// the browser Back button work and tabs are deep-linkable.
const TAB_KEYS = ['overview', 'clients', 'bookings', 'earnings', 'resources', 'profile', 'account'];
const readTabFromHash = () => {
  const seg = (window.location.hash.replace(/^#\/?/, '').split('/')[1] || 'overview');
  return TAB_KEYS.includes(seg) ? seg : 'overview';
};

const LEAD_STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'closed_won', label: 'Won' },
  { key: 'closed_lost', label: 'Lost' },
];
const OPEN = ['new', 'contacted', 'negotiating'];
const NEXT_ACTION = {
  new: 'New case', contacted: 'Follow up', negotiating: 'In negotiation',
  closed_won: 'Won', closed_lost: 'Lost',
};

// Advisor tiers by lifetime success fees earned.
const TIERS = [
  { key: 'Bronze', min: 0 }, { key: 'Silver', min: 5000 },
  { key: 'Gold', min: 15000 }, { key: 'Platinum', min: 30000 },
];
function tierFor(earned) {
  let cur = TIERS[0], next = null;
  for (let i = 0; i < TIERS.length; i++) {
    if (earned >= TIERS[i].min) { cur = TIERS[i]; next = TIERS[i + 1] || null; }
  }
  return { cur, next };
}

// Deterministic, rules-based opening suggestion (NOT a live bank conversation).
function suggestionFor(lead) {
  const opp = Number(lead.annual_saving) || 0;
  const label = (lead.product_label || lead.product || 'this facility').toLowerCase();
  const target = opp > 0 ? formatMoney(Math.round(opp), 'SGD') : 'the benchmarked gap';
  if (/fx|cross|remit|transfer/.test(label))
    return `Anchor on the mid-market rate: quantify the FX margin they’re paying and propose a flat per-transfer fee. Target ${target}/yr in savings.`;
  if (/loan|mortgage|housing/.test(label))
    return `Frame around retention — good borrowers reprice. Ask for a board-rate cut matching the market best; the client stands to save ${target}/yr.`;
  if (/overdraft|current|deposit|fixed/.test(label))
    return `Bundle the ask: better spread in exchange for consolidating balances. The opportunity here is ${target}/yr.`;
  return `Open by anchoring to the best-in-market rate and frame the ask around retention. Opportunity: ${target}/yr.`;
}

export default function AdvisorDashboard() {
  const { user } = useAuth();
  const { advisor, loading, refresh } = useAdvisorRow();

  return (
    <DashboardLayout eyebrow="Advisor workspace" title={`Welcome${advisor?.full_name ? `, ${advisor.full_name.split(' ')[0]}` : ''}!`}>
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
  const [tab, setTabState] = useState(readTabFromHash);
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // Keep the active tab in the URL hash so refresh / Back behave correctly.
  useEffect(() => {
    const on = () => setTabState(readTabFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const setTab = (t) => { window.location.hash = t === 'overview' ? 'advisor' : `advisor/${t}`; };

  const failFlash = () => { setFlash('Couldn’t save that change — please try again.'); setTimeout(() => setFlash(''), 3500); };

  const load = () => {
    listAssignedLeads(advisor.id).then(setLeads).catch((e) => { setError(e.message || 'Could not load leads.'); setLeads([]); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [advisor.id]);

  const m = useMemo(() => {
    const list = leads || [];
    const open = list.filter((l) => OPEN.includes(l.stage));
    const won = list.filter((l) => l.stage === 'closed_won');
    const lost = list.filter((l) => l.stage === 'closed_lost');
    const bookings = list.filter((l) => l.booked && OPEN.includes(l.stage));
    const delivered = won.reduce((s, l) => s + (Number(l.saved_amount) || 0), 0);
    const fees = won.reduce((s, l) => s + (Number(l.fee_amount) || 0), 0);
    const pipeline = open.reduce((s, l) => s + (Number(l.annual_saving) || 0), 0);
    const closed = won.length + lost.length;
    const successRate = closed ? Math.round((won.length / closed) * 100) : null;
    const now = new Date();
    const thisMonth = won
      .filter((l) => { const d = new Date(l.updated_at || l.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
      .reduce((s, l) => s + (Number(l.fee_amount) || 0), 0);
    return { list, open, won, lost, bookings, delivered, fees, pipeline, successRate, thisMonth };
  }, [leads]);

  const patchLead = async (lead, patch) => {
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, ...patch } : l)));
    try { await updateLead(lead.id, patch); } catch { failFlash(); load(); }
  };
  // Local-only update (for text inputs) — persisted separately on blur.
  const patchLocal = (lead, patch) => setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, ...patch } : l)));

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'clients', label: 'Clients', count: m.open.length },
    { key: 'bookings', label: 'Bookings', count: m.bookings.length },
    { key: 'earnings', label: 'Earnings' },
    { key: 'resources', label: 'Resources' },
    { key: 'profile', label: 'Public profile' },
    { key: 'account', label: 'Account settings' },
  ];

  return (
    <>
      <StatusBanner advisor={advisor} />
      <p className="dash__subtitle">Negotiate better deals, earn more rewards.</p>

      <div className="dash__tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`dash__tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}{t.count != null && <span className="dash__tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {error && <p className="dash__err">{error}</p>}
      {flash && <div className="dash__flash" role="status">{flash}</div>}

      {tab === 'overview' && <Overview advisor={advisor} leads={leads} m={m} onPatch={patchLead} onGoto={setTab} />}
      {tab === 'clients' && (
        <LeadList leads={leads} filter={(l) => l.stage !== 'closed_lost'} onPatch={patchLead} onLocalPatch={patchLocal}
          emptyText="No client leads yet. Approved advisors appear in the expert picker; matched requests show up here." />
      )}
      {tab === 'bookings' && (
        <LeadList leads={leads} filter={(l) => l.booked} onPatch={patchLead} onLocalPatch={patchLocal} showCalendly advisor={advisor}
          emptyText="No bookings yet. When a client books a call, it appears here." />
      )}
      {tab === 'earnings' && <Earnings m={m} />}
      {tab === 'resources' && <Resources />}
      {tab === 'profile' && <ProfileEditor advisor={advisor} onSaved={onProfileSaved} />}
      {tab === 'account' && (
        <AccountSettings
          role="advisor"
          onProfileSaved={onProfileSaved}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Overview -- */
function Overview({ advisor, leads, m, onPatch, onGoto }) {
  const active = useMemo(() => {
    const by = { negotiating: 0, contacted: 1, new: 2 };
    return [...m.open].sort((a, b) => (by[a.stage] ?? 9) - (by[b.stage] ?? 9))[0] || null;
  }, [m.open]);
  const { cur, next } = tierFor(m.fees);
  const progress = next ? Math.min(100, Math.round(((m.fees - cur.min) / (next.min - cur.min)) * 100)) : 100;

  return (
    <>
      {/* KPI strip */}
      <div className="adv-kpis">
        <StatPill tone="blue"  label="Clients assigned" value={m.list.length} />
        <StatPill tone="teal"  label="Open pipeline / yr" value={formatMoney(Math.round(m.pipeline), 'SGD')} />
        <StatPill tone="green" label="Fees earned" value={formatMoney(Math.round(m.fees), 'SGD')} />
        <StatPill tone="amber" label="Success rate" value={m.successRate == null ? '—' : `${m.successRate}%`} />
        <StatPill tone="navy"  label="This month" value={formatMoney(Math.round(m.thisMonth), 'SGD')} />
      </div>

      <div className="adv-grid">
        {/* Assigned clients preview */}
        <section className="dash-card adv-panel">
          <div className="adv-panel__head"><h2>Assigned clients</h2>
            {m.list.length > 0 && <button className="adv-panel__link" onClick={() => onGoto('clients')}>View all →</button>}</div>
          {leads == null ? <p className="dash__note">Loading…</p> : m.list.length === 0 ? (
            <p className="dash__note">No clients assigned yet.</p>
          ) : (
            <ul className="adv-mini">
              {m.list.slice(0, 6).map((l) => (
                <li key={l.id}>
                  <span className={`adv-mini__dot adv-mini__dot--${l.stage}`} aria-hidden="true" />
                  <span className="adv-mini__name">{l.full_name || l.company || 'Client'}</span>
                  <span className={`adv-mini__action adv-mini__action--${l.stage}`}>{NEXT_ACTION[l.stage] || l.stage}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Active negotiation */}
        <section className="dash-card adv-panel">
          <div className="adv-panel__head"><h2>Active negotiation</h2></div>
          {!active ? (
            <p className="dash__note">No active negotiation. Move a client to “Negotiating” to focus it here.</p>
          ) : (
            <div className="adv-neg">
              <div className="adv-neg__who">
                <strong>{active.full_name || active.company || 'Client'}</strong>
                <span>{active.product_label || active.product || 'Enquiry'}{active.annual_saving ? ` · ${formatMoney(Math.round(active.annual_saving), 'SGD')}/yr opportunity` : ''}</span>
              </div>
              <div className="adv-neg__tip"><span className="adv-neg__tip-label">💡 Suggested opening</span>{suggestionFor(active)}</div>
              <div className="adv-neg__stages">
                {LEAD_STAGES.map((s) => (
                  <button key={s.key} className={`alead__stage ${active.stage === s.key ? 'is-current' : ''}`}
                    aria-current={active.stage === s.key ? 'step' : undefined} aria-label={`Set stage: ${s.label}`}
                    onClick={() => onPatch(active, { stage: s.key })}>{s.label}</button>
                ))}
              </div>
              <button className="adv-panel__link" onClick={() => onGoto('resources')}>Open negotiation scripts →</button>
            </div>
          )}
        </section>

        {/* Earnings + tier */}
        <section className="dash-card adv-panel">
          <div className="adv-panel__head"><h2>Earnings overview</h2></div>
          <div className="adv-earn">
            <div className="adv-earn__row"><span>This month</span><strong>{formatMoney(Math.round(m.thisMonth), 'SGD')}</strong></div>
            <div className="adv-earn__row"><span>Total earnings</span><strong>{formatMoney(Math.round(m.fees), 'SGD')}</strong></div>
            <div className="adv-tier">
              <span className={`adv-tier__badge adv-tier__badge--${cur.key.toLowerCase()}`}>🏅 {cur.key} advisor</span>
              {next && <span className="adv-tier__next">{formatMoney(Math.round(next.min - m.fees), 'SGD')} to {next.key}</span>}
            </div>
            <div className="adv-tier__track"><div className="adv-tier__fill" style={{ width: `${progress}%` }} /></div>
          </div>
        </section>

        {/* Standing (honest, self-anchored — no fabricated peers) */}
        <section className="dash-card adv-panel">
          <div className="adv-panel__head"><h2>Your standing</h2></div>
          <ul className="adv-stand">
            <li><span>Clients won</span><strong>{m.won.length}</strong></li>
            <li><span>Savings delivered</span><strong>{formatMoney(Math.round(m.delivered), 'SGD')}</strong></li>
            <li><span>Success rate</span><strong>{m.successRate == null ? '—' : `${m.successRate}%`}</strong></li>
          </ul>
          <p className="adv-stand__note">Peer leaderboard unlocks as the advisor network grows.</p>
        </section>
      </div>
    </>
  );
}

function StatPill({ tone, label, value }) {
  return (
    <div className={`adv-kpi adv-kpi--${tone}`}>
      <div className="adv-kpi__value">{value}</div>
      <div className="adv-kpi__label">{label}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- Earnings -- */
function Earnings({ m }) {
  const { cur, next } = tierFor(m.fees);
  const progress = next ? Math.min(100, Math.round(((m.fees - cur.min) / (next.min - cur.min)) * 100)) : 100;
  return (
    <>
      <div className="dash__grid dash__cards-3">
        <div className="dash-card"><div className="dash-card__label">This month</div>
          <div className="dash-card__big dash-card__big--accent">{formatMoney(Math.round(m.thisMonth), 'SGD')}</div>
          <div className="dash-card__sub">Success fees closed this month</div></div>
        <div className="dash-card"><div className="dash-card__label">Total earnings</div>
          <div className="dash-card__big">{formatMoney(Math.round(m.fees), 'SGD')}</div>
          <div className="dash-card__sub">{m.won.length} client(s) won</div></div>
        <div className="dash-card"><div className="dash-card__label">Savings delivered</div>
          <div className="dash-card__big">{formatMoney(Math.round(m.delivered), 'SGD')}</div>
          <div className="dash-card__sub">Value created for clients</div></div>
      </div>

      <div className="dash-card adv-panel" style={{ marginTop: 16 }}>
        <div className="adv-panel__head"><h2>Tier progress</h2>
          <span className={`adv-tier__badge adv-tier__badge--${cur.key.toLowerCase()}`}>🏅 {cur.key}</span></div>
        <div className="adv-tier__track"><div className="adv-tier__fill" style={{ width: `${progress}%` }} /></div>
        <p className="dash-card__sub" style={{ marginTop: 8 }}>
          {next ? `${formatMoney(Math.round(next.min - m.fees), 'SGD')} in fees to reach ${next.key}.` : 'Top tier reached — Platinum advisor. 🎉'}
        </p>
      </div>

      <h2 className="dash__section-title">Closed deals</h2>
      {m.won.length === 0 ? (
        <div className="dash__empty"><div className="dash__empty-icon">💰</div><h3>No closed deals yet</h3><p>Won leads with a recorded success fee appear here.</p></div>
      ) : (
        <div className="adv-deals">
          {m.won.map((l) => (
            <div className="adv-deals__row" key={l.id}>
              <span className="adv-deals__name">{l.full_name || l.company || 'Client'}</span>
              <span className="adv-deals__prod">{l.product_label || l.product || '—'}</span>
              <span className="adv-deals__save">{formatMoney(Math.round(Number(l.saved_amount) || 0), 'SGD')} saved</span>
              <span className="adv-deals__fee">{formatMoney(Math.round(Number(l.fee_amount) || 0), 'SGD')} fee</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* --------------------------------------------------------------- Resources -- */
const SCRIPTS = [
  { key: 'fx', title: 'Cross-border & FX fees', points: [
    'Separate the visible fee from the hidden FX margin — quantify both against the mid-market rate.',
    'Ask for a flat per-transfer fee tied to annual volume rather than a percentage.',
    'Use a competitor’s live quote (Wise, another bank) as the anchor for the counter-offer.',
  ] },
  { key: 'loan', title: 'Loan rate discounts', points: [
    'Frame around retention: good borrowers reprice — cite the current market-best board rate.',
    'Bundle the ask (salary crediting, insurance) in exchange for a spread cut.',
    'Get the revised rate in writing with the reset/lock-in terms spelled out.',
  ] },
  { key: 'deposit', title: 'Deposits & overdraft', points: [
    'Trade balance consolidation for a better FD promo or overdraft spread.',
    'For SMEs, tie the overdraft rate to steady turnover — most never ask.',
    'Benchmark the minimum charge, not just the headline rate.',
  ] },
];
const TIPS = [
  { title: 'Lead with the number', text: 'Open every negotiation with the quantified annual saving — it reframes the conversation around the client’s money, not the bank’s policy.' },
  { title: 'Anchor high, concede slowly', text: 'Ask for the market-best rate first. Banks expect to counter; leave room to land where the client still wins.' },
  { title: 'Always get it in writing', text: 'A verbal “we’ll see what we can do” isn’t a win. Confirm the revised rate, fee and effective date before closing the lead.' },
];
function Resources() {
  const [open, setOpen] = useState('fx');
  return (
    <div className="adv-grid adv-grid--2">
      <section className="dash-card adv-panel">
        <div className="adv-panel__head"><h2>Negotiation scripts</h2></div>
        <div className="adv-scripts">
          {SCRIPTS.map((s) => (
            <div className={`adv-script ${open === s.key ? 'is-open' : ''}`} key={s.key}>
              <button className="adv-script__head" onClick={() => setOpen(open === s.key ? '' : s.key)}>
                {s.title}<span aria-hidden="true">{open === s.key ? '−' : '+'}</span>
              </button>
              {open === s.key && (
                <ul className="adv-script__body">{s.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="dash-card adv-panel">
        <div className="adv-panel__head"><h2>Advisor tips &amp; updates</h2></div>
        <ul className="adv-tips">
          {TIPS.map((t, i) => (
            <li key={i}><strong>{t.title}</strong><span>{t.text}</span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Leads --- */
function LeadList({ leads, filter, onPatch, onLocalPatch, emptyText, showCalendly, advisor }) {
  if (leads == null) return <div className="dash__loading" role="status"><span className="dash__spinner" aria-hidden="true" /> Loading…</div>;
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
                {l.product_label || l.product || 'Enquiry'} · {formatDate(l.created_at)}
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

          {showCalendly && safeHttpUrl(advisor?.calendly_url) && (
            <a className="alead__cal" href={safeHttpUrl(advisor.calendly_url)} target="_blank" rel="noopener noreferrer">Open scheduling link ↗</a>
          )}

          <div className="alead__stages">
            {LEAD_STAGES.map((s) => (
              <button key={s.key} className={`alead__stage ${l.stage === s.key ? 'is-current' : ''}`}
                aria-current={l.stage === s.key ? 'step' : undefined} aria-label={`Set stage: ${s.label}`}
                onClick={() => onPatch(l, { stage: s.key })}>
                {s.label}
              </button>
            ))}
          </div>
          {l.stage === 'closed_won' && (
            <div className="alead__won">
              <label>Savings delivered
                <input type="number" min="0" step="100" value={l.saved_amount ?? ''}
                  onChange={(e) => onLocalPatch(l, { saved_amount: e.target.value })}
                  onBlur={(e) => onPatch(l, { saved_amount: e.target.value === '' ? null : Number(e.target.value) })} /></label>
              <label>Success fee
                <input type="number" min="0" step="50" value={l.fee_amount ?? ''}
                  onChange={(e) => onLocalPatch(l, { fee_amount: e.target.value })}
                  onBlur={(e) => onPatch(l, { fee_amount: e.target.value === '' ? null : Number(e.target.value) })} /></label>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- Profile ---- */
function ProfileEditor({ advisor, onSaved }) {
  const [form, setForm] = useState({
    company: advisor.company || '',
    years_experience: advisor.years_experience ?? '',
    serves: advisor.serves || 'both',
    specialization: advisor.specialization || '',
    description: advisor.description || '',
    calendly_url: advisor.calendly_url || '',
  });
  // The avatar clients see: one of the illustrated set (lib/avatars.js).
  const [avatar, setAvatar] = useState(() => expertAvatar(advisor));
  const [products, setProducts] = useState(advisor.products || []);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (p) => setProducts((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  const save = async (e) => {
    e.preventDefault();
    // Not optional: this link IS how clients reach you. Clearing it would drop
    // your bookings into the house scheduling link instead of your calendar.
    const cal = calendlyUrl(form.calendly_url);
    if (!cal) {
      setError('Add your Calendly scheduling link (e.g. https://calendly.com/your-name/intro) — clients book their call through it.');
      return;
    }
    setBusy(true); setError(''); setSaved(false);
    try {
      await updateMyAdvisor(advisor.id, {
        company: form.company.trim() || null,
        years_experience: form.years_experience === '' ? null : Number(form.years_experience),
        serves: form.serves,
        specialization: form.specialization || null,
        description: form.description.trim() || null,
        calendly_url: cal,
        products,
        photo_url: avatar,
      });
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(friendlyError(err, 'Could not save. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <form className="aprof" onSubmit={save}>
      <p className="aprof__note">This is how clients see you in the expert picker. Your name, mobile and password live in <strong>Account settings</strong>.</p>
      <div className="aprof__field"><span>Your avatar</span>
        <AvatarPicker value={avatar} onChange={setAvatar} /></div>
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
      <label className="aprof__field"><span>Calendly scheduling link <em className="aprof__req" aria-hidden="true">*</em></span>
        <input type="url" required value={form.calendly_url} onChange={set('calendly_url')} placeholder="https://calendly.com/you/intro" />
        <small className="aprof__hint">Clients book straight into your calendar through this. Without it we can’t show you in the expert picker.</small></label>
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
