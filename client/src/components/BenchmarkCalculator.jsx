import { useEffect, useMemo, useState } from 'react';
import './BenchmarkCalculator.css';
import { getReference, calcBenchmark, formatMoney } from '../api.js';

// SMEs and Corporates share the same product set, so they're combined into one tab.
const SEGMENT_TABS = [
  { key: 'individual', label: 'For Individuals' },
  { key: 'sme', label: 'For SMEs / Corporates' },
];

// Currencies offered for a product, given the selected country's local currency.
function currenciesFor(product, localCcy) {
  if (!product) return [localCcy];
  if (product.currencyMode === 'usd') return ['USD'];
  if (product.currencyMode === 'localusd') return [localCcy, 'USD'];
  return [localCcy]; // 'local'
}

export default function BenchmarkCalculator({ onDetailedFeedback, compact = false }) {
  const [ref, setRef] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    segment: 'individual',
    country: 'SG',
    product: 'mortgage',
    currency: 'SGD',
    yourRate: '',
    amount: 500000,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getReference().then(setRef).catch(() => setError('Could not load reference data.'));
  }, []);

  const countries = ref?.countries ?? [];
  const products = ref?.products ?? [];
  const localCcy = useMemo(
    () => countries.find((c) => c.code === form.country)?.currency || 'SGD',
    [countries, form.country]
  );
  const currentProduct = useMemo(
    () => products.find((p) => p.id === form.product),
    [products, form.product]
  );
  const currencyOptions = useMemo(
    () => currenciesFor(currentProduct, localCcy),
    [currentProduct, localCcy]
  );
  const segmentProducts = useMemo(
    () => products.filter((p) => p.segments?.includes(form.segment)),
    [products, form.segment]
  );

  function update(patch) { setForm((f) => ({ ...f, ...patch })); }

  // Keep the product valid for the chosen segment.
  function changeSegment(segment) {
    const list = products.filter((p) => p.segments?.includes(segment));
    const nextId = list.some((p) => p.id === form.product) ? form.product : list[0]?.id;
    const opts = currenciesFor(products.find((p) => p.id === nextId), localCcy);
    update({ segment, product: nextId, currency: opts[0] });
  }

  // Keep currency valid whenever country/product changes.
  function changeCountry(country) {
    const ccy = countries.find((c) => c.code === country)?.currency || 'SGD';
    const opts = currenciesFor(currentProduct, ccy);
    update({ country, currency: opts.includes(form.currency) ? form.currency : opts[0] });
  }
  function changeProduct(id) {
    const p = products.find((x) => x.id === id);
    const opts = currenciesFor(p, localCcy);
    update({ product: id, currency: opts[0] });
  }

  async function compute(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await calcBenchmark({
        country: form.country,
        product: form.product,
        currency: form.currency,
        yourRate: form.yourRate === '' ? undefined : Number(form.yourRate),
        amount: Number(form.amount),
      });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Something went wrong calculating your benchmark.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={compact ? 'calc-sec calc-sec--compact' : 'section calc-sec'} id="calculator">
      <div className={compact ? 'calc-card' : 'container'}>
        {compact ? (
          <div className="calc-card__head">
            <h3 className="calc-card__title">Calculate Your Free Benchmark</h3>
            <p className="calc-card__sub">Live rates · no sign-up · no data stored</p>
          </div>
        ) : (
          <>
            <span className="eyebrow calc-sec__eyebrow">Free Benchmark · No sign-up · No data stored</span>
            <h2 className="section-title">Start Your Free Comparison Now</h2>
            <p className="section-sub">
              Pick a market and product, enter your current rate — it benchmarks against live data
              instantly. We show your savings; the winning providers stay hidden until you request a reveal.
            </p>
          </>
        )}

        <div className={`calcbox ${compact ? 'calcbox--compact' : ''}`}>
          {(!compact || !result) && (
            <form className="calcbox__form" onSubmit={compute}>
              <div className="calcbox__seg">
                {SEGMENT_TABS.map(({ key, label }) => (
                  <button
                    type="button"
                    key={key}
                    className={`calcbox__seg-btn ${form.segment === key ? 'is-active' : ''}`}
                    onClick={() => changeSegment(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="calcbox__row">
                <label className="calcbox__field">
                  <span>Market</span>
                  <select value={form.country} onChange={(e) => changeCountry(e.target.value)}>
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </label>
                <label className="calcbox__field">
                  <span>Product</span>
                  <select value={form.product} onChange={(e) => changeProduct(e.target.value)}>
                    {segmentProducts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
              </div>

              <div className="calcbox__row">
                {currencyOptions.length > 1 && (
                  <label className="calcbox__field">
                    <span>Currency</span>
                    <select value={form.currency} onChange={(e) => update({ currency: e.target.value })}>
                      {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                )}
                <label className="calcbox__field">
                  <span>{currentProduct?.yourLabel || 'Your current rate (%)'}</span>
                  <input
                    type="number" min="0" step="0.01" placeholder="optional"
                    value={form.yourRate}
                    onChange={(e) => update({ yourRate: e.target.value })}
                  />
                </label>
              </div>

              <label className="calcbox__field">
                <span>{currentProduct?.amountLabel || 'Amount'} ({form.currency})</span>
                <input
                  type="number" min="0" step="1000"
                  value={form.amount}
                  onChange={(e) => update({ amount: e.target.value })}
                />
              </label>

              <button className="btn btn--red btn--block" type="submit" disabled={loading}>
                {loading ? 'Calculating…' : 'Compute My Free Benchmark →'}
              </button>
              {error && <p className="calcbox__error">{error}</p>}
              {!compact && (
                <p className="calcbox__consent">
                  🔒 We never store personal or account-identifying data. Only anonymised transactional
                  metrics improve the benchmark.
                </p>
              )}
            </form>
          )}

          {(!compact || result) && (
            <div className="calcbox__result">
              {!result ? (
                <Placeholder />
              ) : (
                <div className="res">
                  {compact && (
                    <button type="button" className="res__back" onClick={() => setResult(null)}>
                      ← Recalculate
                    </button>
                  )}
                  <div className="res__head">
                    <span>{result.product}{result.currency ? ` · ${result.currency}` : ''}</span>
                    <span className="res__unit">{result.unit}</span>
                  </div>

                  <div className="res__rates">
                    <div className="res__rate">
                      <div className="res__rate-label">You</div>
                      <div className="res__rate-val">{result.yourRate}</div>
                    </div>
                    <div className="res__arrow">→</div>
                    <div className="res__rate res__rate--best">
                      <div className="res__rate-label">🔒 Best benchmark</div>
                      <div className="res__rate-val">{result.benchmarkRate}</div>
                    </div>
                  </div>

                  <div className="res__saving">
                    <span>{result.direction === 'higher' ? 'You could earn extra' : 'You could save'}</span>
                    <strong>{formatMoney(result.annualSaving, result.currency)} / year</strong>
                    <small>≈ {formatMoney(result.monthlySaving, result.currency)} per month</small>
                  </div>

                  {!compact && (
                    <div className="res__locked">
                      🔒 {result.benchmarkLabel}. Market-typical is {result.marketTypical} {result.unit}.
                    </div>
                  )}

                  {!compact && result.tip && <p className="res__tip">💡 {result.tip}</p>}

                  <button className="btn btn--primary btn--block res__detail" onClick={() => onDetailedFeedback({ ...result, segment: form.segment })}>
                    Reveal the Bank &amp; Get Detailed Feedback →
                  </button>
                  {!compact && (
                    <small className="res__detail-note">
                      Free to see savings · Pay only a % of what we actually save you.
                    </small>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Placeholder() {
  return (
    <div className="calcbox__placeholder">
      <div className="calcbox__placeholder-icon">📊</div>
      <p>Your live benchmark appears here the moment you compute.</p>
      <small>Free instant estimate · Reveal &amp; negotiation are optional next steps.</small>
    </div>
  );
}
