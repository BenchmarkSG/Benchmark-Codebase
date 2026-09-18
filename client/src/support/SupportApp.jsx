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
import { getReference, getBanks, getFxRate } from '../api.js';
import { friendlyError } from '../lib/friendlyError.js';
import { formatDate } from '../lib/formatDate.js';
import { CALL_FLOW, GUARDRAILS, scriptFor } from './playbooks.js';
import { money, inputRows, rankSaving } from './leadFields.js';
import { chatLink } from '../lib/whatsapp.js';

/* The opener we put in the agent's WhatsApp box. Names the customer, the
   product and why we are messaging, because an unannounced message from an
   unknown number reads as a scam — which is the fastest way to lose a booked
   call. Never mentions the saving figure: that is the paid reveal. */
const waOpener = (lead) => {
  const who = String(lead?.full_name || '').split(' ')[0];
  return `Hi${who ? ` ${who}` : ''}, this is FeeOptima about the ${lead?.product_label || 'benchmark'} call you booked. `
    + 'Is now a good time, or shall I call you instead?';
};
import { bothZones, dateInZone, agentZone, isOverdue, overdueBy, localInputToIso, nowForInput } from './times.js';
import ComplaintLadder from '../components/ComplaintLadder.jsx';

// leads.source → the option the customer clicked in the reveal modal. Option 2
// is the coaching call this portal exists to support.
const OPTION_LABELS = { call: 'Option 2 · Coaching call', expert: 'Option 3 · Expert-led' };
const LEAD_STAGES = ['new', 'contacted', 'negotiating', 'closed_won', 'closed_lost'];
const STAGE_LABELS = {
  new: 'Not called yet', contacted: 'Called', negotiating: 'In negotiation',
  closed_won: 'Saved money', closed_lost: 'No outcome',
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

/* ---- The call script ------------------------------------------------------
   Rendered for someone with a phone to their ear. Four line kinds, each
   visually distinct at a glance:
     say  — speak it, in quotes
     ask  — a question, with branches for each answer
     do   — an action
     warn — say before they act
   No paragraphs. If the agent has to read a block of prose, this has failed. */

const KIND_LABEL = { say: 'SAY', ask: 'ASK', do: 'DO', warn: 'WARN' };

function Line({ line }) {
  return (
    <li className={`scr-line scr-line--${line.kind}`}>
      <span className="scr-tag">{KIND_LABEL[line.kind]}</span>
      <div>
        <p className="scr-text">{line.kind === 'say' ? `“${line.text}”` : line.text}</p>
        {line.note && <p className="scr-note">{line.note}</p>}
        {line.branches && (
          <ul className="scr-branches">
            {line.branches.map((b) => (
              <li key={b.if}><strong>{b.if}</strong><span>{b.then}</span></li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Playbook({ country, product, customer }) {
  // The customer's own numbers go straight into the words the agent speaks.
  const vars = customer ? {
    name: customer.full_name ? String(customer.full_name).split(' ')[0] : null,
    bank: customer.bank,
    rate: customer.your_rate != null ? `${customer.your_rate}%` : null,
    best: customer.benchmark_rate != null ? `${customer.benchmark_rate}%` : null,
    gap: money(customer.annual_saving, customer.currency),
  } : {};

  const script = scriptFor(country, product, vars);
  if (!script) {
    return <div className="sup-empty">Pick a country and a product to load the call script.</div>;
  }

  return (
    <div className="scr">
      {customer ? (
        <section className="scr-panel">
          <div className="sup-cust">
            <div><span>Customer</span><strong>{customer.full_name || '—'}</strong></div>
            <div><span>Their bank</span><strong>{customer.bank || '—'}</strong></div>
            <div><span>Their rate</span><strong>{customer.your_rate != null ? `${customer.your_rate}%` : '—'}</strong></div>
            <div><span>Best available</span><strong>{customer.benchmark_rate != null ? `${customer.benchmark_rate}%` : '—'}</strong></div>
            <div><span>Gap / year</span><strong>{money(customer.annual_saving, customer.currency) || '—'}</strong></div>
          </div>
        </section>
      ) : (
        <p className="scr-generic">
          No customer loaded — the script shows neutral wording. Open it from the queue to fill in their real numbers.
        </p>
      )}

      {script.steps.map((st, i) => (
        <section className="scr-step" key={st.id}>
          <header>
            <span className="scr-step__num">{i + 1}</span>
            <h3>{st.title}</h3>
            <span className="scr-step__time">{st.time}</span>
          </header>

          {st.quote && <blockquote className="scr-quote">{st.quote}</blockquote>}

          {st.lines && <ul className="scr-lines">{st.lines.map((l, j) => <Line key={j} line={l} />)}</ul>}

          {st.objections && (
            <ul className="scr-obj">
              {st.objections.map((o) => (
                <li key={o.they}>
                  <p className="scr-obj__they">They say: {o.they}</p>
                  <p className="scr-obj__you">&ldquo;{o.say}&rdquo;</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="scr-words"><strong>Words they&apos;ll hear:</strong> {script.words} · <strong>Regulator:</strong> {script.regulator}</p>
    </div>
  );
}

/* ---- The callback queue -------------------------------------------------- */

/* ---- The callback queue -------------------------------------------------- */

/* Two clocks for one instant, so the agent never reads their own clock aloud. */
function WhenRow({ label, iso, market, dateOnly = false }) {
  if (!iso) return <div><span>{label}</span>—</div>;
  if (dateOnly) return <div><span>{label}</span>{dateInZone(iso, agentZone())}</div>;
  const z = bothZones(iso, market);
  if (!z) return <div><span>{label}</span>—</div>;
  return (
    <div className="sup-when">
      <span>{label}</span>
      <strong>{z.mine}</strong>
      {!z.sameZone && z.theirs && (
        <em title={z.marketNote || undefined}>{z.theirs} — customer’s time</em>
      )}
    </div>
  );
}

/* Everything support is allowed to do to a lead: add a note, stamp when the
   call really happened, move the outcome, add another person to ring. All of it
   append-only server-side (supabase/lead_notes.sql) — no edit, no delete. */
function CallLog({ lead, notes, contacts, onLogged, onContactAdded }) {
  const [body, setBody] = useState('');
  const [calledAt, setCalledAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [showContact, setShowContact] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cRel, setCRel] = useState('');

  const save = async (stage = null) => {
    if (!body.trim() && !calledAt && !stage) { setErr('Add a comment, a call time, or an outcome.'); return; }
    setBusy(true); setErr('');
    try {
      const { error } = await supabase.rpc('support_log_call', {
        p_lead_id: lead.id,
        p_body: body.trim(),
        p_called_at: localInputToIso(calledAt),
        p_stage: stage,
      });
      if (error) throw error;
      onLogged({ body: body.trim(), calledAt: localInputToIso(calledAt), stage });
      setBody(''); setCalledAt('');
    } catch (e) {
      setErr(friendlyError(e, 'Could not save. Nothing was recorded.'));
    } finally { setBusy(false); }
  };

  const addContact = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { error } = await supabase.rpc('support_add_lead_contact', {
        p_lead_id: lead.id, p_name: cName.trim(), p_phone: cPhone.trim(),
        p_relationship: cRel.trim() || null, p_note: null,
      });
      if (error) throw error;
      onContactAdded({ name: cName.trim(), phone: cPhone.trim(), relationship: cRel.trim() || null });
      setCName(''); setCPhone(''); setCRel(''); setShowContact(false);
    } catch (e2) {
      setErr(friendlyError(e2, 'Could not add that contact.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="sup-log">
      {contacts.length > 0 && (
        <div className="sup-log__contacts">
          <h5>Also call</h5>
          {contacts.map((c, i) => (
            <div key={c.id || i}>
              <strong>{c.name}</strong>
              {c.relationship && <span className="sup-log__rel">{c.relationship}</span>}
              <a href={`tel:${String(c.phone).replace(/\s/g, '')}`}>{c.phone}</a>
            </div>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="sup-log__notes">
          <h5>Customer comments</h5>
          {notes.map((n, i) => (
            <div key={n.id || i}>
              <p>{n.body}</p>
              <span>
                {n.author || 'support'} · {dateInZone(n.created_at, agentZone()) || 'just now'}
                {n.called_at && ` · call made ${bothZones(n.called_at, null)?.mine || ''}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="sup-log__form">
        <label className="sup-log__comment">
          Add a customer comment
          <textarea
            rows={2} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="What did they say? Anything they want us to know."
          />
        </label>
        <label className="sup-log__when">
          Call actually made
          <input type="datetime-local" value={calledAt} onChange={(e) => setCalledAt(e.target.value)} />
          <button type="button" className="sup-link" onClick={() => setCalledAt(nowForInput())}>Now</button>
        </label>
      </div>

      {err && <div className="sup-error" role="alert">{err}</div>}

      <div className="sup-log__actions">
        <button className="sup-btn sup-btn--primary" disabled={busy} onClick={() => save()}>
          {busy ? 'Saving…' : 'Save to log'}
        </button>
        <button className="sup-btn sup-btn--ghost" disabled={busy} onClick={() => setShowContact((v) => !v)}>
          + Another number
        </button>
        <span className="sup-log__hint">Entries are permanent — only an admin can edit or remove them.</span>
      </div>

      {showContact && (
        <form className="sup-log__contact-form" onSubmit={addContact}>
          <label>Name<input value={cName} onChange={(e) => setCName(e.target.value)} required placeholder="e.g. Meera Iyer" /></label>
          <label>Phone<input type="tel" value={cPhone} onChange={(e) => setCPhone(e.target.value)} required placeholder="+65 9123 4567" /></label>
          <label>Relationship<input value={cRel} onChange={(e) => setCRel(e.target.value)} placeholder="e.g. Accountant" /></label>
          <button className="sup-btn sup-btn--primary" disabled={busy}>Add</button>
        </form>
      )}
    </div>
  );
}

function Queue({ onOpenScript, products }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [onlyCalls, setOnlyCalls] = useState(true);
  const [saving, setSaving] = useState(null);
  // currency -> rate into SGD, for ranking only (never shown to anyone).
  const [fx, setFx] = useState({});

  const load = useCallback(async () => {
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('leads')
        .select('*, saved_benchmarks(country_code, product, your_rate, benchmark_rate, currency, unit, best_bank, inputs, market_typical, monthly_saving, result_status, direction), lead_notes(*), lead_contacts(*)')
        .limit(200);
      if (err) throw err;
      setRows(data || []);
    } catch (err) {
      setError(friendlyError(err, 'Could not load the callback queue.'));
      setRows([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  /* Savings arrive in five currencies, so ranking the raw numbers would put a
     large-denomination market on top regardless of what it is worth. Convert to
     one currency purely to sort. Display always stays in the customer's own. */
  useEffect(() => {
    const ccys = [...new Set((rows || [])
      .map((r) => r.saved_benchmarks?.currency)
      .filter((c) => c && c !== 'SGD'))];
    const missing = ccys.filter((c) => !(c in fx));
    if (!missing.length) return;
    Promise.all(missing.map((c) => getFxRate(c, 'SGD').then((rate) => [c, rate])))
      .then((pairs) => setFx((f) => ({ ...f, ...Object.fromEntries(pairs) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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

  const list = useMemo(() => {
    return (rows || [])
      .filter((r) => (onlyCalls ? r.source === 'call' : true))
      .sort((a, b) => rankSaving(b, fx) - rankSaving(a, fx));
  }, [rows, onlyCalls, fx]);

  if (rows === null) return <div className="sup-empty">Loading the queue…</div>;

  return (
    <div className="sup-queue">
      <div className="sup-queue__bar">
        <label className="sup-check">
          <input type="checkbox" checked={onlyCalls} onChange={(e) => setOnlyCalls(e.target.checked)} />
          Option 2 callbacks only
        </label>
        <span className="sup-queue__sort">Biggest savings first</span>
        <button className="sup-btn sup-btn--ghost" onClick={load}>Refresh</button>
      </div>
      {error && <div className="sup-error" role="alert">{error}</div>}
      {!list.length && <div className="sup-empty">Nothing booked{onlyCalls ? ' for Option 2' : ''} yet.</div>}
      {list.map((r) => {
        const b = r.saved_benchmarks || {};
        const cc = b.country_code;
        const pid = b.product || r.product;
        const product = products.find((p) => p.id === pid) || null;
        const answers = inputRows(product, b.inputs, b.currency);
        const unit = b.unit || '%';
        // Slot passed and still no outcome recorded — the one state that needs
        // to shout across a list of twenty.
        const overdue = isOverdue(r);
        return (
          <article className={`sup-lead${overdue ? ' sup-lead--overdue' : ''}`} key={r.id}>
            <header>
              <div>
                <strong>{r.full_name || r.email || 'Unnamed'}</strong>
                <span className="sup-lead__opt">{OPTION_LABELS[r.source] || r.source}</span>
              </div>
              {overdue && <span className="sup-lead__overdue">{overdueBy(r) || 'Overdue'}</span>}
            </header>

            <div className="sup-lead__grid sup-lead__grid--when">
              <WhenRow label="Requested on" iso={r.created_at} market={cc} dateOnly />
              {r.slot_start
                ? <WhenRow label="Booked for" iso={r.slot_start} market={cc} />
                : (
                  <div><span>Booked for</span>
                    {r.booked_at ? `Booked ${dateInZone(r.booked_at, agentZone())} · time syncing…`
                      : r.booked ? 'Booked · time not captured' : 'Not booked yet'}
                  </div>
                )}
              <WhenRow label="Call made" iso={r.called_at} market={cc} />
            </div>

            {/* The headline: what they pay, what they could pay, the gap. */}
            <div className="sup-lead__grid">
              <div><span>Product</span>{r.product_label || pid || '—'}</div>
              <div><span>Market</span>{cc || '—'}</div>
              <div><span>Segment</span>{r.segment || '—'}</div>
              <div><span>Their bank</span>{b.inputs?.bank || '—'}</div>
              <div><span>Their rate</span>{b.your_rate != null ? `${b.your_rate} ${unit}` : '—'}</div>
              <div><span>Best available</span>{b.benchmark_rate != null ? `${b.benchmark_rate} ${unit}` : '—'}</div>
              <div><span>Market typical</span>{b.market_typical != null ? `${b.market_typical} ${unit}` : '—'}</div>
              <div className="sup-lead__gap"><span>Gap / year</span>{money(r.annual_saving, b.currency) || '—'}</div>
            </div>

            {/* Everything they actually typed in, labelled by the catalog. */}
            {answers.length > 0 && (
              <div className="sup-lead__answers">
                <h5>What they told us</h5>
                <div className="sup-lead__grid">
                  {answers.map((a) => <div key={a.key}><span>{a.label}</span>{a.value}</div>)}
                  {b.currency && <div><span>Currency</span>{b.currency}</div>}
                  {b.monthly_saving != null && (
                    <div><span>Gap / month</span>{money(b.monthly_saving, b.currency) || '—'}</div>
                  )}
                  {b.result_status && <div><span>Result basis</span>{b.result_status}</div>}
                </div>
              </div>
            )}

            <div className="sup-lead__grid sup-lead__grid--contact">
              <div>
                <span>WhatsApp / phone</span>
                {r.phone ? (
                  <div className="sup-lead__contact">
                    {/* Open WhatsApp first — it is the channel we tell customers
                        we use. The tel: link stays right beside it because an
                        unconfirmed number may not be on WhatsApp at all. */}
                    {chatLink(r.phone) && (
                      <a className="sup-wa" href={chatLink(r.phone, waOpener(r))} target="_blank" rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    )}
                    <a href={`tel:${String(r.phone).replace(/\s/g, '')}`}>{r.phone}</a>
                    {/* Three states, never two: confirmed by an actual inbound
                        message, merely claimed on the form, or unknown. An agent
                        who cannot tell these apart wastes the slot. */}
                    {r.whatsapp_verified_at
                      ? <span className="sup-flag sup-flag--ok" title="A WhatsApp message arrived from this number">✓ WhatsApp confirmed</span>
                      : r.whatsapp_opt_in
                        ? <span className="sup-flag sup-flag--warn" title="The customer said so on the form — never confirmed by a message">Says WhatsApp — unconfirmed</span>
                        : <span className="sup-flag" title="We never asked, or they said no">WhatsApp unknown</span>}
                  </div>
                ) : <em className="sup-lead__missing">No number on file</em>}
              </div>
              <div><span>Email <small>(secondary)</small></span>{r.email ? <a href={`mailto:${r.email}`}>{r.email}</a> : '—'}</div>
              {r.company && <div><span>Company</span>{r.company}</div>}
            </div>

            {r.message && <p className="sup-lead__msg">“{r.message}”</p>}
            <CallLog
              lead={r}
              notes={r.lead_notes || []}
              contacts={r.lead_contacts || []}
              onLogged={({ body, calledAt, stage }) => setRows((rs) => rs.map((x) => (x.id === r.id ? {
                ...x,
                called_at: calledAt || x.called_at,
                stage: stage || x.stage,
                lead_notes: body ? [...(x.lead_notes || []), { body, called_at: calledAt, created_at: new Date().toISOString() }] : x.lead_notes,
              } : x)))}
              onContactAdded={(c) => setRows((rs) => rs.map((x) => (x.id === r.id
                ? { ...x, lead_contacts: [...(x.lead_contacts || []), c] } : x)))}
            />

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

/* ---- Complaints & escalation --------------------------------------------
   The agent's other job: when a customer is not asking to negotiate but to
   complain, they need the right desk in the right order. Bank-level contacts
   come from complaint_contacts (verified rows only); the regulator step is
   market-wide and lives in lib/complaints.js. */
function Complaints({ countries }) {
  const [country, setCountry] = useState('SG');
  const [banks, setBanks] = useState([]);
  const [bankId, setBankId] = useState('');

  useEffect(() => {
    let alive = true;
    setBanks([]); setBankId('');
    getBanks(country).then((b) => { if (alive) setBanks(b || []); });
    return () => { alive = false; };
  }, [country]);

  const bank = banks.find((b) => b.id === bankId) || null;

  return (
    <>
      <div className="sup-pickers">
        <label>Country
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {(countries.length ? countries : [{ code: country, name: country }])
              .map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </label>
        <label>Bank
          <select value={bankId} onChange={(e) => setBankId(e.target.value)} disabled={!banks.length}>
            <option value="">All — show the market’s escalation path</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>
      <ComplaintLadder country={country} bankId={bankId || null} bankName={bank?.name || null} />
    </>
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
          <button className={tab === 'complaints' ? 'is-on' : ''} onClick={() => setTab('complaints')}>Complaints &amp; escalation</button>
        </nav>
        <div className="sup-top__right">
          <span className="sup-top__who">{email}</span>
          <button className="sup-btn sup-btn--ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <main className="sup-main">
        {tab === 'queue' && <Queue onOpenScript={openScript} products={ref.products} />}

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

        {tab === 'complaints' && <Complaints countries={ref.countries} />}

        {tab === 'how' && (
          <div className="sup-book">
            <section className="sup-card sup-card--warn">
              <h3>Ground rules</h3>
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
