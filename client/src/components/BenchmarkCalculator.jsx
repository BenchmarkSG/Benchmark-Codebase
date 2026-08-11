import { useEffect, useMemo, useState } from 'react';
import './BenchmarkCalculator.css';
import { getReference, calcBenchmark, formatMoney, getBanks } from '../api.js';
import { BANK_LOGOS } from './BankLogos.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { saveBenchmark } from '../lib/dashboardApi.js';

const BANK_NAMES = BANK_LOGOS.map((b) => b.name);

// Order the provider directory by category for the picker (headers omitted).
const BANK_CAT_ORDER = ['public', 'private', 'local', 'digital', 'fintech', 'foreign', 'european', 'japanese', 'indian'];
function groupBanks(list) {
  const map = new Map();
  for (const b of list || []) { const k = b.category || 'other'; if (!map.has(k)) map.set(k, []); map.get(k).push(b); }
  return [...map.entries()].sort((a, b) => BANK_CAT_ORDER.indexOf(a[0]) - BANK_CAT_ORDER.indexOf(b[0]));
}

// SMEs and Corporates share the same product set, so they're one tab.
const SEGMENT_TABS = [
  { key: 'individual', label: 'For Individuals' },
  { key: 'sme', label: 'For SMEs / Corporates' },
];
const MAJORS = ['USD', 'EUR', 'GBP'];
const dedupe = (arr) => [...new Set(arr.filter(Boolean))];

// Currency choices for a product, given the country's local currency + the full
// market currency set (used for the broad cross-border pickers).
function ccyList(product, localCcy, allCcys) {
  switch (product?.currencyMode) {
    case 'usd': return ['USD'];
    case 'localusd': return dedupe([localCcy, 'USD']);
    case 'multi': return dedupe([localCcy, ...MAJORS, ...allCcys]);
    default: return [localCcy];
  }
}

// Sensible starting value for a field.
function defaultValue(field, ccyOptions) {
  if (field.type === 'currency') return field.key === 'receive_currency' ? 'USD' : ccyOptions[0];
  if (field.type === 'enum') return field.options?.[0]?.value ?? '';
  return '';
}

function buildDefaults(product, ccyOptions) {
  const v = {};
  for (const f of product.inputs) v[f.key] = defaultValue(f, ccyOptions);
  return v;
}

function Field({ field, value, onChange, ccyOptions, bankOptions }) {
  const set = (e) => onChange(field.key, e.target.value);

  if (field.type === 'bank') {
    // Keep the category ordering, but render a flat list (no group headers).
    const ordered = groupBanks(bankOptions).flatMap(([, list]) => list);
    return (
      <label className="calcbox__field">
        <span>{field.label}</span>
        <select value={value} onChange={set}>
          <option value="">Select your bank…</option>
          {ordered.length
            ? ordered.map((b) => <option key={b.id || b.name} value={b.name}>{b.name}</option>)
            : BANK_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="Other">Other / not listed</option>
        </select>
      </label>
    );
  }
  if (field.type === 'currency') {
    return (
      <label className="calcbox__field">
        <span>{field.label}</span>
        <select value={value} onChange={set}>
          {ccyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'enum') {
    return (
      <label className="calcbox__field">
        <span>{field.label}</span>
        <select value={value} onChange={set}>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  const numeric = ['amount', 'rate', 'tenor', 'duration', 'count', 'percent'].includes(field.type);
  const step = field.type === 'rate' || field.type === 'percent' ? '0.01' : field.type === 'amount' ? '1000' : '1';
  return (
    <label className="calcbox__field">
      <span>{field.label}{field.unit && field.type === 'rate' ? '' : ''}</span>
      <input
        type={numeric ? 'number' : 'text'}
        {...(numeric ? { min: '0', step } : {})}
        placeholder={field.placeholder || ''}
        value={value}
        onChange={set}
      />
    </label>
  );
}

export default function BenchmarkCalculator({ onDetailedFeedback, compact = false, selection = null, onRequireAuth }) {
  const { user } = useAuth();
  const [ref, setRef] = useState(null);
  const [error, setError] = useState(null);
  const [segment, setSegment] = useState('individual');
  const [country, setCountry] = useState('SG');
  const [productId, setProductId] = useState(null);
  const [values, setValues] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [banks, setBanks] = useState([]); // provider directory for the chosen country

  useEffect(() => {
    getReference().then(setRef).catch(() => setError('Could not load reference data.'));
  }, []);

  // Load the provider directory for the selected market (falls back to the SG
  // logo list if the banks table isn't seeded).
  useEffect(() => {
    getBanks(country).then((list) => setBanks(Array.isArray(list) ? list : [])).catch(() => setBanks([]));
  }, [country]);

  const countries = ref?.countries ?? [];
  const products = ref?.products ?? [];
  const allCcys = useMemo(() => countries.map((c) => c.currency), [countries]);
  const localCcy = useMemo(() => countries.find((c) => c.code === country)?.currency || 'SGD', [countries, country]);
  const segmentProducts = useMemo(() => products.filter((p) => p.segments?.includes(segment)), [products, segment]);
  const product = useMemo(() => products.find((p) => p.id === productId) || null, [products, productId]);
  const ccyOptions = useMemo(() => (product ? ccyList(product, localCcy, allCcys) : [localCcy]), [product, localCcy, allCcys]);

  // Once reference loads (or segment changes), select a valid product + defaults.
  useEffect(() => {
    if (!products.length) return;
    const list = products.filter((p) => p.segments?.includes(segment));
    const next = list.some((p) => p.id === productId) ? products.find((p) => p.id === productId) : list[0];
    if (!next) return;
    if (next.id !== productId) setProductId(next.id);
    setValues(buildDefaults(next, ccyList(next, localCcy, allCcys)));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, segment]);

  // Apply a request from elsewhere (the "Compare Now" cards / segment CTAs).
  // A selection may name a specific product, just a segment, or both. Runs when
  // a new selection arrives or once the catalog has loaded.
  useEffect(() => {
    if (!selection || !products.length) return;
    const p = selection.productId ? products.find((x) => x.id === selection.productId) : null;
    if (selection.productId && !p) return; // named a product we don't have yet
    if (selection.segment && selection.segment !== segment) setSegment(selection.segment);
    if (p) {
      setProductId(p.id);
      setValues(buildDefaults(p, ccyList(p, localCcy, allCcys)));
    }
    // Segment-only: the [products, segment] effect selects that segment's first product.
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, products]);

  function selectProduct(id) {
    const p = products.find((x) => x.id === id);
    setProductId(id);
    setValues(buildDefaults(p, ccyList(p, localCcy, allCcys)));
    setResult(null);
  }

  function changeCountry(code) {
    setCountry(code);
    if (!product) return;
    const nextLocal = countries.find((c) => c.code === code)?.currency || 'SGD';
    const opts = ccyList(product, nextLocal, allCcys);
    // Keep currency fields valid for the new market.
    setValues((v) => {
      const patch = { ...v };
      for (const f of product.inputs) {
        if (f.type === 'currency' && !opts.includes(patch[f.key])) patch[f.key] = defaultValue(f, opts);
      }
      return patch;
    });
  }

  const setValue = (key, val) => setValues((v) => ({ ...v, [key]: val }));

  async function saveCurrent() {
    if (!result || !product) return;
    if (!user) { onRequireAuth?.(); return; }
    setSaveState('saving');
    try {
      await saveBenchmark({
        segment,
        country_code: country,
        product: product.id,
        product_label: result.product,
        currency: result.currency,
        unit: result.unit,
        direction: result.direction,
        result_status: result.status,
        your_rate: result.yourRate,
        benchmark_rate: result.benchmarkRate,
        market_typical: result.marketTypical,
        annual_saving: result.annualSaving,
        monthly_saving: result.monthlySaving,
        best_bank: result.bestBank ?? null,
        inputs: values,
      });
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  async function compute(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaveState('idle');
    try {
      // Drop empty fields; the server fills sensible fallbacks.
      const payload = { country, product: product.id };
      for (const [k, val] of Object.entries(values)) if (val !== '' && val != null) payload[k] = val;
      if (product.family === 'rate') {
        const m = values[product.metricKey];
        payload.yourRate = m === '' || m == null ? undefined : Number(m);
      }
      setResult(await calcBenchmark(payload));
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
              Pick a market and product, enter your details — it benchmarks against live data instantly.
              The winning provider stays hidden until you request a reveal.
            </p>
          </>
        )}

        <div className={`calcbox ${compact ? 'calcbox--compact' : ''}`}>
          {(!compact || !result) && (
            <form className="calcbox__form" onSubmit={compute}>
              <div className="calcbox__seg">
                {SEGMENT_TABS.map(({ key, label }) => (
                  <button
                    type="button" key={key}
                    className={`calcbox__seg-btn ${segment === key ? 'is-active' : ''}`}
                    onClick={() => setSegment(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="calcbox__row">
                <label className="calcbox__field">
                  <span>Market</span>
                  <select value={country} onChange={(e) => changeCountry(e.target.value)}>
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </label>
                <label className="calcbox__field">
                  <span>Product</span>
                  <select value={productId || ''} onChange={(e) => selectProduct(e.target.value)}>
                    {segmentProducts.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>
              </div>

              {product?.inputs.map((f) => (
                <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={setValue} ccyOptions={ccyOptions} bankOptions={banks} />
              ))}

              <button className="btn btn--red btn--block" type="submit" disabled={loading || !product}>
                {loading ? 'Calculating…' : 'Compute My Free Benchmark →'}
              </button>
              {error && <p className="calcbox__error">{error}</p>}
              {!compact && (
                <p className="calcbox__consent">
                  🔒 We never store personal or account-identifying data. Only anonymised metrics improve the benchmark.{' '}
                  <a href="#privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                </p>
              )}
            </form>
          )}

          {(!compact || result) && (
            <div className="calcbox__result">
              {!result ? <Placeholder /> : (
                <Result result={result} product={product} compact={compact}
                  onDetailedFeedback={() => onDetailedFeedback({ ...result, segment })}
                  onBack={() => setResult(null)}
                  isAuthed={!!user} saveState={saveState} onSave={saveCurrent} />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// "better than X% of the N providers" — the credible standing phrase.
function standingText(result) {
  if (result.beatsAll) return `better than all ${result.poolSize} providers we benchmark`;
  return `better than ${result.percentileBeaten}% of the ${result.poolSize} providers we benchmark`;
}

function Result({ result, product, compact, onDetailedFeedback, onBack, isAuthed, saveState, onSave }) {
  const higher = result.direction === 'higher';
  const crossBorder = product?.family === 'crossborder';
  const ahead = result.status === 'ahead';
  const saveLabel = saveState === 'saved' ? 'Saved to dashboard ✓'
    : saveState === 'saving' ? 'Saving…'
    : saveState === 'error' ? 'Couldn’t save — retry'
    : isAuthed ? '＋ Save to my dashboard' : 'Sign in to save this';

  return (
    <div className="res">
      {compact && <button type="button" className="res__back" onClick={onBack}>← Recalculate</button>}
      <div className="res__head">
        <span>{result.product}{result.currency ? ` · ${result.currency}` : ''}</span>
        <span className="res__unit">{result.unit}</span>
      </div>

      {ahead ? (
        <div className="res__ahead">
          <div className="res__ahead-badge">🎉 You're ahead of the market</div>
          <p className="res__ahead-lead">
            Your {crossBorder ? 'all-in cost' : 'rate'} of{' '}
            <strong>{result.yourRate}{crossBorder ? '%' : ''}</strong> is {standingText(result)}.
          </p>
          <div className="res__ahead-cmp">
            <div className="res__ahead-you">
              <span>You</span>
              <strong>{result.yourRate}</strong>
              <em>✓ best-in-class</em>
            </div>
            <div className="res__ahead-mkt">
              <span>Market's best</span>
              <strong>{result.benchmarkRate}</strong>
            </div>
          </div>
          <p className="res__ahead-note">
            {higher
              ? "You're already earning more than the market — "
              : "You're already paying less than the market — "}
            there's little to nothing to save by switching. Nicely done.
          </p>
        </div>
      ) : (
        <>
          <div className="res__rates">
            <div className="res__rate">
              <div className="res__rate-label">{crossBorder ? 'Your cost' : 'You'}</div>
              <div className="res__rate-val">{result.yourRate}</div>
            </div>
            <div className="res__arrow">→</div>
            <div className="res__rate res__rate--best">
              <div className="res__rate-label">🔒 Best benchmark</div>
              <div className="res__rate-val">{result.benchmarkRate}</div>
            </div>
          </div>

          <div className="res__saving">
            <span>{higher ? 'You could earn extra' : 'You could save'}</span>
            <strong>{formatMoney(result.annualSaving, result.currency)} / year</strong>
            <small>≈ {formatMoney(result.monthlySaving, result.currency)} per month</small>
          </div>

          {result.status === 'saving' && result.percentileBeaten > 0 && (
            <p className="res__standing">
              👍 You're already {standingText(result)} — but the best provider could still {higher ? 'earn' : 'save'} you more.
            </p>
          )}
          {result.status === 'estimate' && (
            <p className="res__standing res__standing--muted">
              Estimated from typical market rates — enter your own {crossBorder ? 'transfer details' : 'rate'} for an exact figure.
            </p>
          )}
        </>
      )}

      {crossBorder && result.settlementHours != null && (
        <div className="res__locked">⏱ Your transfer settles in ~{result.settlementHours}h.</div>
      )}
      {!compact && !ahead && (
        <div className="res__locked">🔒 {result.benchmarkLabel}. Market-typical is {result.marketTypical} {result.unit}.</div>
      )}
      {!compact && result.tip && <p className="res__tip">💡 {result.tip}</p>}
      {result.marketReference && (
        <div className="res__marketref">
          📊 {result.marketReference.source} market reference: <strong>{result.marketReference.value}{result.marketReference.unit || ''}</strong>
          {result.marketReference.asOf ? ` · as of ${result.marketReference.asOf}` : ''}
        </div>
      )}

      <button className="btn btn--primary btn--block res__detail" onClick={onDetailedFeedback}>
        {ahead ? 'Get a Free Expert Review →' : 'Reveal the Bank & Get Detailed Feedback →'}
      </button>

      <button
        className="btn btn--ghost btn--block res__save"
        onClick={onSave}
        disabled={saveState === 'saving' || saveState === 'saved'}
      >
        {saveLabel}
      </button>

      {!compact && (
        <small className="res__detail-note">
          {ahead
            ? "Confirm you're optimally placed — and check your other products for savings."
            : 'Free to see savings · Pay only a % of what we actually save you.'}
        </small>
      )}
    </div>
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
