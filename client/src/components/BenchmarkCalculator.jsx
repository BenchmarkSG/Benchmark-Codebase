import { useEffect, useMemo, useState } from 'react';
import './BenchmarkCalculator.css';
import { getReference, calcBenchmark, parseStatement, formatSGD } from '../api.js';

const SAMPLE_STATEMENT = `Outward TT / telegraphic transfer fee SGD 30
Intermediary agent fee SGD 25
Beneficiary receiving deduction SGD 15
FX conversion margin to India 1.8% on SGD 40,000
Overdraft interest 8.25%
Monthly account maintenance fee SGD 40`;

export default function BenchmarkCalculator({ onDetailedFeedback, compact = false }) {
  const [ref, setRef] = useState(null);
  const [mode, setMode] = useState('manual'); // 'manual' | 'paste'
  const [error, setError] = useState(null);

  // manual form state
  const [form, setForm] = useState({
    segment: 'individual',
    product: 'mortgage',
    variant: 'floating',
    corridor: 'SGD-INR',
    bank: 'DBS',
    amount: 500000,
    tenorYears: 20,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // paste state
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);

  useEffect(() => {
    getReference().then(setRef).catch(() => setError('Could not load reference data.'));
  }, []);

  const products = ref?.products ?? [];
  const currentProduct = useMemo(
    () => products.find((p) => p.id === form.product),
    [products, form.product]
  );
  const segmentProducts = useMemo(
    () => products.filter((p) => p.segment.includes(form.segment)),
    [products, form.segment]
  );

  function update(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  // Keep product valid for the chosen segment.
  function changeSegment(segment) {
    const allowed = products.filter((p) => p.segment.includes(segment));
    const stillValid = allowed.some((p) => p.id === form.product);
    const nextProduct = stillValid ? form.product : allowed[0]?.id;
    update({ segment, product: nextProduct });
  }

  function changeProduct(id) {
    const p = products.find((x) => x.id === id);
    update({
      product: id,
      variant: p?.variants?.[0]?.id ?? form.variant,
      tenorYears: p?.defaultTenor ?? form.tenorYears,
    });
  }

  const showTenor = currentProduct && !currentProduct.corridorBased && !currentProduct.volumeBased && currentProduct.rateType === 'apr';
  const amountLabel = currentProduct?.corridorBased || currentProduct?.volumeBased
    ? 'Monthly FX volume (SGD)'
    : currentProduct?.rateType === 'yield'
      ? 'Balance (SGD)'
      : 'Amount / outstanding (SGD)';

  async function computeManual(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await calcBenchmark({
        bank: form.bank,
        product: form.product,
        variant: form.variant,
        corridor: form.corridor,
        amount: Number(form.amount),
        tenorYears: Number(form.tenorYears),
      });
      setResult(res);
    } catch {
      setError('Something went wrong calculating your benchmark.');
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    setParsing(true);
    setError(null);
    try {
      const res = await parseStatement(text);
      setParsed(res);
    } catch {
      setError('Could not analyse that text.');
    } finally {
      setParsing(false);
    }
  }

  const isYield = result?.direction === 'higher';

  return (
    <section className={compact ? 'calc-sec calc-sec--compact' : 'section calc-sec'} id="calculator">
      <div className={compact ? 'calc-card' : 'container'}>
        {compact ? (
          <div className="calc-card__head">
            <h3 className="calc-card__title">Calculate Your Free Benchmark</h3>
            <p className="calc-card__sub">Instant · no sign-up · no data stored</p>
          </div>
        ) : (
          <>
            <span className="eyebrow calc-sec__eyebrow">Free Benchmark · No sign-up · No data stored</span>
            <h2 className="section-title">Start Your Free Comparison Now</h2>
            <p className="section-sub">
              Enter a few details or paste a statement line — it benchmarks right here, instantly.
              We show your savings; the winning providers stay hidden until you request a reveal.
            </p>
          </>
        )}

        <div className="calc-modes">
          <button className={mode === 'manual' ? 'is-active' : ''} onClick={() => setMode('manual')}>
            Manual entry
          </button>
          <button className={mode === 'paste' ? 'is-active' : ''} onClick={() => setMode('paste')}>
            Paste statement / transaction
          </button>
        </div>

        {mode === 'manual' ? (
          <div className={`calcbox ${compact ? 'calcbox--compact' : ''}`}>
            {/* Inputs — hidden once a result is shown in compact mode */}
            {(!compact || !result) && (
            <form className="calcbox__form" onSubmit={computeManual}>
              <div className="calcbox__seg">
                {ref &&
                  Object.entries(ref.segments).map(([key, label]) => (
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
                  <span>Product</span>
                  <select value={form.product} onChange={(e) => changeProduct(e.target.value)}>
                    {segmentProducts.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </label>

                {currentProduct?.variants ? (
                  <label className="calcbox__field">
                    <span>Type</span>
                    <select value={form.variant} onChange={(e) => update({ variant: e.target.value })}>
                      {currentProduct.variants.map((v) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                  </label>
                ) : currentProduct?.corridorBased ? (
                  <label className="calcbox__field">
                    <span>Corridor</span>
                    <select value={form.corridor} onChange={(e) => update({ corridor: e.target.value })}>
                      {ref?.corridors.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="calcbox__field">
                    <span>Your current bank</span>
                    <select value={form.bank} onChange={(e) => update({ bank: e.target.value })}>
                      {ref?.banks.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <label className="calcbox__field">
                <span>{amountLabel}</span>
                <input
                  type="number" min="0" step="1000"
                  value={form.amount}
                  onChange={(e) => update({ amount: e.target.value })}
                />
              </label>

              {showTenor && (
                <label className="calcbox__field">
                  <span>Tenor — <b>{form.tenorYears} yrs</b></span>
                  <input
                    type="range" min="1" max="35"
                    value={form.tenorYears}
                    onChange={(e) => update({ tenorYears: e.target.value })}
                  />
                </label>
              )}

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

            {/* Output — replaces the form in compact mode */}
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
                    <span>{result.product}{result.contextLabel ? ` · ${result.contextLabel}` : ''}</span>
                    <span className="res__unit">{result.unit}</span>
                  </div>

                  <div className="res__rates">
                    <div className="res__rate">
                      <div className="res__rate-label">You{result.bank ? ` · ${result.bank}` : ''}</div>
                      <div className="res__rate-val">{result.yourRate}</div>
                    </div>
                    <div className="res__arrow">→</div>
                    <div className="res__rate res__rate--best">
                      <div className="res__rate-label">🔒 Best benchmark</div>
                      <div className="res__rate-val">{result.benchmarkRate}</div>
                    </div>
                  </div>

                  <div className="res__saving">
                    <span>{isYield ? 'You could earn extra' : 'You could save'}</span>
                    <strong>{formatSGD(result.annualSaving)} / year</strong>
                    <small>≈ {formatSGD(result.monthlySaving)} per month</small>
                  </div>

                  {!compact && result.yourMonthly != null && (
                    <div className="res__repay">
                      <div><span>Your monthly</span><strong>{formatSGD(result.yourMonthly)}</strong></div>
                      <div><span>Benchmark monthly</span><strong className="accent-blue">{formatSGD(result.benchmarkMonthly)}</strong></div>
                    </div>
                  )}

                  {!compact && (
                    <div className="res__locked">
                      🔒 {result.benchmarkLabel}. Provider identity is hidden.
                    </div>
                  )}

                  {!compact && <p className="res__tip">💡 {result.tip}</p>}

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
        ) : (
          /* ---------- Paste mode ---------- */
          <div className={`calcbox calcbox--paste ${compact ? 'calcbox--compact' : ''}`}>
            {(!compact || !parsed) && (
            <div className="calcbox__form">
              <label className="calcbox__field">
                <span>Paste statement lines / fees (no personal data needed)</span>
                <textarea
                  className="calcbox__textarea"
                  rows={8}
                  placeholder={'e.g.\nOutward TT fee SGD 30\nFX margin to India 1.8% on SGD 40,000\nOverdraft interest 8.25%'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="calcbox__paste-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setText(SAMPLE_STATEMENT)}>
                  Load sample
                </button>
                <button type="button" className="btn btn--red" onClick={analyze} disabled={parsing || !text.trim()}>
                  {parsing ? 'Analysing…' : 'Analyse & Benchmark →'}
                </button>
              </div>
              {error && <p className="calcbox__error">{error}</p>}
              {!compact && (
                <p className="calcbox__consent">
                  🔒 Processed in-session for this prototype. Mask beneficiary names / references before pasting.
                </p>
              )}
            </div>
            )}

            {(!compact || parsed) && (
            <div className="calcbox__result">
              {!parsed ? (
                <Placeholder paste />
              ) : (
                <div className="res">
                  {compact && (
                    <button type="button" className="res__back" onClick={() => setParsed(null)}>
                      ← Analyse another
                    </button>
                  )}
                  <div className="res__head">
                    <span>{parsed.itemsDetected} fee line(s) detected</span>
                    <span className="res__unit">of {parsed.linesScanned} scanned</span>
                  </div>

                  <div className="res__items">
                    {parsed.items.map((it, i) => (
                      <div className="res__item" key={i}>
                        <div className="res__item-top">
                          <span className="res__item-label">{it.label}</span>
                          {it.annualSaving != null && (
                            <span className="res__item-save">save {formatSGD(it.annualSaving)}</span>
                          )}
                        </div>
                        <div className="res__item-rates">
                          <b>{it.yourValue}</b> <small>{it.unit}</small>
                          <span className="res__item-arrow">→ 🔒</span>
                          <b className="accent-blue">{it.benchmarkValue}</b> <small>{it.unit}</small>
                        </div>
                        {it.note && <div className="res__item-note">{it.note}</div>}
                      </div>
                    ))}
                    {parsed.items.length === 0 && <p className="res__empty">{parsed.note}</p>}
                  </div>

                  {parsed.items.length > 0 && (
                    <>
                      <div className="res__saving">
                        <span>Estimated identifiable savings</span>
                        <strong>{formatSGD(parsed.totalAnnualSaving)} / year</strong>
                        <small>plus rate-based items once you add balances</small>
                      </div>
                      <div className="res__locked">🔒 Winning providers hidden until reveal.</div>
                      <button
                        className="btn btn--primary btn--block res__detail"
                        onClick={() => onDetailedFeedback({ product: 'Statement analysis', segment: form.segment, ...parsed })}
                      >
                        Reveal Providers &amp; Get Detailed Feedback →
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Placeholder({ paste }) {
  return (
    <div className="calcbox__placeholder">
      <div className="calcbox__placeholder-icon">{paste ? '🧾' : '📊'}</div>
      <p>{paste ? 'Paste a statement line and analyse to see itemised savings.' : 'Your live benchmark appears here the moment you compute.'}</p>
      <small>Free instant estimate · Reveal & negotiation are optional next steps.</small>
    </div>
  );
}
