import { useEffect, useMemo, useRef, useState } from 'react';
import './BenchmarkCalculator.css';
import { getReference, calcBenchmark, formatMoney, getBanks, getRevealPrice } from '../api.js';
import { BANK_LOGOS } from './BankLogos.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { saveBenchmark } from '../lib/dashboardApi.js';

// A–Z by name so people can scan the picker for their own bank. `base`
// sensitivity keeps case/accents from splitting otherwise-equal names, and
// `numeric` orders any digits in a name naturally.
const byName = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const sortByName = (list) => [...(list || [])].sort((a, b) => byName.compare(a.name || '', b.name || ''));

const BANK_NAMES = BANK_LOGOS.map((b) => b.name).sort((a, b) => byName.compare(a, b));

// Signing in can reload the whole page (Google OAuth, an email-confirm link), so
// the computed benchmark is stashed and restored — the user comes back to their
// result instead of an empty form they'd have to fill in and compute again.
const RESTORE_KEY = 'bb_calc';
const RESTORE_TTL = 60 * 60 * 1000; // 1h — long enough for an email round-trip
const readSavedCalc = () => {
  try {
    const d = JSON.parse(localStorage.getItem(RESTORE_KEY) || 'null');
    if (!d || typeof d.at !== 'number' || Date.now() - d.at > RESTORE_TTL) {
      localStorage.removeItem(RESTORE_KEY);
      return null;
    }
    return d;
  } catch { return null; }
};

// SMEs and Corporates share the same product set, so they're one tab.
const SEGMENT_TABS = [
  { key: 'individual', label: 'For Individuals' },
  { key: 'sme', label: 'For SMEs & Corporates' },
];
const MAJORS = ['USD', 'EUR', 'GBP'];
const dedupe = (arr) => [...new Set(arr.filter(Boolean))];

// Fields the user must fill before we can compute (they start blank; currency/
// enum fields always carry a default, so they're never required).
const REQUIRED_TYPES = new Set(['bank', 'amount', 'rate', 'tenor', 'duration', 'count', 'percent']);
const isRequiredField = (f) => REQUIRED_TYPES.has(f.type);
const isBlank = (v) => v === '' || v == null;

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

function Field({ field, value, onChange, ccyOptions, bankOptions, required, invalid }) {
  const set = (e) => onChange(field.key, e.target.value);
  // The whole form re-renders on every keystroke — don't re-sort each time.
  const ordered = useMemo(() => sortByName(bankOptions), [bankOptions]);

  let control;
  if (field.type === 'bank') {
    control = (
      <select value={value} onChange={set}>
        <option value="">Select your bank…</option>
        {ordered.length
          ? ordered.map((b) => <option key={b.id || b.name} value={b.name}>{b.name}</option>)
          : BANK_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        <option value="Other">Other / not listed</option>
      </select>
    );
  } else if (field.type === 'currency') {
    control = (
      <select value={value} onChange={set}>
        {ccyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  } else if (field.type === 'enum') {
    control = (
      <select value={value} onChange={set}>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else {
    const numeric = ['amount', 'rate', 'tenor', 'duration', 'count', 'percent'].includes(field.type);
    const step = field.type === 'rate' || field.type === 'percent' ? '0.01' : field.type === 'amount' ? '1000' : '1';
    control = (
      <input
        type={numeric ? 'number' : 'text'}
        {...(numeric ? { min: '0', step } : {})}
        placeholder={field.placeholder || ''}
        value={value}
        onChange={set}
      />
    );
  }

  return (
    <label className={`calcbox__field${invalid ? ' is-invalid' : ''}`} data-field={field.key}>
      <span>
        {field.label}
        {required && <em className="calcbox__req" aria-hidden="true">*</em>}
      </span>
      {control}
    </label>
  );
}

export default function BenchmarkCalculator({ onDetailedFeedback, onReveal, compact = false, selection = null, onRequireAuth, onMarketChange }) {
  const { user } = useAuth();
  const [ref, setRef] = useState(null);
  const [error, setError] = useState(null);
  const savedCalc = useRef(readSavedCalc()).current; // read once, on first render
  const [segment, setSegment] = useState(savedCalc?.segment || 'individual');
  const [country, setCountry] = useState(savedCalc?.country || 'SG');
  const [productId, setProductId] = useState(savedCalc?.productId ?? null);
  const [values, setValues] = useState(savedCalc?.values || {});
  const [result, setResult] = useState(savedCalc?.result || null);
  // Lets the product-selection effect below keep restored values on its first
  // run instead of clobbering them with defaults.
  const keepRestored = useRef(!!savedCalc);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [savedId, setSavedId] = useState(null); // id of this result's saved-benchmark row (once saved)
  const [banks, setBanks] = useState([]); // provider directory for the chosen country
  const [back, setBack] = useState(false); // true after "Recalculate" → animate the form back in
  const [invalid, setInvalid] = useState({}); // { fieldKey: true } for blank required fields
  const formRef = useRef(null);

  useEffect(() => {
    getReference().then(setRef).catch(() => setError('Could not load reference data.'));
  }, []);

  // Keep the partner-logo marquee on the selected market. Driven by `country`
  // rather than the dropdown handler, so a restored session syncs it too.
  useEffect(() => { onMarketChange?.(country); }, [country, onMarketChange]);

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
    if (keepRestored.current) { keepRestored.current = false; return; } // restored run
    setValues(buildDefaults(next, ccyList(next, localCcy, allCcys)));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, segment]);

  // Stash each computed result so it survives a sign-in page reload.
  useEffect(() => {
    if (!result) return;
    try {
      localStorage.setItem(RESTORE_KEY, JSON.stringify({
        at: Date.now(), segment, country, productId, values, result,
      }));
    } catch { /* storage full / blocked — restoring is best-effort */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

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

  const setValue = (key, val) => {
    setValues((v) => ({ ...v, [key]: val }));
    // Clear a field's red highlight as soon as the user starts filling it.
    setInvalid((iv) => (iv[key] ? { ...iv, [key]: false } : iv));
  };

  // The saved-benchmark payload for the current result.
  function currentSaveRow() {
    return {
      segment,
      country_code: country,
      product: product.id,
      product_label: result.product,
      currency: result.currency || localCcy,
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
    };
  }

  async function saveCurrent() {
    if (!result || !product) return;
    // Not signed in: stash the row so an OAuth / email-confirm reload still
    // lands this benchmark in their dashboard instead of losing the result.
    if (!user) { onRequireAuth?.({ kind: 'save', saveRow: currentSaveRow() }); return; }
    setSaveState('saving');
    try {
      const row = await saveBenchmark(currentSaveRow());
      setSavedId(row?.id ?? null);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  // Reveal: hand the reveal flow both the result context AND the save payload so
  // it can persist this benchmark (as 'revealed') to the dashboard — reusing the
  // existing saved row if the user already hit "Save".
  function revealCurrent() {
    if (!result || !product) return undefined;
    return onReveal?.({
      ...result,
      currency: result.currency || localCcy,
      segment,
      benchmarkId: savedId || undefined,
      saveRow: currentSaveRow(),
    });
  }

  // "Ahead of the market" cross-sell: there's no better bank to reveal, so instead
  // of charging for a useless reveal, jump to the next product in this segment —
  // where the user may actually be overpaying and the reveal has real value.
  // Falls back to re-showing the form for the same product.
  function crossSellNext() {
    const list = segmentProducts;
    const idx = list.findIndex((p) => p.id === productId);
    const next = list.length > 1 ? list[(idx + 1) % list.length] : null;
    if (next && next.id !== productId) selectProduct(next.id);
    else setResult(null);
    setBack(true);
  }

  async function compute(e) {
    e.preventDefault();
    if (!product) return;

    // Required-field validation: gather blank required fields top-to-bottom.
    const missing = product.inputs.filter((f) => isRequiredField(f) && isBlank(values[f.key]));
    if (missing.length) {
      const iv = {};
      for (const f of missing) iv[f.key] = true;
      setInvalid(iv);
      setError(`Please fill in the highlighted field${missing.length > 1 ? 's' : ''} to continue.`);
      // Focus + scroll to the first (topmost) blank field.
      const first = missing[0].key;
      const el = formRef.current?.querySelector(`[data-field="${first}"] input, [data-field="${first}"] select`);
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return;
    }

    setInvalid({});
    setLoading(true);
    setError(null);
    setSaveState('idle');
    setSavedId(null);
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
        <div className={compact ? 'calc-screen' : 'calc-screen--plain'}>
        {compact ? (
          /* Persistent header band — the phone's "navbar". It stays on every
             screen so the chrome never disappears; only its contents change. */
          <div className={`calc-card__head${result ? ' calc-card__head--nav' : ''}`}>
            {result ? (
              <div className="calc-card__nav">
                <button type="button" className="calc-card__back" onClick={() => { setResult(null); setBack(true); }}>
                  ← Recalculate
                </button>
                <span className="calc-card__unit">{result.unit}</span>
              </div>
            ) : (
              <>
                <h2 className="calc-card__title">Calculate Your Free Comparison</h2>
                <p className="calc-card__sub">Live rates · no sign-up · no personal data stored</p>
              </>
            )}
          </div>
        ) : (
          <>
            <span className="eyebrow calc-sec__eyebrow">Free Benchmark · No sign-up · No personal data stored</span>
            <h2 className="section-title">Start Your Free Comparison Now</h2>
            <p className="section-sub">
              Pick a market and product, enter your details — it benchmarks against live data instantly.
              The winning provider stays hidden until you request a reveal.
            </p>
          </>
        )}

        <div className={`calcbox ${compact ? 'calcbox--compact' : ''}`}>
          {(!compact || !result) && (
            <form ref={formRef} className={`calcbox__form${back ? ' is-back' : ''}`} onSubmit={compute} noValidate>
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
                  <span>Country</span>
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
                <Field
                  key={f.key} field={f} value={values[f.key] ?? ''} onChange={setValue}
                  ccyOptions={ccyOptions} bankOptions={banks}
                  required={isRequiredField(f)} invalid={!!invalid[f.key]}
                />
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
                <Result result={result} product={product} compact={compact} localCcy={localCcy}
                  onReveal={revealCurrent}
                  onCrossSell={crossSellNext} canCrossSell={segmentProducts.length > 1}
                  onDetailedFeedback={() => onDetailedFeedback({ ...result, currency: result.currency || localCcy, segment })}
                  isAuthed={!!user} saveState={saveState} onSave={saveCurrent} />
              )}
            </div>
          )}
        </div>
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

function Result({ result, product, compact, localCcy, onReveal, onCrossSell, canCrossSell, onDetailedFeedback, isAuthed, saveState, onSave }) {
  const [revealErr, setRevealErr] = useState('');
  const [revealBusy, setRevealBusy] = useState(false);
  // Not signed in? onReveal opens the sign-in modal and stashes this result, so
  // the user lands straight back on payment afterwards — nothing to re-enter.
  async function handleReveal() {
    setRevealErr('');
    setRevealBusy(true);
    try {
      await onReveal(); // sign-in prompt, or straight to Stripe when signed in
    } catch {
      setRevealErr('We couldn’t start the secure checkout. Please check your connection and try again.');
    } finally {
      setRevealBusy(false);
    }
  }
  const ccy = result.currency || localCcy || 'SGD';
  // Localized reveal price (~S$1 in the market currency) for the CTA label.
  const [revealPrice, setRevealPrice] = useState(null);
  useEffect(() => {
    let live = true;
    getRevealPrice(ccy).then((p) => { if (live && p) setRevealPrice(p); });
    return () => { live = false; };
  }, [ccy]);
  const revealLabel = revealPrice
    ? formatMoney(revealPrice.major, (revealPrice.currency || ccy).toUpperCase())
    : formatMoney(1, ccy); // rate products (e.g. housing loan) carry no currency
  const higher = result.direction === 'higher';
  const crossBorder = product?.family === 'crossborder';
  const ahead = result.status === 'ahead';

  // Visual comparison of your rate vs the best — bar widths relative to the
  // larger of the two.
  const yr = Number(result.yourRate);
  const br = Number(result.benchmarkRate);
  const maxRate = Math.max(yr, br) || 1;
  const youW = Number.isFinite(yr) ? Math.max(8, Math.round((yr / maxRate) * 100)) : 0;
  const bestW = Number.isFinite(br) ? Math.max(8, Math.round((br / maxRate) * 100)) : 0;
  const saveLabel = saveState === 'saved' ? 'Saved to dashboard ✓'
    : saveState === 'saving' ? 'Saving…'
    : saveState === 'error' ? 'Couldn’t save — retry'
    : isAuthed ? '＋ Save to my dashboard' : 'Sign in to save this';

  return (
    <div className="res">
      {/* Compact mode shows these in the header navbar instead. */}
      {!compact && (
        <div className="res__top">
          <span className="res__product">{result.product}{result.currency ? ` · ${result.currency}` : ''}</span>
          <span className="res__unit">{result.unit}</span>
        </div>
      )}

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
            little to nothing to save here. But banks often claw it back elsewhere — check your other products below.
          </p>
        </div>
      ) : (
        <>
          <div className="res__overpay">
            <span className="res__overpay-lead">
              {higher ? <>You&apos;re <strong>missing out</strong> on</> : <>You&apos;re <strong>overpaying</strong> your bank by</>}
            </span>
            <strong className="res__overpay-amt">{formatMoney(result.annualSaving, ccy)} per year</strong>
          </div>

          <div className="res__cmp">
            <div className="res__cmp-row">
              <span className="res__cmp-label">{crossBorder ? 'Your all-in cost' : 'Your bank’s rate'}</span>
              <span className="res__cmp-track"><span className="res__cmp-fill res__cmp-fill--you" style={{ width: `${youW}%` }} /></span>
              <span className="res__cmp-val res__cmp-val--you">{result.yourRate}%</span>
            </div>
            <div className="res__cmp-row">
              <span className="res__cmp-label">Best available</span>
              <span className="res__cmp-track"><span className="res__cmp-fill res__cmp-fill--best" style={{ width: `${bestW}%` }} /></span>
              <span className="res__cmp-val res__cmp-val--best">{result.benchmarkRate}%</span>
            </div>
          </div>

          <p className="res__tagline">Save the money your bank is making off you.</p>

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

      {ahead ? (
        /* No better bank to reveal — don't charge for it. Pivot to another product,
           where they may actually be overpaying (and the reveal earns its fee). */
        <button className="btn btn--block res__detail" onClick={onCrossSell}>
          {canCrossSell ? 'Check My Other Products — Free →' : 'Run Another Free Benchmark →'}
        </button>
      ) : (
        <>
          <button className="btn btn--block res__detail" onClick={handleReveal} disabled={revealBusy}>
            {revealBusy ? 'Opening secure checkout…' : 'Reveal the Best Bank →'}
          </button>
          {revealErr && <p className="res__lead-err">{revealErr}</p>}
          <p className="res__reveal-note">🔒 {revealLabel} charged securely. 100% cashback if not satisfied.</p>
        </>
      )}

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
            ? "You're best-in-class here — most banks claw it back on FX, remittances or loans. Checking your other products is free; save this win to track it."
            : 'Reveal your best-match bank + a shareable certificate, then negotiate — yourself (free), with a coach, or an expert.'}
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
