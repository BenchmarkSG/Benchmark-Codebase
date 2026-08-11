import { useEffect, useMemo, useState } from 'react';
import './userDashboard.css';
import DashboardLayout from './DashboardLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatMoney, getReference } from '../api.js';
import { listBenchmarks, updateBenchmark, deleteBenchmark, listMyLeads } from '../lib/dashboardApi.js';

// Action pipeline the user moves each benchmark through.
const STAGES = [
  { key: 'new', label: 'Not started' },
  { key: 'email', label: 'Email drafted' },
  { key: 'call', label: 'Call booked' },
  { key: 'expert', label: 'Expert engaged' },
  { key: 'negotiated', label: 'Negotiated' },
];
const stageIndex = (s) => Math.max(0, STAGES.findIndex((x) => x.key === s));

const LOAN_IDS = new Set(['housing_loan', 'personal_loan', 'vehicle_loan']);
const FX_IDS = new Set(['cross_border']);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function UserDashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);
  const [myLeads, setMyLeads] = useState([]); // paid calls + expert requests

  const load = () => {
    listBenchmarks().then(setRows).catch((e) => { setError(e.message || 'Could not load your benchmarks.'); setRows([]); });
    listMyLeads().then(setMyLeads).catch(() => setMyLeads([]));
  };
  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);
  useEffect(() => { getReference().then((r) => setProducts(r.products || [])).catch(() => {}); }, []);

  const active = useMemo(() => (rows || []).filter((r) => r.stage !== 'dismissed'), [rows]);
  const potential = useMemo(
    () => active.filter((r) => r.stage !== 'negotiated').reduce((s, r) => s + num(r.annual_saving), 0),
    [active]
  );
  const realised = useMemo(
    () => active.filter((r) => r.stage === 'negotiated').reduce((s, r) => s + num(r.saved_amount ?? r.annual_saving), 0),
    [active]
  );

  // Derived headline metrics for the mockup's KPI row.
  const loans = useMemo(() => active.filter((r) => LOAN_IDS.has(r.product)), [active]);
  const fx = useMemo(() => active.filter((r) => FX_IDS.has(r.product)), [active]);
  const bestLoan = useMemo(() => {
    const withRate = loans.filter((r) => Number.isFinite(Number(r.benchmark_rate)));
    if (!withRate.length) return null;
    return withRate.reduce((a, b) => (Number(b.benchmark_rate) < Number(a.benchmark_rate) ? b : a));
  }, [loans]);
  const fxSaving = useMemo(() => fx.reduce((s, r) => s + num(r.annual_saving), 0), [fx]);
  const recentFx = useMemo(
    () => [...fx].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null,
    [fx]
  );

  // Current vs optimised annual cost, computed from stored inputs (cost products only).
  const costBars = useMemo(() => {
    let current = 0, optimized = 0;
    for (const r of active) {
      if (r.direction === 'higher') continue; // yields aren't "costs"
      const amt = num(r.inputs?.amount);
      if (!amt || !Number.isFinite(Number(r.your_rate)) || !Number.isFinite(Number(r.benchmark_rate))) continue;
      current += (Number(r.your_rate) / 100) * amt;
      optimized += (Number(r.benchmark_rate) / 100) * amt;
    }
    return { current: Math.round(current), optimized: Math.round(optimized) };
  }, [active]);

  // Recommend products in the user's segments they haven't benchmarked yet.
  const recommendations = useMemo(() => {
    if (!products.length || !rows) return [];
    const segs = new Set(active.map((r) => r.segment).filter(Boolean));
    if (!segs.size) segs.add('individual');
    const done = new Set(active.map((r) => r.product));
    return products.filter((p) => p.segments?.some((s) => segs.has(s)) && !done.has(p.id)).slice(0, 4);
  }, [products, rows, active]);

  const setStage = async (row, stage) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, stage } : r)));
    try { await updateBenchmark(row.id, { stage }); } catch { load(); }
  };
  const setSaved = async (row, saved_amount) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, saved_amount } : r)));
    try { await updateBenchmark(row.id, { saved_amount: saved_amount === '' ? null : Number(saved_amount) }); } catch { load(); }
  };
  const remove = async (row) => {
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    try { await deleteBenchmark(row.id); } catch { load(); }
  };

  const firstName = user?.user_metadata?.full_name ? user.user_metadata.full_name.split(' ')[0] : '';
  const hasData = active.length > 0;

  return (
    <DashboardLayout eyebrow="Your dashboard" title={`Welcome back${firstName ? `, ${firstName}` : ''}!`}>
      <p className="dash__subtitle">Let’s optimise your banking costs.</p>

      {/* ---- KPI row (4 headline metrics) ---- */}
      <div className="udash__kpis">
        <KpiCard icon="🐷" label="Estimated savings" value={`${formatMoney(Math.round(potential), 'SGD')}`}
          unit="/ year" sub="Potential annual savings" tone="accent" />
        <KpiCard icon="🏠" label="Best loan rate found"
          value={bestLoan ? `${bestLoan.benchmark_rate}%` : '—'}
          sub={bestLoan ? bestLoan.product_label || 'Loan' : 'Run a loan benchmark'} tone="green" />
        <KpiCard icon="💱" label="FX transfer savings"
          value={fxSaving > 0 ? formatMoney(Math.round(fxSaving), recentFx?.currency || 'SGD') : '—'}
          sub={fx.length ? 'Lower transfer costs' : 'Run an FX benchmark'} />
        <KpiCard icon="✈️" label="Recent remittance"
          value={recentFx ? `${formatMoney(num(recentFx.inputs?.sent_amount), recentFx.inputs?.send_currency || recentFx.currency || 'SGD')}` : '—'}
          sub={recentFx ? `Sent ${recentFx.inputs?.send_currency || ''} · optimised FX rate` : 'No transfers yet'} />
      </div>

      {hasData && (
        <div className="udash__two">
          {/* ---- Savings overview ---- */}
          <section className="dash-card udash__panel">
            <div className="udash__panel-head"><h2>Your savings overview</h2></div>
            <div className="udash__save-hero">
              <span>You could save up to</span>
              <div className="udash__save-badge">{formatMoney(Math.round(potential), 'SGD')}<em>/ year</em></div>
            </div>
            {costBars.current > 0 ? (
              <div className="udash__bars">
                <Bar label="Current costs" value={costBars.current} max={costBars.current} tone="red" />
                <Bar label="Optimised costs" value={costBars.optimized} max={costBars.current} tone="green" />
              </div>
            ) : (
              <p className="udash__hint">Add your current rate and amount to a benchmark to see a cost comparison.</p>
            )}
            <a className="udash__link" href="#reports">View detailed report →</a>
          </section>

          {/* ---- Loan comparison ---- */}
          <section className="dash-card udash__panel">
            <div className="udash__panel-head"><h2>Loan comparison</h2></div>
            {loans.length ? (
              <div className="udash__cmp">
                {loans.slice(0, 3).map((r) => (
                  <div className="udash__cmp-row" key={r.id}>
                    <span className="udash__cmp-name">{r.product_label || r.product}</span>
                    <span className="udash__cmp-you">{r.your_rate != null ? `${r.your_rate}%` : '—'}</span>
                    <span className="udash__cmp-arrow">→</span>
                    <span className="udash__cmp-best">✓ {r.benchmark_rate != null ? `${r.benchmark_rate}%` : '—'}</span>
                  </div>
                ))}
                <a className="btn btn--navy udash__cmp-cta" href="#top">See loan options</a>
              </div>
            ) : (
              <p className="udash__hint">No loan benchmarks yet. <a href="#top">Benchmark a loan →</a></p>
            )}
          </section>

          {/* ---- FX transfer analysis ---- */}
          {recentFx && (
            <section className="dash-card udash__panel">
              <div className="udash__panel-head"><h2>FX transfer analysis</h2></div>
              <div className="udash__fx">
                <div className="udash__fx-line">
                  <span>Recent transfer</span>
                  <strong>{formatMoney(num(recentFx.inputs?.sent_amount), recentFx.inputs?.send_currency || 'SGD')}</strong>
                </div>
                <div className="udash__fx-line"><span>Your all-in cost</span><strong>{recentFx.your_rate != null ? `${recentFx.your_rate}%` : '—'}</strong></div>
                <div className="udash__fx-line"><span>Best available</span><strong className="is-best">{recentFx.benchmark_rate != null ? `${recentFx.benchmark_rate}%` : '—'}</strong></div>
                {num(recentFx.annual_saving) > 0 && (
                  <div className="udash__fx-save">+ {formatMoney(Math.round(num(recentFx.annual_saving)), recentFx.currency || 'SGD')} potential savings</div>
                )}
              </div>
              <a className="btn btn--navy udash__cmp-cta" href="#top">Compare rates</a>
            </section>
          )}

          {/* ---- Offers & recommendations ---- */}
          <section className="dash-card udash__panel">
            <div className="udash__panel-head"><h2>Offers &amp; recommendations</h2></div>
            <ul className="udash__offers">
              {recommendations.length ? recommendations.map((p) => (
                <li key={p.id}><a href="#top">{p.label} — {p.blurb}</a></li>
              )) : <li className="udash__hint">You’ve benchmarked everything in your segment. Nice work.</li>}
            </ul>
            <div className="udash__expert">
              <div>
                <strong>Need a better deal?</strong>
                <span>Connect with an expert negotiator to save more.</span>
              </div>
              <a className="btn btn--primary" href="#top">Get negotiation help</a>
            </div>
          </section>
        </div>
      )}

      {/* ---- My benchmarks (functional pipeline) ---- */}
      <h2 className="dash__section-title" id="my-savings">My savings &amp; benchmarks</h2>
      {error && <p className="dash__err">{error}</p>}
      {rows == null ? (
        <p className="dash__note">Loading…</p>
      ) : active.length === 0 ? (
        <div className="dash__empty">
          <div className="dash__empty-icon">📊</div>
          <h3>No saved benchmarks yet</h3>
          <p>Run a benchmark and hit “Save to my dashboard” to start tracking your savings.</p>
          <a className="btn btn--primary" href="#top">Calculate a benchmark →</a>
        </div>
      ) : (
        <div className="ubm__list">
          {active.map((r) => (
            <article className="ubm" key={r.id}>
              <div className="ubm__top">
                <div>
                  <div className="ubm__product">{r.product_label || r.product}{r.currency ? ` · ${r.currency}` : ''}</div>
                  <div className="ubm__meta">{r.country_code} · saved {new Date(r.created_at).toLocaleDateString()}</div>
                </div>
                <button className="ubm__del" onClick={() => remove(r)} aria-label="Remove">✕</button>
              </div>

              <div className="ubm__rates">
                <div><span>You</span><strong>{r.your_rate ?? '—'}</strong></div>
                <div className="ubm__arrow">→</div>
                <div className="ubm__best"><span>Best{r.best_bank ? ` · ${r.best_bank}` : ''}</span><strong>{r.benchmark_rate ?? '—'}</strong></div>
                <div className="ubm__save">
                  <span>{r.direction === 'higher' ? 'Extra / yr' : 'Save / yr'}</span>
                  <strong>{formatMoney(Math.round(num(r.annual_saving)), r.currency || 'SGD')}</strong>
                </div>
              </div>

              {/* Action pipeline */}
              <div className="ubm__pipe">
                {STAGES.map((s, i) => (
                  <button
                    key={s.key}
                    className={`ubm__stage ${i <= stageIndex(r.stage) ? 'is-done' : ''} ${r.stage === s.key ? 'is-current' : ''}`}
                    onClick={() => setStage(r, s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {r.stage === 'negotiated' && (
                <label className="ubm__realised">
                  Actual saving secured
                  <input type="number" min="0" step="100" value={r.saved_amount ?? ''} placeholder={String(Math.round(num(r.annual_saving)))}
                    onChange={(e) => setSaved(r, e.target.value)} />
                </label>
              )}
            </article>
          ))}
        </div>
      )}

      {realised > 0 && (
        <p className="udash__realised-note">💚 You’ve realised {formatMoney(Math.round(realised), 'SGD')} in savings so far.</p>
      )}

      {/* ---- Consultations & bookings (paid calls + expert requests) ---- */}
      {myLeads.length > 0 && (
        <>
          <h2 className="dash__section-title" id="my-consultations">My consultations &amp; bookings</h2>
          <div className="ubk__list">
            {myLeads.map((l) => (
              <article className="ubk" key={l.id}>
                <span className="ubk__icon" aria-hidden="true">{l.source === 'expert' ? '🧑‍💼' : '📞'}</span>
                <div className="ubk__body">
                  <div className="ubk__title">
                    {l.source === 'expert' ? 'Expert-led negotiation' : 'Negotiation coaching call'}
                    {l.booked && <span className="ubk__badge">Booked</span>}
                  </div>
                  <div className="ubk__meta">
                    {l.product_label || 'Banking'}
                    {l.segment ? ` · ${l.segment === 'sme' ? 'SME / Corporate' : 'Individual'}` : ''}
                    {' · '}{new Date(l.created_at).toLocaleDateString()}
                  </div>
                </div>
                {num(l.annual_saving) > 0 && (
                  <div className="ubk__save">
                    <span>Opportunity</span>
                    <strong>{formatMoney(Math.round(num(l.annual_saving)), 'SGD')}/yr</strong>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {recommendations.length > 0 && !hasData && (
        <>
          <h2 className="dash__section-title">Recommended next</h2>
          <div className="dash__grid dash__cards-3 ureco">
            {recommendations.map((p) => (
              <a className="dash-card ureco__card" href="#top" key={p.id}>
                <div className="ureco__title">{p.label}</div>
                <div className="ureco__blurb">{p.blurb}</div>
                <div className="ureco__cta">Benchmark it →</div>
              </a>
            ))}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

function KpiCard({ icon, label, value, unit, sub, tone }) {
  return (
    <div className={`udash__kpi ${tone ? `udash__kpi--${tone}` : ''}`}>
      <div className="udash__kpi-head"><span className="udash__kpi-label">{label}</span><span className="udash__kpi-icon" aria-hidden="true">{icon}</span></div>
      <div className="udash__kpi-value">{value}{unit && <em>{unit}</em>}</div>
      <div className="udash__kpi-sub">{sub}</div>
    </div>
  );
}

function Bar({ label, value, max, tone }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="udash__bar">
      <div className="udash__bar-track"><div className={`udash__bar-fill udash__bar-fill--${tone}`} style={{ width: `${pct}%` }} /></div>
      <div className="udash__bar-meta"><span>{label}</span><strong>{formatMoney(value, 'SGD')}</strong></div>
    </div>
  );
}
