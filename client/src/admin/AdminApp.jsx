import { useCallback, useEffect, useState } from 'react';
import './admin.css';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import EditableTable from './EditableTable.jsx';
import { INCOME_LABELS } from '../lib/profileFields.js';
import { SERVES_LABELS } from '../lib/advisorFields.js';
import { ADMIN_EMAIL } from '../lib/roles.js';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { formatDate } from '../lib/formatDate.js';
import { friendlyError } from '../lib/friendlyError.js';

// Cap how many rows we pull per table so large tables can't hang the portal.
const ROW_LIMIT = 500;

// A manually-maintained rate is "due for review" once it hasn't been edited or
// verified in this many days — surfaced in the portal so daily upkeep has a worklist.
const STALE_DAYS = 30;
const isDue = (r) => {
  if (!r.updated_at) return true;
  return (Date.now() - new Date(r.updated_at).getTime()) / 86400000 > STALE_DAYS;
};
const FRESHNESS_COL = { key: 'updated_at', label: 'Last verified', type: 'freshness' };

// Which tables the portal can edit, and how each row is shown/edited.
// NOTE: overdraft and loan/trade-finance rates now live in the unified
// `product_rates` table (the "Product rates" section). The old `overdraft_rates`
// and `loan_products` tables were retired in the v2 model, so their tabs were
// removed — the seeder no longer populates them.
const SECTIONS = [
  {
    key: 'remittance', title: 'Remittance charges', table: 'remittance_charges', pk: 'id', verifiable: true,
    select: 'id, direction, counterparty, upfront_fee, intermediary_fee, lifting_fee, fee_currency, fx_spread_pct, is_indicative, updated_at, banks!inner(name, country_code)',
    byCountry: 'banks.country_code',
    columns: [
      { key: 'bank', label: 'Bank', get: (r) => r.banks?.name },
      { key: 'direction', label: 'Dir' },
      { key: 'counterparty', label: 'To/From' },
      { key: 'upfront_fee', label: 'Upfront', type: 'number', step: 0.5, editable: true },
      { key: 'intermediary_fee', label: 'Interm.', type: 'number', step: 0.5, editable: true },
      { key: 'lifting_fee', label: 'Lifting', type: 'number', step: 0.5, editable: true },
      { key: 'fx_spread_pct', label: 'FX %', type: 'number', step: 0.01, editable: true },
      { key: 'is_indicative', label: 'Indicative', type: 'boolean', editable: true },
      FRESHNESS_COL,
    ],
  },
  {
    key: 'thresholds', title: 'Negotiation thresholds', table: 'negotiation_thresholds', pk: 'id', verifiable: true,
    select: 'id, product, target_saving, saving_currency, threshold_amount, switching_cost, switching_weeks, worthwhile, is_indicative, updated_at, country_code',
    byCountry: 'country_code',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'target_saving', label: 'Target', type: 'number', step: 100, editable: true },
      { key: 'threshold_amount', label: 'Threshold', type: 'number', step: 1000, editable: true },
      { key: 'switching_cost', label: 'Switch cost', type: 'number', step: 100, editable: true },
      { key: 'switching_weeks', label: 'Weeks', type: 'number', step: 1, editable: true },
      { key: 'worthwhile', label: 'Worthwhile', type: 'boolean', editable: true },
      { key: 'is_indicative', label: 'Indicative', type: 'boolean', editable: true },
      FRESHNESS_COL,
    ],
  },
  {
    key: 'product_rates', title: 'Product rates', table: 'product_rates', pk: 'id', verifiable: true,
    select: 'id, product, variant, bank, currency, rate, rate_type, is_indicative, updated_at, country_code',
    byCountry: 'country_code', order: 'product',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'variant', label: 'Variant' },
      { key: 'bank', label: 'Bank' },
      { key: 'currency', label: 'Ccy' },
      { key: 'rate', label: 'Rate %', type: 'number', step: 0.01, editable: true },
      { key: 'rate_type', label: 'Type' },
      { key: 'is_indicative', label: 'Indicative', type: 'boolean', editable: true },
      FRESHNESS_COL,
    ],
  },
  {
    // Custom view (not a generic table) — staged rate updates awaiting approval.
    key: 'proposals', title: 'Pending updates', custom: 'proposals', byCountry: 'country_code',
  },
  {
    key: 'treasury_profiles', title: 'Treasury health checks', table: 'treasury_profiles', pk: 'id',
    select: 'id, questionnaire, full_name, company, email, phone, score, band, created_at',
    order: 'created_at', desc: true, emptyText: 'No health-check submissions yet.',
    columns: [
      { key: 'questionnaire', label: 'Assessment' },
      { key: 'full_name', label: 'Name' },
      { key: 'company', label: 'Company' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'score', label: 'Score' },
      { key: 'band', label: 'Band' },
      { key: 'created_at', label: 'Submitted', get: (r) => (r.created_at ? formatDate(r.created_at) : '') },
    ],
  },
  {
    key: 'users', title: 'Registered users', table: 'user_profiles', pk: 'id',
    select: 'id, full_name, email, phone, monthly_income, created_at', order: 'created_at', desc: true,
    emptyText: 'No registered users yet.',
    columns: [
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone (WhatsApp)' },
      { key: 'monthly_income', label: 'Monthly income', get: (r) => INCOME_LABELS[r.monthly_income] || r.monthly_income },
      { key: 'created_at', label: 'Registered', get: (r) => (r.created_at ? formatDate(r.created_at) : '') },
    ],
  },
  {
    key: 'advisors', title: 'Advisor applications', table: 'advisors', pk: 'id',
    select: 'id, full_name, email, phone, serves, specialization, company, years_experience, products, photo_url, status, created_at',
    order: 'created_at', desc: true, emptyText: 'No advisor applications yet.',
    columns: [
      { key: 'full_name', label: 'Name / Company' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'serves', label: 'Serves', get: (r) => SERVES_LABELS[r.serves] || r.serves },
      { key: 'specialization', label: 'Specialization' },
      { key: 'company', label: 'Bank / Company' },
      { key: 'years_experience', label: 'Yrs' },
      { key: 'products', label: 'Products', get: (r) => (r.products || []).join(', ') },
      { key: 'photo_url', label: 'Photo', type: 'link' },
      { key: 'status', label: 'Status', type: 'text', editable: true },
      { key: 'created_at', label: 'Applied', get: (r) => (r.created_at ? formatDate(r.created_at) : '') },
    ],
  },
  {
    key: 'banks', title: 'Banks', table: 'banks', pk: 'id',
    select: 'id, name, category, display_order, country_code', byCountry: 'country_code', order: 'display_order',
    columns: [
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'category', label: 'Category', type: 'text', editable: true },
      { key: 'display_order', label: 'Order', type: 'number', step: 1, editable: true },
    ],
  },
  {
    key: 'countries', title: 'Countries', table: 'countries', pk: 'code',
    select: 'code, name, currency, currency_symbol, display_order', order: 'display_order',
    columns: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name', type: 'text', editable: true },
      { key: 'currency', label: 'Currency', type: 'text', editable: true },
      { key: 'currency_symbol', label: 'Symbol', type: 'text', editable: true },
      { key: 'display_order', label: 'Order', type: 'number', step: 1, editable: true },
    ],
  },
];

function LoginGate() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { error } = await signInWithEmail(email.trim(), password);
      if (error) throw error;
    } catch (err) {
      setError(friendlyError(err, 'Sign in failed. Check your email and password.'));
      setBusy(false);
    }
  };

  return (
    <div className="adm-login">
      <form className="adm-login__card" onSubmit={submit}>
        <div className="adm-login__brand"><span>Fee</span>Optima · Admin</div>
        <h1>Admin sign in</h1>
        <p className="adm-login__sub">Restricted area. Authorised administrators only.</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@benchmark.com" autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <div className="adm-error" role="alert">{error}</div>}
        <button className="adm-btn adm-btn--save adm-login__submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a className="adm-login__back" href="/">← Back to site</a>
      </form>
    </div>
  );
}

function Section({ config, country }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setRows(null); setError('');
    let q = supabase.from(config.table).select(config.select);
    if (config.byCountry && country) q = q.eq(config.byCountry, country);
    if (config.order) q = q.order(config.order, { ascending: !config.desc });
    q = q.limit(ROW_LIMIT);
    const { data, error } = await q;
    if (error) setError(error.message);
    else setRows(data);
  }, [config, country]);

  useEffect(() => { load(); }, [load]);

  const rlsError = (error) => (/row-level security/i.test(error.message)
    ? new Error('Write blocked by RLS — run supabase/admin.sql and sign in as the admin.')
    : error);

  const onSave = async (row, patch) => {
    const { error } = await supabase.from(config.table).update(patch).eq(config.pk, row[config.pk]);
    if (error) throw rlsError(error);
    // The DB trigger bumps updated_at on any edit; mirror that locally for the chip.
    const stamp = config.verifiable ? { updated_at: new Date().toISOString() } : {};
    setRows((rs) => rs.map((r) => (r[config.pk] === row[config.pk] ? { ...r, ...patch, ...stamp } : r)));
  };

  // Verify = "I checked the source, this rate is still current." Writes a no-op
  // the updated_at trigger turns into a fresh timestamp.
  const onVerify = async (row) => {
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from(config.table).update({ updated_at: nowIso }).eq(config.pk, row[config.pk]);
    if (error) throw rlsError(error);
    setRows((rs) => rs.map((r) => (r[config.pk] === row[config.pk] ? { ...r, updated_at: nowIso } : r)));
  };

  if (error) return <div className="adm-error" role="alert">{error}</div>;
  if (!rows) return <div className="adm-loading"><span className="dash__spinner" aria-hidden="true" /> Loading…</div>;

  const dueCount = config.verifiable ? rows.filter(isDue).length : 0;
  const dueFiltered = showDueOnly ? rows.filter(isDue) : rows;
  const term = query.trim().toLowerCase();
  const visibleRows = !term ? dueFiltered : dueFiltered.filter((r) =>
    config.columns.some((c) => String((c.get ? c.get(r) : r[c.key]) ?? '').toLowerCase().includes(term)));

  const emptyLabel = rows.length === 0
    ? (config.emptyText || 'No rows yet.')
    : (showDueOnly && dueFiltered.length === 0)
      ? 'All caught up — nothing is due for review. 🎉'
      : term
        ? `No rows match “${query}”.`
        : 'Nothing to show.';

  return (
    <>
      <div className="adm-controls">
        <input
          className="adm-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${config.title.toLowerCase()}…`} aria-label={`Search ${config.title}`}
        />
        {rows.length >= ROW_LIMIT && <span className="adm-controls__note">Showing first {ROW_LIMIT} — refine with search.</span>}
      </div>
      {config.verifiable && (
        <div className="adm-freshbar">
          <span className={`adm-freshbar__count ${dueCount ? 'is-due' : ''}`}>
            {dueCount} of {rows.length} due for review (not verified in &gt;{STALE_DAYS} days)
          </span>
          <label className="adm-freshbar__toggle">
            <input type="checkbox" checked={showDueOnly} onChange={(e) => setShowDueOnly(e.target.checked)} />
            Show only due for review
          </label>
        </div>
      )}
      <p className="adm-section__count">
        {visibleRows.length} of {rows.length} rows{config.columns.some((c) => c.editable)
          ? ' · click a value or the pencil to edit, or ✓ Verify to confirm it’s still current.'
          : ' · read-only.'}
      </p>
      <EditableTable
        columns={config.columns}
        rows={visibleRows}
        rowKey={(r) => r[config.pk]}
        onSave={onSave}
        onVerify={config.verifiable ? onVerify : undefined}
        emptyLabel={emptyLabel}
      />
    </>
  );
}

// Staged rate updates awaiting approval. Shows current-vs-proposed and, on
// Approve, writes into product_rates (which the updated_at trigger stamps fresh).
function RateProposals({ country }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [proposals, setProposals] = useState(null);
  const [current, setCurrent] = useState({}); // natural-key -> live product_rates row
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const keyOf = (r) => [r.country_code, r.product, r.variant || '', r.bank, r.currency || ''].join('|');

  const load = useCallback(async () => {
    setProposals(null); setError('');
    const { data, error } = await supabase
      .from('rate_proposals').select('*').eq('status', 'pending').eq('country_code', country)
      .order('created_at', { ascending: true });
    if (error) { setError(error.message); return; }
    setProposals(data);
    const { data: rates } = await supabase
      .from('product_rates').select('id, country_code, product, variant, bank, currency, rate, rate_type')
      .eq('country_code', country);
    const map = {};
    for (const r of rates || []) map[keyOf(r)] = r;
    setCurrent(map);
  }, [country]);

  useEffect(() => { load(); }, [load]);

  const rlsError = (e) => (/row-level security/i.test(e.message)
    ? new Error('Write blocked by RLS — run supabase/admin.sql + rate_proposals.sql, and sign in as the admin.')
    : e);

  const approve = async (p) => {
    const ok = await confirm({
      title: 'Publish this rate change?',
      body: `This writes ${p.bank} ${p.product} = ${p.proposed_rate} straight into the live product rates the public calculator uses.`,
      confirmLabel: 'Publish', cancelLabel: 'Cancel', danger: false,
    });
    if (!ok) return;
    setBusyId(p.id); setError('');
    try {
      const cur = current[keyOf(p)];
      if (cur) {
        const patch = { rate: p.proposed_rate, is_indicative: false, ...(p.rate_type ? { rate_type: p.rate_type } : {}) };
        const { error } = await supabase.from('product_rates').update(patch).eq('id', cur.id);
        if (error) throw rlsError(error);
      } else {
        if (!p.currency) throw new Error('New rate needs a currency (product_rates.currency is required). Add it to the proposal and re-stage.');
        const { error } = await supabase.from('product_rates').insert({
          country_code: p.country_code, product: p.product, variant: p.variant || null,
          bank: p.bank, currency: p.currency, rate: p.proposed_rate,
          rate_type: p.rate_type || 'apr', is_indicative: false,
        });
        if (error) throw rlsError(error);
      }
      const { error: e2 } = await supabase.from('rate_proposals')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user?.id || null })
        .eq('id', p.id);
      if (e2) throw rlsError(e2);
      setProposals((ps) => ps.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(friendlyError(e, 'Could not publish that change — please try again.'));
    } finally { setBusyId(null); }
  };

  const dismiss = async (p) => {
    const ok = await confirm({
      title: 'Dismiss this proposal?',
      body: `Discard the proposed ${p.bank} ${p.product} update. This can’t be undone.`,
      confirmLabel: 'Dismiss', cancelLabel: 'Keep',
    });
    if (!ok) return;
    setBusyId(p.id); setError('');
    try {
      const { error } = await supabase.from('rate_proposals')
        .update({ status: 'dismissed', reviewed_at: new Date().toISOString(), reviewed_by: user?.id || null })
        .eq('id', p.id);
      if (error) throw rlsError(error);
      setProposals((ps) => ps.filter((x) => x.id !== p.id));
    } catch (e) {
      setError(friendlyError(e, 'Could not dismiss that proposal — please try again.'));
    } finally { setBusyId(null); }
  };

  if (error && !proposals) return <div className="adm-error" role="alert">{error}</div>;
  if (!proposals) return <div className="adm-loading"><span className="dash__spinner" aria-hidden="true" /> Loading…</div>;
  if (!proposals.length) return <div className="adm-empty-note">No pending updates right now. Newly staged rate proposals awaiting review will appear here.</div>;

  return (
    <>
      {error && <div className="adm-error" role="alert">{error}</div>}
      <p className="adm-section__count">
        {proposals.length} proposed change{proposals.length === 1 ? '' : 's'} · Approve writes it into product rates (and marks it verified), or Dismiss.
      </p>
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th scope="col">Source</th><th scope="col">Product</th><th scope="col">Bank</th><th scope="col">Ccy</th>
              <th scope="col">Current → Proposed</th><th scope="col">As of</th><th className="adm-actions-col" scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => {
              const cur = current[keyOf(p)];
              const curRate = cur?.rate;
              const isNew = !cur;
              const changed = isNew || Number(curRate) !== Number(p.proposed_rate);
              return (
                <tr key={p.id}>
                  <td data-label="Source">{p.source}</td>
                  <td data-label="Product">{p.product}{p.variant ? ` (${p.variant})` : ''}</td>
                  <td data-label="Bank">{p.bank}</td>
                  <td data-label="Ccy">{p.currency || '—'}</td>
                  <td data-label="Change" className="adm-prop__change">
                    <span className="adm-prop__cur">{curRate ?? '—'}</span>
                    <span className="adm-prop__arrow">→</span>
                    <span className={`adm-prop__new ${changed ? 'is-changed' : ''}`}>{p.proposed_rate}</span>
                    {isNew && <span className="adm-prop__tag">new</span>}
                  </td>
                  <td data-label="As of">{p.as_of ? formatDate(p.as_of) : '—'}</td>
                  <td className="adm-actions-col" data-label="Actions">
                    <div className="adm-rowactions">
                      <button className="adm-btn adm-btn--save" disabled={busyId === p.id} onClick={() => approve(p)}>
                        {busyId === p.id ? '…' : 'Approve'}
                      </button>
                      <button className="adm-btn adm-btn--ghost" disabled={busyId === p.id} onClick={() => dismiss(p)}>Dismiss</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Editor({ onSignOut, email }) {
  const [sectionKey, setSectionKey] = useState(SECTIONS[0].key);
  const [country, setCountry] = useState('SG');
  const [countries, setCountries] = useState([{ code: 'SG', name: 'Singapore' }]);
  const active = SECTIONS.find((s) => s.key === sectionKey);

  useEffect(() => {
    supabase.from('countries').select('code, name').order('display_order').then(({ data }) => {
      if (data && data.length) setCountries(data);
    });
  }, []);

  return (
    <div className="adm">
      <header className="adm-header">
        <div className="adm-header__brand"><span>Fee</span>Optima · Admin</div>
        <div className="adm-header__right">
          <a className="adm-header__home" href="#top">↗ View site</a>
          <span className="adm-header__user">{email}</span>
          <button className="adm-btn adm-btn--ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <nav className="adm-tabs">
        {SECTIONS.map((s) => (
          <button key={s.key} className={`adm-tab ${s.key === sectionKey ? 'is-active' : ''}`} onClick={() => setSectionKey(s.key)}>
            {s.title}
          </button>
        ))}
      </nav>

      <div className="adm-body">
        <div className="adm-toolbar">
          <h2>{active.title}</h2>
          {active.byCountry && (
            <label className="adm-country">
              Country
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
          )}
        </div>
        {active.custom === 'proposals'
          ? <RateProposals key={`proposals:${country}`} country={country} />
          : <Section key={`${sectionKey}:${country}`} config={active} country={country} />}
      </div>
    </div>
  );
}

export default function AdminApp() {
  const { configured, loading, user, signOut } = useAuth();

  if (!configured) {
    return <div className="adm-center">Supabase isn’t configured. Add keys to <code>client/.env.local</code> (see AUTH_SETUP.md).</div>;
  }
  if (loading) return <div className="adm-center">Loading…</div>;
  if (!user) return <LoginGate />;
  if (user.email !== ADMIN_EMAIL) {
    return (
      <div className="adm-center">
        <p><strong>{user.email}</strong> is not an admin account.</p>
        <button className="adm-btn adm-btn--ghost" onClick={signOut}>Sign out</button>
      </div>
    );
  }
  return <Editor onSignOut={signOut} email={user.email} />;
}
