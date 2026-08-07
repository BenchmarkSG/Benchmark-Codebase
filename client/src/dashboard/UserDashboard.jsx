import { useEffect, useMemo, useState } from 'react';
import './userDashboard.css';
import DashboardLayout from './DashboardLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatMoney, getReference } from '../api.js';
import { listBenchmarks, updateBenchmark, deleteBenchmark } from '../lib/dashboardApi.js';

// Action pipeline the user moves each benchmark through.
const STAGES = [
  { key: 'new', label: 'Not started' },
  { key: 'email', label: 'Email drafted' },
  { key: 'call', label: 'Call booked' },
  { key: 'expert', label: 'Expert engaged' },
  { key: 'negotiated', label: 'Negotiated' },
];
const stageIndex = (s) => Math.max(0, STAGES.findIndex((x) => x.key === s));

export default function UserDashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [products, setProducts] = useState([]);

  const load = () => {
    listBenchmarks().then(setRows).catch((e) => { setError(e.message || 'Could not load your benchmarks.'); setRows([]); });
  };
  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);
  useEffect(() => { getReference().then((r) => setProducts(r.products || [])).catch(() => {}); }, []);

  const active = useMemo(() => (rows || []).filter((r) => r.stage !== 'dismissed'), [rows]);
  const potential = useMemo(
    () => active.filter((r) => r.stage !== 'negotiated').reduce((s, r) => s + (Number(r.annual_saving) || 0), 0),
    [active]
  );
  const realised = useMemo(
    () => active.filter((r) => r.stage === 'negotiated').reduce((s, r) => s + (Number(r.saved_amount ?? r.annual_saving) || 0), 0),
    [active]
  );

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

  return (
    <DashboardLayout eyebrow="Your dashboard" title={`Welcome${user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name.split(' ')[0]}` : ''}`}>
      {/* Savings summary */}
      <div className="dash__grid dash__cards-3">
        <div className="dash-card">
          <div className="dash-card__label">Potential savings / year</div>
          <div className="dash-card__big dash-card__big--accent">{formatMoney(Math.round(potential), 'SGD')}</div>
          <div className="dash-card__sub">Across {active.filter((r) => r.stage !== 'negotiated').length} open benchmark(s)</div>
        </div>
        <div className="dash-card">
          <div className="dash-card__label">Realised savings</div>
          <div className="dash-card__big">{formatMoney(Math.round(realised), 'SGD')}</div>
          <div className="dash-card__sub">From negotiated products</div>
        </div>
        <div className="dash-card">
          <div className="dash-card__label">Benchmarks tracked</div>
          <div className="dash-card__big">{active.length}</div>
          <div className="dash-card__sub"><a href="#top">Run a new one →</a></div>
        </div>
      </div>

      <h2 className="dash__section-title">My benchmarks</h2>
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
                  <strong>{formatMoney(Math.round(Number(r.annual_saving) || 0), r.currency || 'SGD')}</strong>
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
                  <input type="number" min="0" step="100" value={r.saved_amount ?? ''} placeholder={String(Math.round(Number(r.annual_saving) || 0))}
                    onChange={(e) => setSaved(r, e.target.value)} />
                </label>
              )}
            </article>
          ))}
        </div>
      )}

      {recommendations.length > 0 && (
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
