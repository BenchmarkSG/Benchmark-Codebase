import { useEffect, useMemo, useState } from 'react';
import './userDashboard.css';
import DashboardLayout from './DashboardLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { formatMoney, getReference, createCheckout, getRevealPrice } from '../api.js';
import { listBenchmarks, updateBenchmark, deleteBenchmark, listMyLeads } from '../lib/dashboardApi.js';
import { isStripeCheckoutUrl } from '../lib/safeUrl.js';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { formatDate } from '../lib/formatDate.js';
import JourneyModal from '../components/JourneyModal.jsx';
import AccountSettings from './AccountSettings.jsx';

// A rate value with its unit (defaults to %), so "3.5" never renders unit-less.
const rate = (v, unit) => (v == null || v === '' ? '—' : `${v}${unit ? ` ${unit}` : '%'}`);

// A saved benchmark's `stage`. It stays 'new' (bank hidden) until the ~$1 reveal
// is paid → 'revealed' (bank shown; draft the email free or upgrade to a call /
// expert), then 'call' / 'expert' once those are booked, or 'negotiated' at the end.
const TIER_META = {
  revealed:   { icon: '🔓', label: 'Bank revealed',   view: 'options', tier: 'reveal', manage: 'View bank & draft email' },
  email:      { icon: '🔓', label: 'Bank revealed',   view: 'email',   tier: 'reveal', manage: 'View bank & email draft' },
  call:       { icon: '📞', label: 'Coaching call',   view: 'call',    tier: 'call',   manage: 'Manage your call' },
  expert:     { icon: '🧑‍💼', label: 'Expert engaged',  view: 'expert',  tier: 'expert', manage: 'Manage your expert' },
  negotiated: { icon: '✅', label: 'Negotiated',      view: null,      tier: null,     manage: null },
};
const isUnlocked = (r) => !!r.stage && r.stage !== 'new';

// Localized ~S$1 reveal price label ("S$1", "₹75", …), cached per currency so a
// dashboard of many rows fetches each market's price once.
const priceCache = {};
function RevealPriceLabel({ currency }) {
  const ccy = (currency || 'SGD').toUpperCase();
  const [label, setLabel] = useState(priceCache[ccy] || null);
  useEffect(() => {
    if (priceCache[ccy]) { setLabel(priceCache[ccy]); return; }
    let on = true;
    getRevealPrice(ccy).then((p) => {
      const l = p ? formatMoney(p.major, p.currency?.toUpperCase() || ccy) : formatMoney(1, 'SGD');
      priceCache[ccy] = l;
      if (on) setLabel(l);
    });
    return () => { on = false; };
  }, [ccy]);
  return label || '~S$1';
}

// Dashboard tabs, kept in the URL hash (#dashboard/account) so refresh, deep
// links and the Back button all work.
const USER_TABS = [
  { key: 'benchmarks', label: 'My benchmarks' },
  { key: 'account', label: 'Account settings' },
];
const readUserTab = () => {
  const seg = window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '').split('/')[1] || 'benchmarks';
  return USER_TABS.some((t) => t.key === seg) ? seg : 'benchmarks';
};

const LOAN_IDS = new Set(['housing_loan', 'personal_loan', 'vehicle_loan']);
const FX_IDS = new Set(['cross_border']);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function UserDashboard() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [rows, setRows] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(''); // transient "couldn't save" feedback
  const [products, setProducts] = useState([]);
  const [myLeads, setMyLeads] = useState([]); // paid calls + expert requests + reveals
  const [journey, setJourney] = useState(null); // { ctx, resume } — options/manage flow
  const [tab, setTab] = useState(readUserTab);

  // Keep the tab in sync with Back/Forward navigation.
  useEffect(() => {
    const on = () => setTab(readUserTab());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);

  const failFlash = () => { setFlash('Couldn’t save that change — please try again.'); setTimeout(() => setFlash(''), 3500); };

  const load = () => {
    listBenchmarks().then(setRows).catch((e) => { setError(e.message || 'Could not load your benchmarks.'); setRows([]); });
    listMyLeads().then(setMyLeads).catch(() => setMyLeads([]));
  };
  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user]);
  useEffect(() => { getReference().then((r) => setProducts(r.products || [])).catch(() => {}); }, []);

  const active = useMemo(() => (rows || []).filter((r) => r.stage !== 'dismissed'), [rows]);
  // Never add different currencies together — headline figures use the user's
  // most common currency, and only rows in that currency roll up into them.
  const baseCcy = useMemo(() => {
    const counts = {};
    for (const r of active) { const c = r.currency || 'SGD'; counts[c] = (counts[c] || 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'SGD';
  }, [active]);
  const inBase = (r) => (r.currency || 'SGD') === baseCcy;
  const potential = useMemo(
    () => active.filter((r) => inBase(r) && r.stage !== 'negotiated').reduce((s, r) => s + num(r.annual_saving), 0),
    [active, baseCcy] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const realised = useMemo(
    () => active.filter((r) => inBase(r) && r.stage === 'negotiated').reduce((s, r) => s + num(r.saved_amount ?? r.annual_saving), 0),
    [active, baseCcy] // eslint-disable-line react-hooks/exhaustive-deps
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
      if (!inBase(r)) continue; // keep the comparison within one currency
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
    try { await updateBenchmark(row.id, { stage }); } catch { failFlash(); load(); }
  };
  // Type freely (local state only); persist once on blur — no per-keystroke writes.
  const setSavedLocal = (row, saved_amount) =>
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, saved_amount } : r)));
  const persistSaved = async (row, value) => {
    try { await updateBenchmark(row.id, { saved_amount: value === '' || value == null ? null : Number(value) }); }
    catch { failFlash(); load(); }
  };
  const remove = async (row) => {
    const ok = await confirm({
      title: 'Delete this benchmark?',
      body: 'This removes it from your dashboard and can’t be undone.',
      confirmLabel: 'Delete', cancelLabel: 'Keep',
    });
    if (!ok) return;
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    try { await deleteBenchmark(row.id); } catch { failFlash(); load(); }
  };

  // Open the tier flow (JourneyModal) on the dashboard itself — no route home.
  // Purchases/upgrades run through it; on close we reload so newly-unlocked
  // benchmarks reveal their bank.
  const contextFromBenchmark = (r) => ({
    segment: r.segment, annualSaving: r.annual_saving, currency: r.currency, unit: r.unit,
    direction: r.direction, status: r.result_status, bestBank: r.best_bank,
    product: r.product_label || r.product, yourRate: r.your_rate, benchmarkRate: r.benchmark_rate,
    benchmarkId: r.id,
  });
  const openJourney = (r, resume) => setJourney({ ctx: contextFromBenchmark(r), resume });
  const openTier = (r, view) => openJourney(r, { afterAuth: true, view });               // buy a tier
  const openManage = (r) => { const tv = TIER_META[r.stage] || {}; openJourney(r, { afterAuth: true, view: tv.view || 'options', unlockedTier: tv.tier || null }); };
  // Compare / upgrade. Passes what they already own, so the options screen can
  // mark those tiers as theirs instead of trying to sell them again.
  const openOptions = (r) => openJourney(r, {
    afterAuth: true, view: 'options', unlockedTier: TIER_META[r.stage]?.tier || null,
  });
  const closeJourney = () => { setJourney(null); load(); };

  // Pay the ~$1 reveal for a saved benchmark (user is already signed in here).
  // On return the benchmark's stage becomes 'revealed' and its bank appears.
  // Falls back to a demo reveal if Stripe isn't configured.
  const revealBank = async (r) => {
    const ctx = contextFromBenchmark(r);
    try {
      sessionStorage.setItem('bb_journey', JSON.stringify({ tier: 'reveal', context: ctx }));
      const { url } = await createCheckout({
        tier: 'reveal', currency: ctx.currency || 'SGD',
        product: ctx.product || null, segment: ctx.segment || 'individual', email: user?.email || undefined,
      });
      if (!isStripeCheckoutUrl(url)) throw new Error('Unexpected checkout URL');
      window.location.assign(url);
    } catch (err) {
      sessionStorage.removeItem('bb_journey');
      // Only unlock for free when Stripe genuinely isn't configured — a network
      // blip must not give the paid reveal away.
      if (!/not configured/i.test(err?.message || '')) {
        setFlash('We couldn’t start the secure checkout — please try again.');
        setTimeout(() => setFlash(''), 3500);
        return;
      }
      setStage(r, 'revealed'); // demo: unlock locally + persist
      openJourney({ ...r, stage: 'revealed' }, { tier: 'reveal', demo: true });
    }
  };

  const firstName = user?.user_metadata?.full_name ? user.user_metadata.full_name.split(' ')[0] : '';
  const hasData = active.length > 0;

  const goTab = (key) => {
    setTab(key);
    const next = key === 'benchmarks' ? '#dashboard' : `#dashboard/${key}`;
    if (window.location.hash !== next) window.history.pushState(null, '', next);
  };

  return (
    <DashboardLayout
      eyebrow="Your dashboard"
      title={`Welcome back${firstName ? `, ${firstName}` : ''}!`}
      tabs={USER_TABS}
      activeTab={tab}
      onTab={goTab}
    >
      {tab === 'account' ? (
        <AccountSettings role="user" />
      ) : (
      <>
      <p className="dash__subtitle">Let’s optimise your banking costs.</p>

      {flash && <div className="dash__flash" role="status">{flash}</div>}

      {/* ---- KPI row (only once there's data — no misleading $0 / — for new users) ---- */}
      {hasData && (
        <div className="udash__kpis">
          <KpiCard label="Estimated savings" value={`${formatMoney(Math.round(potential), baseCcy)}`}
            unit="/ year" sub="Potential annual savings" tone="accent" />
          <KpiCard label="Best loan rate found"
            value={bestLoan ? `${bestLoan.benchmark_rate}%` : '—'}
            sub={bestLoan ? bestLoan.product_label || 'Loan' : 'Run a loan benchmark'} tone="green" />
          <KpiCard label="FX transfer savings"
            value={fxSaving > 0 ? formatMoney(Math.round(fxSaving), recentFx?.currency || baseCcy) : '—'}
            sub={fx.length ? 'Lower transfer costs' : 'Run an FX benchmark'} />
          <KpiCard label="Recent remittance"
            value={recentFx ? `${formatMoney(num(recentFx.inputs?.sent_amount), recentFx.inputs?.send_currency || recentFx.currency || 'SGD')}` : '—'}
            sub={recentFx ? `Sent ${recentFx.inputs?.send_currency || ''} · optimised FX rate` : 'No transfers yet'} />
        </div>
      )}

      {hasData && (
        <div className="udash__two">
          {/* ---- Savings overview ---- */}
          <section className="dash-card udash__panel">
            <div className="udash__panel-head"><h2>Your savings overview</h2></div>
            <div className="udash__save-hero">
              <span>You could save up to</span>
              <div className="udash__save-badge">{formatMoney(Math.round(potential), baseCcy)}<em>/ year</em></div>
            </div>
            {costBars.current > 0 ? (
              <div className="udash__bars">
                <Bar label="Current costs" value={costBars.current} max={costBars.current} tone="red" ccy={baseCcy} />
                <Bar label="Optimised costs" value={costBars.optimized} max={costBars.current} tone="green" ccy={baseCcy} />
              </div>
            ) : (
              <p className="udash__hint">Add your current rate and amount to a benchmark to see a cost comparison.</p>
            )}
            <a
              className="udash__link" href="#my-savings"
              onClick={(e) => { e.preventDefault(); document.getElementById('my-savings')?.scrollIntoView({ behavior: 'smooth' }); }}
            >View detailed report →</a>
          </section>

          {/* ---- Loan comparison ---- */}
          <section className="dash-card udash__panel">
            <div className="udash__panel-head"><h2>Loan comparison</h2></div>
            {loans.length ? (
              <div className="udash__cmp">
                {loans.slice(0, 3).map((r) => (
                  <div className="udash__cmp-row" key={r.id}>
                    <span className="udash__cmp-name">{r.product_label || r.product}</span>
                    <span className="udash__cmp-you">{rate(r.your_rate, r.unit)}</span>
                    <span className="udash__cmp-arrow">→</span>
                    <span className="udash__cmp-best">✓ {rate(r.benchmark_rate, r.unit)}</span>
                  </div>
                ))}
                <a className="btn btn--navy udash__cmp-cta" href="#calculator">See loan options</a>
              </div>
            ) : (
              <p className="udash__hint">No loan benchmarks yet. <a href="#calculator">Benchmark a loan →</a></p>
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
                <div className="udash__fx-line"><span>Your all-in cost</span><strong>{rate(recentFx.your_rate, recentFx.unit)}</strong></div>
                <div className="udash__fx-line"><span>Best available</span><strong className="is-best">{rate(recentFx.benchmark_rate, recentFx.unit)}</strong></div>
                {num(recentFx.annual_saving) > 0 && (
                  <div className="udash__fx-save">+ {formatMoney(Math.round(num(recentFx.annual_saving)), recentFx.currency || 'SGD')} potential savings</div>
                )}
              </div>
              <a className="btn btn--navy udash__cmp-cta" href="#calculator">Compare rates</a>
            </section>
          )}

          {/* ---- Offers & recommendations ---- */}
          <section className="dash-card udash__panel">
            <div className="udash__panel-head"><h2>Offers &amp; recommendations</h2></div>
            <ul className="udash__offers">
              {recommendations.length ? recommendations.map((p) => (
                <li key={p.id}><a href="#calculator">{p.label} — {p.blurb}</a></li>
              )) : <li className="udash__hint">You’ve benchmarked everything in your segment. Nice work.</li>}
            </ul>
            <div className="udash__expert">
              <div>
                <strong>Need a better deal?</strong>
                <span>Connect with an expert negotiator to save more.</span>
              </div>
              <a className="btn btn--primary" href="#calculator">Get negotiation help</a>
            </div>
          </section>
        </div>
      )}

      {/* ---- My benchmarks (functional pipeline) ---- */}
      <h2 className="dash__section-title" id="my-savings">My savings &amp; benchmarks</h2>
      {error && <p className="dash__err">{error}</p>}
      {rows == null ? (
        <div className="dash__loading" role="status" aria-live="polite"><span className="dash__spinner" aria-hidden="true" /> Loading your benchmarks…</div>
      ) : active.length === 0 ? (
        <div className="dash__empty">
          <div className="dash__empty-icon">📊</div>
          <h3>No saved benchmarks yet</h3>
          <p>Run a benchmark and hit “Save to my dashboard” to start tracking your savings.</p>
          <a className="btn btn--primary" href="#calculator">Calculate a benchmark →</a>
        </div>
      ) : (
        <div className="ubm__list">
          {active.map((r) => (
            <article className="ubm" key={r.id}>
              <div className="ubm__top">
                <div>
                  <div className="ubm__product">{r.product_label || r.product}{r.currency ? ` · ${r.currency}` : ''}</div>
                  <div className="ubm__meta">{r.country_code} · saved {formatDate(r.created_at)}</div>
                </div>
                <div className="ubm__topright">
                  {isUnlocked(r) && (
                    <span className={`ubm__tier ubm__tier--${r.stage}`}>{TIER_META[r.stage]?.icon} {TIER_META[r.stage]?.label}</span>
                  )}
                  <button className="ubm__del" onClick={() => remove(r)} aria-label={`Remove ${r.product_label || r.product} benchmark`}>✕</button>
                </div>
              </div>

              <div className="ubm__rates">
                <div><span>You</span><strong>{rate(r.your_rate, r.unit)}</strong></div>
                <div className="ubm__arrow">→</div>
                <div className="ubm__best"><span>Best available</span><strong>{rate(r.benchmark_rate, r.unit)}</strong></div>
                <div className="ubm__save">
                  <span>{r.direction === 'higher' ? 'Extra / yr' : 'Save / yr'}</span>
                  <strong>{formatMoney(Math.round(num(r.annual_saving)), r.currency || 'SGD')}</strong>
                </div>
              </div>

              {/* Bank name — hidden until a tier is unlocked */}
              {isUnlocked(r) ? (
                <div className="ubm__bank ubm__bank--open">
                  <span className="ubm__bank-label">Best-match bank</span>
                  <strong>🏦 {r.best_bank || 'Revealed'}</strong>
                </div>
              ) : (
                <div className="ubm__bank ubm__bank--locked">
                  <span className="ubm__bank-lock">🔒 Best-match bank hidden</span>
                  <span className="ubm__bank-hint">Pick an option below to reveal it.</span>
                </div>
              )}

              {/* Forward actions */}
              {r.stage === 'negotiated' ? (
                <label className="ubm__realised">
                  Actual saving secured
                  <input type="number" min="0" step="100" value={r.saved_amount ?? ''} placeholder={String(Math.round(num(r.annual_saving)))}
                    onChange={(e) => setSavedLocal(r, e.target.value)} onBlur={(e) => persistSaved(r, e.target.value)} />
                </label>
              ) : isUnlocked(r) ? (
                <div className="ubm__manage">
                  <button className="ubm__act ubm__act--primary" onClick={() => openManage(r)}>{TIER_META[r.stage]?.manage || 'View'} →</button>
                  <button className="ubm__act" onClick={() => openOptions(r)}>Upgrade options</button>
                  <button className="ubm__act ubm__act--done" onClick={() => setStage(r, 'negotiated')}>Mark as negotiated</button>
                </div>
              ) : r.result_status === 'ahead' ? (
                /* Already beating the market — there is no better bank to sell them. */
                <div className="ubm__options">
                  <span className="ubm__options-label">🎉 You're ahead of the market on this one — nothing to switch to. Benchmark your other products for savings.</span>
                </div>
              ) : (
                <div className="ubm__options">
                  <span className="ubm__options-label">Reveal your best-match bank to act on it:</span>
                  <button className="ubm__act ubm__act--primary ubm__reveal" onClick={() => revealBank(r)}>
                    🔓 Reveal the Best Bank →
                  </button>
                  <span className="ubm__options-hint">
                    <RevealPriceLabel currency={r.currency} /> charged securely. 100% cashback if not satisfied.
                  </span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {realised > 0 && (
        <p className="udash__realised-note">💚 You’ve realised {formatMoney(Math.round(realised), baseCcy)} in savings so far.</p>
      )}

      {/* ---- Past transactions (reveals, calls, expert requests) ---- */}
      {myLeads.length > 0 && (
        <>
          <h2 className="dash__section-title" id="my-transactions">Past transactions &amp; bookings</h2>
          <div className="ubk__list">
            {myLeads.map((l) => {
              const meta = l.source === 'expert'
                ? { icon: '🧑‍💼', title: 'Expert-led negotiation', badge: l.booked ? 'Booked' : 'Requested' }
                : l.source === 'reveal'
                  ? { icon: '🔓', title: 'Bank reveal — self-negotiate', badge: 'Unlocked' }
                  : { icon: '📞', title: 'Negotiation coaching call', badge: l.booked ? 'Booked' : 'Pending' };
              return (
                <article className="ubk" key={l.id}>
                  <span className="ubk__icon" aria-hidden="true">{meta.icon}</span>
                  <div className="ubk__body">
                    <div className="ubk__title">
                      {meta.title}
                      <span className="ubk__badge">{meta.badge}</span>
                    </div>
                    <div className="ubk__meta">
                      {l.product_label || 'Banking'}
                      {l.segment ? ` · ${l.segment === 'sme' ? 'SME / Corporate' : 'Individual'}` : ''}
                      {' · '}{formatDate(l.created_at)}
                    </div>
                  </div>
                  {num(l.annual_saving) > 0 && (
                    <div className="ubk__save">
                      <span>Opportunity</span>
                      <strong>{formatMoney(Math.round(num(l.annual_saving)), 'SGD')}/yr</strong>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {recommendations.length > 0 && !hasData && (
        <>
          <h2 className="dash__section-title">Recommended next</h2>
          <div className="dash__grid dash__cards-3 ureco">
            {recommendations.map((p) => (
              <a className="dash-card ureco__card" href="#calculator" key={p.id}>
                <div className="ureco__title">{p.label}</div>
                <div className="ureco__blurb">{p.blurb}</div>
                <div className="ureco__cta">Benchmark it →</div>
              </a>
            ))}
          </div>
        </>
      )}

      </>
      )}

      {/* Tier flow (options / purchase / manage) — runs on the dashboard itself. */}
      <JourneyModal
        open={!!journey}
        onClose={closeJourney}
        context={journey?.ctx || null}
        resume={journey?.resume || null}
        onRequireAuth={() => {}}
      />
    </DashboardLayout>
  );
}

function KpiCard({ label, value, unit, sub, tone }) {
  return (
    <div className={`udash__kpi ${tone ? `udash__kpi--${tone}` : ''}`}>
      <div className="udash__kpi-head"><span className="udash__kpi-label">{label}</span></div>
      <div className="udash__kpi-value">{value}{unit && <em>{unit}</em>}</div>
      <div className="udash__kpi-sub">{sub}</div>
    </div>
  );
}

function Bar({ label, value, max, tone, ccy = 'SGD' }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="udash__bar">
      <div className="udash__bar-track"><div className={`udash__bar-fill udash__bar-fill--${tone}`} style={{ width: `${pct}%` }} /></div>
      <div className="udash__bar-meta"><span>{label}</span><strong>{formatMoney(value, ccy)}</strong></div>
    </div>
  );
}
