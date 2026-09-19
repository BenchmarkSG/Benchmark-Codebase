import { useEffect, useMemo, useRef, useState } from 'react';
import './BenchmarkCalculator.css';
import { getReference, calcBenchmark, formatMoney, getBanks, getRevealPrice } from '../api.js';
import { BANK_LOGOS } from './BankLogos.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { saveBenchmark } from '../lib/dashboardApi.js';
import { unlockedTierFor } from '../lib/unlocks.js';
import StepBar from './StepBar.jsx';

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

/* Which fields can share a line.
   A number or a short picker holds its own at half width; a bank name or a free
   text answer does not — "Your Bank/Finance Company" and its 40-character
   options need the full width or every option truncates. */
const PAIRABLE = new Set(['amount', 'tenor', 'rate', 'percent', 'count', 'duration', 'currency', 'enum']);

/* Group a product's inputs into rows of at most two.
   Pairs form only between ADJACENT pairable fields, so the order the catalog
   declares is never rearranged — amount sits next to tenor because that is the
   order they are asked in, not because they were sorted together. A wide field
   breaks the run, and a leftover one keeps the full width rather than sitting in
   a half-empty row. */
function fieldRows(fields) {
  const rows = [];
  let pending = null;
  for (const f of fields || []) {
    if (!PAIRABLE.has(f.type)) {
      if (pending) { rows.push([pending]); pending = null; }
      rows.push([f]);
    } else if (pending) {
      rows.push([pending, f]);
      pending = null;
    } else {
      pending = f;
    }
  }
  if (pending) rows.push([pending]);
  return rows;
}

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

export default function BenchmarkCalculator({ onDetailedFeedback, onReveal, compact = false, selection = null, onRequireAuth, market = null, onMarketChange }) {
  const { user } = useAuth();
  const [ref, setRef] = useState(null);
  const [error, setError] = useState(null);
  const savedCalc = useRef(readSavedCalc()).current; // read once, on first render
  const [segment, setSegment] = useState(savedCalc?.segment || 'individual');
  const [country, setCountry] = useState(savedCalc?.country || 'SG');
  const [productId, setProductId] = useState(savedCalc?.productId ?? null);
  const [values, setValues] = useState(savedCalc?.values || {});
  const [result, setResult] = useState(savedCalc?.result || null);
  // The provider named when this result was computed. Kept apart from `values`
  // because the desktop layout shows the form alongside the result — changing
  // the dropdown afterwards must not relabel numbers it didn't produce.
  const [resultBank, setResultBank] = useState(savedCalc?.values?.bank || '');
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
  // Products are filtered by market as well as segment. `onlyCountries` is an
  // allowlist set server-side for products that don't apply everywhere — e.g.
  // current-account credit interest, which Indian banks are barred from paying.
  const inMarket = (p) => !p.onlyCountries || p.onlyCountries.includes(country);
  const segmentProducts = useMemo(
    () => products.filter((p) => p.segments?.includes(segment) && inMarket(p)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, segment, country],
  );
  const product = useMemo(() => products.find((p) => p.id === productId) || null, [products, productId]);
  const ccyOptions = useMemo(() => (product ? ccyList(product, localCcy, allCcys) : [localCcy]), [product, localCcy, allCcys]);

  // Once reference loads (or segment changes), select a valid product + defaults.
  useEffect(() => {
    if (!products.length) return;
    const list = products.filter((p) => p.segments?.includes(segment) && inMarket(p));
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
    // Some products only exist in certain markets (`onlyCountries`). If this one
    // isn't offered where the user just moved, switch to one that is — leaving it
    // selected would send a request the API is right to refuse. Handled here
    // rather than in the product effect so that switching market otherwise keeps
    // the numbers already typed in.
    if (product.onlyCountries && !product.onlyCountries.includes(code)) {
      const next = products.find((p) => p.segments?.includes(segment)
        && (!p.onlyCountries || p.onlyCountries.includes(code)));
      if (next) {
        setProductId(next.id);
        setValues(buildDefaults(next, ccyList(next, nextLocal, allCcys)));
        setResult(null);
      }
      return;
    }
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

  // The header's country picker drives the same market this form does. Routed
  // through changeCountry so switching to a market that doesn't offer the
  // current product still lands on a valid one, exactly as the form's own
  // dropdown would. No loop: the effect below reports `country` back up, and
  // when the two already agree neither setState changes anything.
  useEffect(() => {
    if (!market || market === country) return;
    if (!countries.some((c) => c.code === market)) return; // catalog not loaded yet
    changeCountry(market);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, countries]);

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
      // Always null at save time now: the free benchmark withholds the name, and
      // it is written back only once the reveal has actually been paid for.
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
  function revealContext() {
    if (!result || !product) return null;
    return {
      ...result,
      currency: result.currency || localCcy,
      segment,
      // The machine-readable product id. `result.product` is the display label;
      // leads and the admin booking list want the id that matches the catalog.
      productId: product.id,
      benchmarkId: savedId || undefined,
      // The raw form values. The reveal recomputes the benchmark server-side, so
      // it has to be asked the same question: a cross-border pool is priced per
      // corridor and per amount sent, and without these it would rebuild a
      // different comparison and name a different winner. Same shape the saved
      // row stores (currentSaveRow), so a reopen from the dashboard has them too.
      inputs: values,
    };
  }

  function revealCurrent() {
    const ctx = revealContext();
    if (!ctx) return undefined;
    return onReveal?.({ ...ctx, saveRow: currentSaveRow() });
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
      const data = await calcBenchmark(payload);
      setResultBank(values.bank || '');
      setResult(data);
    } catch (err) {
      setError(err.message || 'Something went wrong calculating your benchmark.');
    } finally {
      setLoading(false);
    }
  }

  // Which of the four funnel steps this card is showing (see StepBar.jsx).
  // Exactly one is ever current. The comparison and the saving are one screen,
  // so they are one step: it becomes current the moment Compute is pressed. The
  // unlock is read from the same place the result card reads it, so paying for
  // the reveal advances the bar with no round-trip.
  const step = !result && !loading ? 'input'
    : result && unlockedTierFor(revealContext()) ? 'unlock'
    : 'compare';

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
                <span className="calc-card__meta">
                  <b>{result.product}</b>
                  <span>{result.unit}</span>
                </span>
              </div>
            ) : (
              <>
                <h2 className="calc-card__title">Free Benchmarking Calculator</h2>
              </>
            )}
            {/* Inside the band, not under it: the progress is chrome, and the
                band is the card's chrome. It shows on the result screen too,
                where the band swaps its contents for the back button — and its
                skin for the plain one, since the blue stops at screen one. */}
            <StepBar current={step} className={result ? 'steps--oncard' : 'steps--onblue'} />
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

              {fieldRows(product?.inputs).map((row) => {
                const cells = row.map((f) => (
                  <Field
                    key={f.key} field={f} value={values[f.key] ?? ''} onChange={setValue}
                    ccyOptions={ccyOptions} bankOptions={banks}
                    required={isRequiredField(f)} invalid={!!invalid[f.key]}
                  />
                ));
                // The same two-column grid Country/Product already uses, so the
                // pairs collapse on a phone exactly as those do.
                return row.length === 2
                  ? <div className="calcbox__row" key={row[0].key + '+' + row[1].key}>{cells}</div>
                  : cells[0];
              })}

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
                  yourBank={resultBank}
                  onReveal={revealCurrent}
                  unlockedTier={unlockedTierFor(revealContext())}
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

function Result({ result, product, compact, localCcy, yourBank = '', onReveal, onCrossSell, canCrossSell, onDetailedFeedback, isAuthed, saveState, onSave, unlockedTier = null }) {
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
  // Most products compare a percentage; fee-based ones compare a sum of money.
  // The server says which, so the client never has to infer it from the product.
  const moneyMetric = result.metricMode === 'amount';
  const fmtMetric = (v) => (moneyMetric ? formatMoney(Number(v), ccy) : `${v}%`);
  // Name the user's own provider back to them when they picked one. The field
  // is optional and carries an "Other / not listed" entry, neither of which
  // names a bank — those keep the generic wording.
  const namedBank = yourBank && yourBank !== 'Other' ? yourBank : '';
  const yourLabel = crossBorder ? 'Your all-in cost is'
    : moneyMetric ? 'What you pay now is'
    : namedBank ? `Your Bank (${namedBank}) Rate is`
    : 'Your bank’s rate is';
  // How the best rate was published. A lender that prints "8.00%–9.50%" is
  // represented by the midpoint and marked "~"; one that prints "from 7.50%"
  // keeps the floor and is labelled "from". A plain figure was published as
  // such. When any rate in the pool is a midpoint or a floor, the typical
  // figure is approximate too, so it wears the "~" as well.
  const bestBasis = result.benchmarkBasis || 'exact';
  // "from" is no longer printed on the figure (product decision). A floor rate
  // now renders as a plain number, exactly like an exact one; the "~" on a range
  // midpoint stays, since that marks a different thing.
  const fmtBest = (v) => (bestBasis === 'range' ? `~${fmtMetric(v)}` : fmtMetric(v));
  const fmtPool = (v) => (result.approxPool ? `~${v}` : v);
  const ahead = result.status === 'ahead';
  const saveLabel = saveState === 'saved' ? 'Saved to dashboard ✓'
    : saveState === 'saving' ? 'Saving…'
    : saveState === 'error' ? 'Couldn’t save — retry'
    : isAuthed ? '＋ Save to my dashboard' : 'Sign-in to save this';

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
            <strong>{fmtMetric(result.yourRate)}</strong> is {standingText(result)}.
          </p>
          <div className="res__ahead-cmp">
            <div className="res__ahead-you">
              <span>You</span>
              <strong>{fmtMetric(result.yourRate)}</strong>
              <em>✓ best-in-class</em>
            </div>
            <div className="res__ahead-mkt">
              <span>Market's best</span>
              <strong>{fmtBest(result.benchmarkRate)}</strong>
            </div>
          </div>
          <p className="res__ahead-note">
            {higher
              ? 'On this product a higher rate is better — you earn it rather than pay it. '
                + "You're already earning more than the market — "
              : "You're already paying less than the market — "}
            little to nothing to save here. But banks often claw it back elsewhere — check your other products below.
          </p>
        </div>
      ) : (
        <>
          <div className="res__overpay">
            <span className="res__overpay-lead">
              {higher ? <>Hey, you&apos;re <strong>missing out</strong> on</> : <>Hey, you&apos;re <strong>losing</strong></>}
            </span>
            <strong className="res__overpay-amt">{formatMoney(result.annualSaving, ccy)} per year!</strong>
            <span className="res__overpay-sub">Here&apos;s the rate comparison</span>
          </div>

          <div className="res__cmp">
            <div className="res__cmp-row">
              <span className="res__cmp-label">{yourLabel}</span>
              <span className="res__cmp-val">{fmtMetric(result.yourRate)}</span>
            </div>
            <div className="res__cmp-row">
              <span className="res__cmp-label">Best Available Rate is</span>
              <span className="res__cmp-val">{fmtBest(result.benchmarkRate)}</span>
            </div>
          </div>

          <p className="res__tagline">Save this money your Bank is making off you.</p>

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
        <div className="res__locked">🔒 {result.benchmarkLabel}. Market-typical is {fmtPool(result.marketTypical)} {result.unit}.</div>
      )}
      {/* Say what a "~" or a "from" means the moment one is on screen — the
          number is honest only if the reader knows what kind of number it is. */}
      {/* A flat rate is not an effective rate — on the same loan it reads about
          half as large. Say so before the reader compares it with their own. */}
      {result.flatPool && (
        <p className="res__basis res__basis--warn">
          These are <strong>flat rates</strong>: interest on the original amount for the whole
          tenor, which is how car loans are advertised here. On the same loan a flat rate looks
          about half the size of an effective rate — compare it with your own flat rate, not your EIR.
        </p>
      )}
      {/* Only when there is something left to say. 'from' used to satisfy
          `bestBasis !== 'exact'` and bring its own sentence; with that sentence
          gone, the old test would render an empty paragraph and its margin. */}
      {(bestBasis === 'range' || result.benchmarkIndex || result.floatingPool) && (
        <p className="res__basis">
          {bestBasis === 'range' && (
            <>~ marks the midpoint of the range this lender publishes
              {result.benchmarkLow != null && result.benchmarkHigh != null && <> ({result.benchmarkLow}%–{result.benchmarkHigh}%)</>}
              ; the rate you are offered depends on your profile. </>
          )}
          {/* A floating rate is a formula, not a promise. Show the two parts, so
              the reader can see which half their bank can actually move. */}
          {result.benchmarkIndex && (
            <>This is a floating rate: <strong>{result.benchmarkIndex} + {result.benchmarkSpread}%</strong>
              {result.benchmarkIndexValue != null && <>, and {result.benchmarkIndex} is {result.benchmarkIndexValue}% today</>}
              . It moves when the index does — the spread is the part you negotiate. </>
          )}
          {!result.benchmarkIndex && result.floatingPool && <>Some rates in this pool track an index, so they move over time. </>}
        </p>
      )}
      {/* A pool is only a benchmark if the rates in it came from somewhere. The
          server serves sourced rows by default (RATES_REAL_ONLY), so this only
          appears if that's been switched off — but when it does, it must never
          be possible to mistake a generated figure for a market rate. */}
      {result.dataQuality && result.dataQuality !== 'real' && (
        <div className="res__unsourced" role="note">
          ⚠️ {result.dataQuality === 'mixed'
            ? 'Some rates in this comparison are indicative, not sourced from published rates.'
            : 'These rates are indicative — not sourced from published rates.'}{' '}
          Treat as illustrative only.
        </div>
      )}
      {!compact && result.tip && <p className="res__tip">💡 {result.tip}</p>}

      {ahead ? (
        /* No better bank to reveal — don't charge for it. Pivot to another product,
           where they may actually be overpaying (and the reveal earns its fee). */
        <button className="btn btn--block res__detail" onClick={onCrossSell}>
          {canCrossSell ? 'Check My Other Products — Free →' : 'Run Another Free Benchmark →'}
        </button>
      ) : (
        <>
          {/* Reads as the lead-in to the button, so it sits directly above it
              rather than after the tagline (the notes between the two are all
              conditional and would separate them). */}
          {!unlockedTier && (
            <p className="res__findout">Find out which Bank is giving the Best Available Rate</p>
          )}
          {/* Already paid for this benchmark? Then this button reopens it — it
              never offers to sell the same reveal a second time. */}
          <button className="btn btn--block res__detail" onClick={handleReveal} disabled={revealBusy}>
            {revealBusy
              ? (unlockedTier ? 'Opening…' : 'Opening secure checkout…')
              : (unlockedTier ? 'View Your Best Bank →' : 'Unlock the Best Rate Bank →')}
          </button>
          {revealErr && <p className="res__lead-err">{revealErr}</p>}
          <p className="res__reveal-note">
            {unlockedTier
              ? '✓ Already unlocked — reopening it is free.'
              : `Click to pay ${revealLabel}. 100% cashback if not satisfied.`}
          </p>
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
