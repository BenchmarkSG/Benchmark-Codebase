import './PhoneMock.css';

/* Lightweight CSS/SVG "app on a phone" mockups showing live statistics.
   Four variants map to the four How-It-Works steps. */

function Frame({ children, tint = 'navy' }) {
  return (
    <div className={`phone phone--${tint}`}>
      <div className="phone__notch" />
      <div className="phone__screen">{children}</div>
    </div>
  );
}

function Bars({ data }) {
  const max = Math.max(...data.map((d) => d.v));
  return (
    <div className="pm-bars">
      {data.map((d) => (
        <div className="pm-bars__col" key={d.label}>
          <div className="pm-bars__track">
            <div
              className={`pm-bars__fill ${d.best ? 'is-best' : ''}`}
              style={{ height: `${(d.v / max) * 100}%` }}
            />
          </div>
          <span className="pm-bars__label">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ pct, label, sub }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <div className="pm-donut">
      <svg viewBox="0 0 90 90" width="118" height="118">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#e6edf8" strokeWidth="11" />
        <circle
          cx="45" cy="45" r={r} fill="none"
          stroke="url(#pmg)" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform="rotate(-90 45 45)"
        />
        <defs>
          <linearGradient id="pmg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2f7bd8" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <text x="45" y="43" textAnchor="middle" className="pm-donut__pct">{pct}%</text>
        <text x="45" y="56" textAnchor="middle" className="pm-donut__pctsub">saved</text>
      </svg>
      <div className="pm-donut__meta">
        <strong>{label}</strong>
        <span>{sub}</span>
      </div>
    </div>
  );
}

/* Step 1 — Tell us about your banking */
export function PhoneStep1() {
  return (
    <Frame tint="navy">
      <div className="pm-appbar">Your Banking</div>
      <div className="pm-list">
        <div className="pm-row"><span>Current Bank</span><b>DBS</b></div>
        <div className="pm-row"><span>Product</span><b>Home Loan</b></div>
        <div className="pm-row"><span>Outstanding</span><b>SGD 500k</b></div>
        <div className="pm-row"><span>Rate p.a.</span><b>2.80%</b></div>
      </div>
      <div className="pm-chip">🔒 Anonymous · &lt; 1 min</div>
      <div className="pm-cta">Get Benchmarks</div>
    </Frame>
  );
}

/* Step 2 — Instant benchmarks */
export function PhoneStep2() {
  return (
    <Frame tint="blue">
      <div className="pm-appbar">Benchmarks</div>
      <Bars
        data={[
          { label: 'You', v: 2.8 },
          { label: 'Avg', v: 2.65 },
          { label: 'DBS', v: 2.7 },
          { label: 'UOB', v: 2.45, best: true },
          { label: 'SC', v: 2.55 },
        ]}
      />
      <div className="pm-stat">
        <span>Best available</span>
        <b className="pm-green">2.45% p.a.</b>
      </div>
    </Frame>
  );
}

/* Step 3 — Unlock savings */
export function PhoneStep3() {
  return (
    <Frame tint="navy">
      <div className="pm-appbar">Your Savings</div>
      <Donut pct={22} label="SGD 4,200 / yr" sub="vs your current bank" />
      <div className="pm-stat pm-stat--soft">
        <span>Monthly</span><b>SGD 350</b>
      </div>
      <div className="pm-stat pm-stat--soft">
        <span>Over 5 yrs</span><b className="pm-green">SGD 21,000</b>
      </div>
    </Frame>
  );
}

/* Step 4 — Negotiate / concierge */
export function PhoneStep4() {
  return (
    <Frame tint="blue">
      <div className="pm-appbar">Negotiation</div>
      <div className="pm-track">
        <div className="pm-track__row is-done"><span>Report generated</span>✓</div>
        <div className="pm-track__row is-done"><span>Bank contacted</span>✓</div>
        <div className="pm-track__row is-active"><span>Repricing offer</span>●</div>
        <div className="pm-track__row"><span>Savings locked</span>○</div>
      </div>
      <div className="pm-stat">
        <span>Success fee</span><b>Only if you save</b>
      </div>
    </Frame>
  );
}
