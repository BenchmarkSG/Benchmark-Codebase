import { useState } from 'react';
import './Sections.css';

/* -------- Banking products we compare -------- */
const PRODUCTS = {
  individual: [
    { title: 'Mortgages', sub: 'Home loan rates & conditions' },
    { title: 'Savings Accounts', sub: 'Interest rates & account fees' },
    { title: 'Fixed Deposits', sub: 'Maturity rates & terms' },
    { title: 'Personal Loans', sub: 'Interest rates & processing fees' },
    { title: 'FX & Remittance', sub: 'Exchange rates & transfer fees' },
    { title: 'Credit Cards', sub: 'Rewards & annual fees' },
  ],
  sme: [
    { title: 'Current Accounts', sub: 'Interest & maintenance fees' },
    { title: 'Business Loans', sub: 'Working capital & term loans' },
    { title: 'Trade Finance', sub: 'LC, BG, invoice financing' },
    { title: 'FX Margins', sub: 'Spreads on business FX' },
    { title: 'Bulk Payments', sub: 'Payroll & vendor payouts' },
    { title: 'Cash Management', sub: 'Sweeps & liquidity structures' },
  ],
};

export function Products() {
  const [seg, setSeg] = useState('individual');
  return (
    <div className="products" id="products">
      <h2 className="section-title products__title">Banking Products We Compare</h2>
      <p className="section-sub products__sub">Comprehensive benchmarking across all major banking categories.</p>

      <div className="products__toggle">
        <button className={seg === 'individual' ? 'is-active' : ''} onClick={() => setSeg('individual')}>For Individuals</button>
        <button className={seg === 'sme' ? 'is-active' : ''} onClick={() => setSeg('sme')}>For SMEs/Corporate </button>
      </div>

      <div className="products__grid">
        {PRODUCTS[seg].map((p) => (
          <article className="products__card" key={p.title}>
            <h3>{p.title}</h3>
            <p>{p.sub}</p>
            <span className="products__link">Compare Now →</span>
          </article>
        ))}
      </div>
    </div>
  );
}

/* -------- Real savings our users are seeing -------- */
const SAVINGS = [
  {
    tint: 'blue', icon: '🚢', tag: 'Shipping / Logistics SME',
    lines: ['Current: High cross-border fees + fragmented sweeps', 'Benchmark: Centralized Singapore sweep + better FX'],
    big: 'SGD 28,000', bigSub: 'annual savings',
    quote: '"Reduced overheads dramatically — similar to structures we implemented for international clients."',
  },
  {
    tint: 'red', icon: '🏠', tag: 'Homeowner',
    lines: ['Mortgage rate comparison'],
    big: 'SGD 5,800', bigSub: 'saved per year by switching lender terms.',
    quote: null,
  },
  {
    tint: 'navy', icon: '🌐', tag: 'Importer / Exporter SME',
    lines: ['FX & cross-border payments'],
    big: '18%', bigSub: 'lower fees',
    quote: '"Transparent insights, real savings. Easy decision." ★★★★★',
  },
];

export function RealSavings() {
  // Duplicate so the marquee loops seamlessly (same trick as the bank logos).
  const loop = [...SAVINGS, ...SAVINGS];
  return (
    <section className="section section--soft savings" id="savings">
      <div className="container">
        <h2 className="section-title">Real Savings Our Users Are Seeing</h2>
      </div>

      <div className="marquee savings__marquee" aria-label="Real savings carousel">
        <div className="marquee__track">
          {loop.map((s, i) => (
            <article className={`savings__card savings__card--${s.tint}`} key={`${s.tag}-${i}`}>
              <div className="savings__icon">{s.icon}</div>
              <div className="savings__tag">{s.tag}</div>
              {s.lines.map((l) => <p className="savings__line" key={l}>{l}</p>)}
              <div className="savings__big">{s.big}</div>
              <div className="savings__big-sub">{s.bigSub}</div>
              {s.quote && <p className="savings__quote">{s.quote}</p>}
            </article>
          ))}
        </div>
      </div>

      <p className="savings__foot container">🛡️ Anonymous real user data + expert benchmarks.</p>
    </section>
  );
}

/* -------- For individuals vs SMEs split -------- */
export function Segments({ onGetStarted }) {
  return (
    <div className="segments">
      <div className="segments__stack">
        <article className="segments__col segments__col--ind">
          <div className="segments__head"><span className="segments__avatar">🧑</span><h3>For Individuals</h3></div>
          <p>Mortgage &amp; personal loan rate comparisons, cross-border remittance fees and more.</p>
          <ul>
            <li>Home Loans</li><li>Remittance Fees</li>
            <li>Personal Loans</li><li>Savings Accounts</li>
            <li>Credit Cards</li><li>Insurance</li>
          </ul>
          <button className="btn btn--navy btn--block" onClick={onGetStarted}>Compare Now</button>
        </article>

        <div className="segments__mid">
          <div className="segments__circle">
            <svg className="segments__arrows" viewBox="0 0 148 148" fill="none" aria-hidden="true">
              <defs>
                <marker id="ah-blue" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <path d="M0 0 L7 3.5 L0 7 Z" fill="#1d63c4" />
                </marker>
                <marker id="ah-red" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <path d="M0 0 L7 3.5 L0 7 Z" fill="#d81e29" />
                </marker>
              </defs>
              <path d="M24 46 A58 58 0 0 0 30 104" stroke="#1d63c4" strokeWidth="3" strokeLinecap="round" markerEnd="url(#ah-blue)" />
              <path d="M124 102 A58 58 0 0 0 118 44" stroke="#d81e29" strokeWidth="3" strokeLinecap="round" markerEnd="url(#ah-red)" />
            </svg>
            <span>Compare What Matters Most to You</span>
          </div>
        </div>

        <article className="segments__col segments__col--sme">
          <div className="segments__head"><span className="segments__avatar">🏢</span><h3>For SMEs</h3></div>
          <p>Current account interest, business loans, trade finance, FX margins, bulk payments and more.</p>
          <ul>
            <li>Current Accounts</li><li>FX Margins</li>
            <li>Business Loans</li><li>Bulk Payments</li>
            <li>Trade Finance</li><li>Cash Management</li>
          </ul>
          <button className="btn btn--primary btn--block" onClick={onGetStarted}>Compare Now</button>
        </article>
      </div>
    </div>
  );
}

/* -------- Why choose us -------- */
const WHY = [
  { icon: '🛡️', title: 'Independent', body: 'Not tied to any bank. 100% on your side.' },
  { icon: '🎓', title: 'Decades of Expertise', body: 'Powered by ex-JPM, Citi & SCB transaction banking experts.' },
  { icon: '🎯', title: 'Real Savings Focus', body: 'We focus on real cost savings & negotiation leverage.' },
  { icon: '⚡', title: 'Fast & Free', body: 'Start free, upgrade only when you want the full report.' },
];

export function WhyChoose({ onConnect }) {
  return (
    <div className="why">
      <h2 className="section-title why__title">Why Choose Bank<span className="accent-blue">Benchmark</span>.sg?</h2>
      <p className="section-sub why__sub">Independent, expert-led benchmarking focused on real savings.</p>
      <div className="why__list">
        {WHY.map((w) => (
          <article className="why__item" key={w.title}>
            <div className="why__icon">{w.icon}</div>
            <div className="why__item-body">
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="why__negotiate">
        <h3 className="why__negotiate-title">Don't Negotiate Alone</h3>
        <p className="why__negotiate-text">
          Our Negotiation Concierge will contact your bank on your behalf, armed with your
          specific benchmarking data. You only pay if we deliver savings.
        </p>
        <button className="btn btn--blue" onClick={onConnect}>Book a Call →</button>
      </div>
    </div>
  );
}

/* -------- Testimonials -------- */
const TESTIMONIALS = [
  { quote: 'Saved us over $20k a year on fees and FX. The benchmark report was eye-opening.', name: 'Operations Director', role: 'Trading Company' },
  { quote: 'Finally, a tool that shows real comparisons. Helped us negotiate a much better loan rate.', name: 'Homeowner', role: 'Singapore' },
  { quote: 'Excellent insights on cross-border payments. Reduced our costs significantly.', name: 'Finance Manager', role: 'Import/Export SME' },
];

const Avatar = () => (
  <svg viewBox="0 0 48 48" width="52" height="52" aria-hidden="true">
    <circle cx="24" cy="24" r="24" fill="#e4ecf7" />
    <circle cx="24" cy="19" r="8" fill="#9db4d4" />
    <path d="M8 42c2-9 9-13 16-13s14 4 16 13z" fill="#9db4d4" />
  </svg>
);
const Stars = () => (
  <div className="tst__stars">{'★★★★★'.split('').map((s, i) => <span key={i}>★</span>)}</div>
);

export function Testimonials() {
  return (
    <div className="tst">
      <h2 className="section-title tst__title">Trusted by Businesses &amp; Professionals</h2>
      <div className="tst__list">
        {TESTIMONIALS.map((t) => (
          <article className="tst__card" key={t.quote}>
            <Avatar />
            <div className="tst__body">
              <p className="tst__quote">“{t.quote}”</p>
              <div className="tst__who"><strong>{t.name},</strong><span>{t.role}</span></div>
              <Stars />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* -------- Founding members (column content) -------- */
export function Founding({ onGetStarted }) {
  return (
    <div className="founding">
      <h2 className="section-title founding__title">Join Our Founding Members</h2>
      <p className="section-sub founding__sub">
        Be among the first 5,000 SME founders to access BankBenchmark. Founding members enjoy:
      </p>
      <div className="founding__grid">
        {[
          ['🏅', 'Lifetime badge', 'recognizing your early adoption'],
          ['⚡', 'Priority concierge', 'for bank negotiations'],
          ['👥', 'Exclusive community', 'of high-performing SMEs'],
          ['📈', 'First access', 'to new features and benchmarks'],
        ].map(([i, t, s]) => (
          <div className="founding__item" key={t}>
            <span>{i}</span><div><strong>{t}</strong> {s}</div>
          </div>
        ))}
      </div>
      <div className="founding__bar">
        <div className="founding__bar-label">5000 spots remaining</div>
        <div className="founding__bar-track"><div className="founding__bar-fill" /></div>
      </div>
      <button className="btn btn--primary btn--block founding__cta" onClick={onGetStarted}>
        Claim Your Founding Member Spot
      </button>
    </div>
  );
}

/* -------- Final CTA banner -------- */
export function FinalCTA({ onGetStarted }) {
  return (
    <section className="finalcta">
      <div className="container finalcta__inner">
        <h2 className="finalcta__title">Don't Let Your Bank Keep Overcharging</h2>
        <p className="finalcta__sub">Compare free today and discover how much you could be saving.</p>
        <button className="btn finalcta__btn" onClick={onGetStarted}>Get My Free Benchmark Now</button>
      </div>
    </section>
  );
}

/* -------- Footer -------- */
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div>
          <div className="footer__brand">Bank<span>Benchmark</span>.sg</div>
          <p>Independent bank benchmarking for individuals, SMEs and corporates across Singapore & SEA.</p>
        </div>
        <div>
          <h4>Product</h4>
          <a href="#how">How it works</a><a href="#products">Products</a><a href="#savings">Real savings</a>
        </div>
        <div>
          <h4>Company</h4>
          <a href="#top">About</a><a href="#partners">Partners</a><a href="#top">Careers</a>
        </div>
        <div>
          <h4>Legal</h4>
          <a href="#top">Privacy</a><a href="#top">Terms</a><a href="#top">Disclaimer</a>
        </div>
      </div>
      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} BankBenchmark.sg — Prototype. Figures are illustrative.</span>
        <span>Don't let your bank keep the difference.</span>
      </div>
    </footer>
  );
}
