import { useCallback, useEffect, useState } from 'react';
import './admin.css';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import EditableTable from './EditableTable.jsx';
import { INCOME_LABELS } from '../lib/profileFields.js';
import { SERVES_LABELS } from '../lib/advisorFields.js';
import { ADMIN_EMAIL } from '../lib/roles.js';

// Which tables the portal can edit, and how each row is shown/edited.
// NOTE: overdraft and loan/trade-finance rates now live in the unified
// `product_rates` table (the "Product rates" section). The old `overdraft_rates`
// and `loan_products` tables were retired in the v2 model, so their tabs were
// removed — the seeder no longer populates them.
const SECTIONS = [
  {
    key: 'remittance', title: 'Remittance charges', table: 'remittance_charges', pk: 'id',
    select: 'id, direction, counterparty, upfront_fee, intermediary_fee, lifting_fee, fee_currency, fx_spread_pct, is_indicative, banks!inner(name, country_code)',
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
    ],
  },
  {
    key: 'thresholds', title: 'Negotiation thresholds', table: 'negotiation_thresholds', pk: 'id',
    select: 'id, product, target_saving, saving_currency, threshold_amount, switching_cost, switching_weeks, worthwhile, is_indicative, country_code',
    byCountry: 'country_code',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'target_saving', label: 'Target', type: 'number', step: 100, editable: true },
      { key: 'threshold_amount', label: 'Threshold', type: 'number', step: 1000, editable: true },
      { key: 'switching_cost', label: 'Switch cost', type: 'number', step: 100, editable: true },
      { key: 'switching_weeks', label: 'Weeks', type: 'number', step: 1, editable: true },
      { key: 'worthwhile', label: 'Worthwhile', type: 'boolean', editable: true },
      { key: 'is_indicative', label: 'Indicative', type: 'boolean', editable: true },
    ],
  },
  {
    key: 'product_rates', title: 'Product rates', table: 'product_rates', pk: 'id',
    select: 'id, product, variant, bank, currency, rate, rate_type, is_indicative, country_code',
    byCountry: 'country_code', order: 'product',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'variant', label: 'Variant' },
      { key: 'bank', label: 'Bank' },
      { key: 'currency', label: 'Ccy' },
      { key: 'rate', label: 'Rate %', type: 'number', step: 0.01, editable: true },
      { key: 'rate_type', label: 'Type' },
      { key: 'is_indicative', label: 'Indicative', type: 'boolean', editable: true },
    ],
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
      { key: 'created_at', label: 'Submitted', get: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') },
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
      { key: 'created_at', label: 'Registered', get: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') },
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
      { key: 'created_at', label: 'Applied', get: (r) => (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') },
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
      setError(err.message || 'Sign in failed');
      setBusy(false);
    }
  };

  return (
    <div className="adm-login">
      <form className="adm-login__card" onSubmit={submit}>
        <div className="adm-login__brand">Bank<span>Benchmark</span> · Admin</div>
        <h1>Admin sign in</h1>
        <p className="adm-login__sub">Restricted area. Authorised administrators only.</p>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@benchmark.com" autoComplete="username" required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <div className="adm-error">{error}</div>}
        <button className="adm-btn adm-btn--save adm-login__submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a className="adm-login__back" href="/">← Back to site</a>
      </form>
    </div>
  );
}

function Section({ config, country }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setRows(null); setError('');
    let q = supabase.from(config.table).select(config.select);
    if (config.byCountry && country) q = q.eq(config.byCountry, country);
    if (config.order) q = q.order(config.order, { ascending: !config.desc });
    const { data, error } = await q;
    if (error) setError(error.message);
    else setRows(data);
  }, [config, country]);

  useEffect(() => { load(); }, [load]);

  const onSave = async (row, patch) => {
    const { error } = await supabase.from(config.table).update(patch).eq(config.pk, row[config.pk]);
    if (error) {
      if (/row-level security/i.test(error.message)) {
        throw new Error('Write blocked by RLS — run supabase/admin.sql and sign in as the admin.');
      }
      throw error;
    }
    setRows((rs) => rs.map((r) => (r[config.pk] === row[config.pk] ? { ...r, ...patch } : r)));
  };

  if (error) return <div className="adm-error">{error}</div>;
  if (!rows) return <div className="adm-loading">Loading…</div>;
  if (!rows.length) return <div className="adm-loading">{config.emptyText || 'No rows. Seed the data first (npm run seed:rates).'}</div>;

  return (
    <>
      <p className="adm-section__count">
        {rows.length} rows{config.columns.some((c) => c.editable) ? ' · click the pencil to edit, then Save to write to Supabase.' : ' · read-only.'}
      </p>
      <EditableTable columns={config.columns} rows={rows} rowKey={(r) => r[config.pk]} onSave={onSave} />
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
        <div className="adm-header__brand">Bank<span>Benchmark</span> · Admin</div>
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
        <Section key={`${sectionKey}:${country}`} config={active} country={country} />
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
