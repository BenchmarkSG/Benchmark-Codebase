/* Customer-support portal (/#support).
 *
 * Built for one job: the person handling an Option-2 callback needs to know who
 * to ring, what their benchmark says, and what to actually tell them. Two tabs,
 * nothing else — a portal with more in it is a portal nobody reads under time
 * pressure on a live call.
 *
 * Access is gated by isSupportEmail() for UX, but what the queue returns is
 * decided by RLS (supabase/support.sql). Signing in as anyone else shows an
 * empty queue rather than someone else's customers.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import './support.css';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../lib/supabase.js';
import { isSupportEmail } from '../lib/roles.js';
import { getReference } from '../api.js';
import { friendlyError } from '../lib/friendlyError.js';
import { formatDate } from '../lib/formatDate.js';
import { CALL_FLOW, GUARDRAILS, playbookFor } from './playbooks.js';

// leads.source → the option the customer clicked in the reveal modal. Option 2
// is the coaching call this portal exists to support.
const OPTION_LABELS = { call: 'Option 2 · Coaching call', expert: 'Option 3 · Expert-led' };
const LEAD_STAGES = ['new', 'contacted', 'negotiating', 'closed_won', 'closed_lost'];
const STAGE_LABELS = {
  new: 'Not called yet', contacted: 'Called', negotiating: 'In negotiation',
  closed_won: 'Saved money', closed_lost: 'No outcome',
};

const SLOT_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
const slotLabel = (r) => {
  if (r.slot_start) {
    const d = new Date(r.slot_start);
    return Number.isNaN(d.getTime()) ? '—' : SLOT_FMT.format(d);
  }
  if (r.booked_at) return `Booked ${formatDate(r.booked_at)} · time syncing…`;
  if (r.booked) return 'Booked · time not captured';
  return 'Not booked yet';
};

const money = (n, ccy) => {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency: ccy || 'SGD', maximumFractionDigits: 0,
    }).format(Number(n));
  } catch { return `${ccy || ''} ${Math.round(Number(n)).toLocaleString()}`.trim(); }
};

/* -------------------------------------------------------------------------- */

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
      const { error: err } = await signInWithEmail(email.trim(), password);
      if (err) throw err;
    } catch (err) {
      setError(friendlyError(err, 'Sign in failed. Check your email and password.'));
      setBusy(false);
    }
  };

  return (
    <div className="sup-login">
      <form className="sup-login__card" onSubmit={submit}>
        <div className="sup-login__brand"><span>Fee</span>Optima · Support</div>
        <h1>Customer support sign in</h1>
        <p className="sup-login__sub">Restricted area. Authorised support staff only.</p>
        <label>Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="usersupport@feeoptima.com" autoComplete="username" required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required />
        </label>
        {error && <div className="sup-error" role="alert">{error}</div>}
        <button className="sup-btn sup-btn--primary sup-login__submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <a className="sup-login__back" href="/">← Back to site</a>
      </form>
    </div>
  );
}

/* ---- The playbook ------------------------------------------------------- */

function Playbook({ country, product, customer }) {
  const book = playbookFor(country, product);
  if (!book) {
    return <div className="sup-empty">Pick a country and a product to load the call guide.</div>;
  }
  const { country: c, product: p, specific, levers } = book;

  return (
    <div className="sup-book">
      {customer && (
        <section className="sup-card sup-card--cust">
          <h3>On this call</h3>
          <div className="sup-cust">
            <div><span>Customer</span><strong>{customer.full_name || '—'}</strong></div>
            <div><span>Their bank</span><strong>{customer.bank || '—'}</strong></div>
            <div><span>Their rate</span><strong>{customer.your_rate ?? '—'}{customer.your_rate != null ? ' %' : ''}</strong></div>
            <div><span>Best available</span><strong>{customer.benchmark_rate ?? '—'}{customer.benchmark_rate != null ? ' %' : ''}</strong></div>
            <div><span>Gap per year</span><strong>{money(customer.annual_saving, customer.currency) || '—'}</strong></div>
          </div>
          <p className="sup-cust__note">
            Read these back and have them confirm against their latest statement before you coach on any of it.
          </p>
        </section>
      )}

      <section className="sup-card">
        <h3>{p.frameTitle || 'What this product is really about'}</h3>
        <p className="sup-frame">{p.frame}</p>
        {specific?.note && <p className="sup-note sup-note--key"><strong>{c.name}:</strong> {specific.note}</p>}
      </section>

      <section className="sup-card">
        <h3>How pricing works in {c.name}</h3>
        <p className="sup-anchor"><strong>Benchmark:</strong> {c.anchor}</p>
        <ul className="sup-list">{c.pricing.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="sup-terms"><strong>Words they will hear:</strong> {c.terms}</p>
        <p className="sup-terms"><strong>Regulator:</strong> {c.regulator}</p>
      </section>

      <section className="sup-card">
        <h3>The levers — work down, stop after two that fit</h3>
        <ol className="sup-levers">
          {levers.map((l) => (
            <li key={l.title}>
              <strong>{l.title}</strong>
              <span>{l.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="sup-card sup-card--ask">
        <h3>The ask — have them write this down</h3>
        <blockquote className="sup-ask">{p.ask}</blockquote>
        <p className="sup-note">
          Replace everything in &lt;angle brackets&gt; with their real numbers from the panel above.
          Never invent a competing rate — use the one on their benchmark.
        </p>
      </section>

      <section className="sup-card">
        <h3>When the bank pushes back</h3>
        <dl className="sup-obj">
          {p.objections.map((o) => (
            <div key={o.bank}>
              <dt>{o.bank}</dt>
              <dd>{o.you}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="sup-card sup-card--warn">
        <h3>Watch out for</h3>
        <ul className="sup-list">{p.watch.map((t) => <li key={t}>{t}</li>)}</ul>
      </section>
    </div>
  );
}

/* ---- The callback queue -------------------------------------------------- */

function Queue({ onOpenScript }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [onlyCalls, setOnlyCalls] = useState(true);
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      // saved_benchmarks is joined for the country + the figures the agent needs;
      // RLS only returns the rows attached to a lead (supabase/support.sql).
      const { data, error: err } = await supabase
        .from('leads')
        .select('*, saved_benchmarks(country_code, product, your_rate, benchmark_rate, currency, best_bank, inputs)')
        .order('slot_start', { ascending: true, nullsFirst: false })
        .limit(200);
      if (err) throw err;
      setRows(data || []);
    } catch (err) {
      setError(friendlyError(err, 'Could not load the callback queue.'));
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStage = async (id, stage) => {
    setSaving(id);
    try {
      const { error: err } = await supabase.rpc('support_set_lead_stage', { p_lead_id: id, p_stage: stage });
      if (err) throw err;
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, stage } : r)));
    } catch (err) {
      setError(friendlyError(err, 'Could not save that. Your changes were not stored.'));
    } finally { setSaving(null); }
  };

  const list = useMemo(
    () => (rows || []).filter((r) => (onlyCalls ? r.source === 'call' : true)),
    [rows, onlyCalls],
  );

  if (rows === null) return <div className="sup-empty">Loading the queue…</div>;

  return (
    <div className="sup-queue">
      <div className="sup-queue__bar">
        <label className="sup-check">
          <input type="checkbox" checked={onlyCalls} onChange={(e) => setOnlyCalls(e.target.checked)} />
          Option 2 callbacks only
        </label>
        <button className="sup-btn sup-btn--ghost" onClick={load}>Refresh</button>
      </div>
      {error && <div className="sup-error" role="alert">{error}</div>}
      {!list.length && <div className="sup-empty">Nothing booked{onlyCalls ? ' for Option 2' : ''} yet.</div>}
      {list.map((r) => {
        const b = r.saved_benchmarks || {};
        const cc = b.country_code;
        const pid = b.product || r.product;
        return (
          <article className="sup-lead" key={r.id}>
            <header>
              <div>
                <strong>{r.full_name || r.email || 'Unnamed'}</strong>
                <span className="sup-lead__opt">{OPTION_LABELS[r.source] || r.source}</span>
              </div>
              <span className="sup-lead__slot">{slotLabel(r)}</span>
            </header>
            <div className="sup-lead__grid">
              <div><span>Product</span>{r.product_label || pid || '—'}</div>
              <div><span>Market</span>{cc || '—'}</div>
              <div><span>Their bank</span>{b.inputs?.bank || '—'}</div>
              <div><span>Their rate</span>{b.your_rate ?? '—'}</div>
              <div><span>Best available</span>{b.benchmark_rate ?? '—'}</div>
              <div><span>Gap / year</span>{money(r.annual_saving, b.currency) || '—'}</div>
              <div><span>Phone</span>{r.phone ? <a href={`tel:${r.phone}`}>{r.phone}</a> : '—'}</div>
              <div><span>Email</span>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</div>
            </div>
            {r.message && <p className="sup-lead__msg">“{r.message}”</p>}
            <footer>
              <label className="sup-stage">
                Outcome
                <select
                  value={r.stage || 'new'}
                  disabled={saving === r.id}
                  onChange={(e) => setStage(r.id, e.target.value)}
                >
                  {LEAD_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </label>
              <button
                className="sup-btn sup-btn--primary"
                disabled={!cc || !pid}
                title={!cc || !pid ? 'This lead has no linked benchmark, so we cannot pick the right script.' : ''}
                onClick={() => onOpenScript(cc, pid, {
                  full_name: r.full_name,
                  bank: b.inputs?.bank,
                  your_rate: b.your_rate,
                  benchmark_rate: b.benchmark_rate,
                  annual_saving: r.annual_saving,
                  currency: b.currency,
                })}
              >
                Open call guide →
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

/* ---- Shell --------------------------------------------------------------- */

function Portal({ email, onSignOut }) {
  const [tab, setTab] = useState('queue');
  const [ref, setRef] = useState({ countries: [], products: [] });
  const [country, setCountry] = useState('SG');
  const [product, setProduct] = useState('housing_loan');
  const [customer, setCustomer] = useState(null);

  useEffect(() => {
    getReference()
      .then((r) => setRef({ countries: r.countries || [], products: r.products || [] }))
      .catch(() => setRef({ countries: [], products: [] }));
  }, []);

  // Same allow-list the calculator honours, so the portal can never offer a
  // script for a product that market does not sell.
  const products = useMemo(
    () => ref.products.filter((p) => !p.onlyCountries || p.onlyCountries.includes(country)),
    [ref.products, country],
  );

  // Changing country can strip the selected product out of the list; fall back
  // rather than leave a picker showing something that is no longer offered.
  useEffect(() => {
    if (!products.length) return;
    if (!products.some((p) => p.id === product)) setProduct(products[0].id);
  }, [products, product]);

  const openScript = (cc, pid, cust) => {
    setCountry(cc); setProduct(pid); setCustomer(cust || null); setTab('script');
  };

  return (
    <div className="sup">
      <header className="sup-top">
        <div className="sup-top__brand"><span>Fee</span>Optima · Support</div>
        <nav className="sup-tabs">
          <button className={tab === 'queue' ? 'is-on' : ''} onClick={() => setTab('queue')}>Callback queue</button>
          <button className={tab === 'script' ? 'is-on' : ''} onClick={() => setTab('script')}>Call guide</button>
          <button className={tab === 'how' ? 'is-on' : ''} onClick={() => setTab('how')}>How to run a call</button>
        </nav>
        <div className="sup-top__right">
          <span className="sup-top__who">{email}</span>
          <button className="sup-btn sup-btn--ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main className="sup-main">
        {tab === 'queue' && <Queue onOpenScript={openScript} />}

        {tab === 'script' && (
          <>
            <div className="sup-pickers">
              <label>Country
                <select value={country} onChange={(e) => { setCountry(e.target.value); setCustomer(null); }}>
                  {(ref.countries.length ? ref.countries : [{ code: country, name: country }])
                    .map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                </select>
              </label>
              <label>Product
                <select value={product} onChange={(e) => { setProduct(e.target.value); setCustomer(null); }}>
                  {(products.length ? products : [{ id: product, label: product }])
                    .map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </label>
              {customer && (
                <button className="sup-btn sup-btn--ghost" onClick={() => setCustomer(null)}>
                  Clear customer
                </button>
              )}
            </div>
            <Playbook country={country} product={product} customer={customer} />
          </>
        )}

        {tab === 'how' && (
          <div className="sup-book">
            <section className="sup-card sup-card--warn">
              <h3>Ground rules — read once, remember always</h3>
              <ul className="sup-list">{GUARDRAILS.map((g) => <li key={g}>{g}</li>)}</ul>
            </section>
            {CALL_FLOW.map((s) => (
              <section className="sup-card" key={s.title}>
                <h3>{s.title}</h3>
                <ul className="sup-list">{s.points.map((t) => <li key={t}>{t}</li>)}</ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SupportApp() {
  const { configured, loading, user, signOut } = useAuth();

  if (!configured) {
    return <div className="sup-center">Supabase isn’t configured. Add keys to <code>client/.env.local</code>.</div>;
  }
  if (loading) return <div className="sup-center">Loading…</div>;
  if (!user) return <LoginGate />;
  if (!isSupportEmail(user)) {
    return (
      <div className="sup-center">
        <p><strong>{user.email}</strong> is not a support account.</p>
        <button className="sup-btn sup-btn--ghost" onClick={signOut}>Sign out</button>
      </div>
    );
  }
  return <Portal email={user.email} onSignOut={signOut} />;
}
