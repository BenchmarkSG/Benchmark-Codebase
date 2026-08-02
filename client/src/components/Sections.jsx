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
    lines: ['Cross-border payments & cash sweeps'],
    big: 'SGD 28,000', bigSub: 'annual savings',
    quote: '"Reduced overheads dramatically — clear, credible benchmarks." ★★★★★',
  },
  {
    tint: 'red', icon: '🏠', tag: 'Homeowner',
    lines: ['Mortgage rates across lenders'],
    big: 'SGD 5,800', bigSub: 'annual savings',
    quote: '"Switched lender terms on the benchmark and never looked back." ★★★★★',
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
    <section className="section section--blue savings" id="savings">
      <div className="container">
        <h2 className="section-title">Real Savings Our Users Are Seeing</h2>
      </div>

      <div className="marquee savings__marquee" aria-label="Real savings carousel">
        <div className="marquee__track">
          {loop.map((s, i) => (
            <article className={`savings__card savings__card--${s.tint}`} key={`${s.tag}-${i}`}>
              <div className="savings__icon">{s.icon}</div>
              <div className="savings__tag">{s.tag}</div>
              <div className="savings__desc">
                {s.lines.map((l) => <p className="savings__line" key={l}>{l}</p>)}
              </div>
              <div className="savings__metric">
                <div className="savings__big">{s.big}</div>
                <div className="savings__big-sub">{s.bigSub}</div>
              </div>
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

export function WhyChoose() {
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
    </div>
  );
}

/* -------- Testimonials -------- */
const TESTIMONIALS = [
  { quote: 'Saved us over $20k a year on fees and FX. The benchmark report was eye-opening.', name: 'Operations Director', role: 'Trading Company' },
  { quote: 'Finally, a tool that shows real comparisons. Helped us negotiate a much better loan rate.', name: 'Homeowner', role: 'Singapore' },
  { quote: 'Excellent insights on cross-border payments. Reduced our costs significantly.', name: 'Finance Manager', role: 'Import/Export SME' },
  { quote: 'Cut our monthly FX spread almost in half. Wish we had found this years ago.', name: 'CFO', role: 'Manufacturing SME' },
  { quote: 'Clear, unbiased and fast. We renegotiated our mortgage within a week.', name: 'Property Investor', role: 'Singapore' },
  { quote: 'The benchmark gave us real leverage in the conversation with our bank.', name: 'Managing Director', role: 'Logistics Firm' },
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
            <p className="tst__quote">“{t.quote}”</p>
            <div className="tst__foot">
              <Avatar />
              <div>
                <div className="tst__who"><strong>{t.name},</strong><span>{t.role}</span></div>
                <Stars />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* -------- Founding advisors (column content) -------- */
export function Founding({ onBecomeMember }) {
  return (
    <div className="founding">
      <h2 className="section-title founding__title">Join Our Founding Advisors</h2>
      <p className="section-sub founding__sub">
        Be among the first banking specialists on BankBenchmark and get matched with the individuals
        and businesses who need your expertise. Founding advisors enjoy:
      </p>
      <div className="founding__grid">
        {[
          ['🏅', 'Founding advisor badge', 'on your public profile'],
          ['🤝', 'Priority client matches', 'ahead of later advisors'],
          ['👥', 'Exclusive advisor network', 'of top banking specialists'],
          ['📈', 'First access', 'to new markets, products & tools'],
        ].map(([i, t, s]) => (
          <div className="founding__item" key={t}>
            <span>{i}</span><div><strong>{t}</strong> {s}</div>
          </div>
        ))}
      </div>
      <div className="founding__bar">
        <div className="founding__bar-label">Limited founding advisor spots remaining</div>
        <div className="founding__bar-track"><div className="founding__bar-fill" /></div>
      </div>
      <button className="btn btn--red btn--block founding__cta" onClick={onBecomeMember}>
        Claim Your Founding Advisor Spot
      </button>
    </div>
  );
}

/* -------- FAQ -------- */
const FAQS = [
  {
    q: 'Is it really free?',
    a: 'Yes — benchmarking your rates, fees and FX margins is completely free with no sign-up. You only ever pay a share of the savings if you choose our negotiator to renegotiate on your behalf. No savings, no fee.',
  },
  {
    q: 'Do you store my bank statements or personal data?',
    a: 'No. We don’t keep personal or account-identifying data. When you paste or upload transaction data we process it to benchmark and keep only anonymised metrics (fees, margins, volumes). Please mask beneficiary names and references before sharing.',
  },
  {
    q: 'How does the negotiator work?',
    a: 'Our Negotiation Concierge contacts your bank armed with your specific benchmarking data. It’s a success-fee model with zero upfront cost — you only pay a percentage of the first-year savings we actually deliver.',
  },
];

export function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section section--blue faq" id="faq">
      <div className="container faq__inner">
        <h2 className="section-title">Frequently Asked Questions</h2>
        <p className="section-sub">Everything you need to know before you start.</p>

        <div className="faq__list">
          {FAQS.map((f, i) => (
            <div className={`faq__item ${open === i ? 'is-open' : ''}`} key={f.q}>
              <button
                className="faq__q"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span>{f.q}</span>
                <span className="faq__icon" aria-hidden="true">{open === i ? '−' : '+'}</span>
              </button>
              <div className="faq__a"><p>{f.a}</p></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------- Final CTA banner -------- */
export function FinalCTA({ onGetStarted, onConnect }) {
  return (
    <section className="finalcta">
      <div className="container finalcta__inner">
        <h2 className="finalcta__title">Don't Let Your Bank Keep Overcharging</h2>
        <p className="finalcta__sub">Compare free today and discover how much you could be saving.</p>
        <p className="finalcta__note">
          And you don't have to negotiate alone — our Negotiation Concierge contacts your bank
          on your behalf, armed with your specific benchmarking data. You only pay if we deliver savings.
        </p>
        <div className="finalcta__actions">
          <button className="btn finalcta__btn" onClick={onGetStarted}>Get My Free Benchmark Now</button>
          <button className="btn finalcta__btn-alt" onClick={onConnect}>Book a Call →</button>
        </div>
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

      <p className="container footer__legal">
        BankBenchmark.sg is an independent rate- and fee-benchmarking service, currently operated
        as a prototype. It is not a bank, a financial adviser, or a Capital Markets Services licence
        holder, and is not licensed or regulated by the Monetary Authority of Singapore (MAS).
        Nothing on this site constitutes financial, legal, or tax advice, or an offer to buy or sell
        any product. Benchmarks are indicative and based on curated market data together with
        anonymised, crowdsourced figures; your actual rates depend on your own circumstances. Bank
        names and logos are shown for identification only — we are not affiliated with, or endorsed
        by, any bank. Figures are illustrative. For regulated financial advice, please consult a
        MAS-licensed institution.
      </p>

      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} BankBenchmark.sg — Prototype. Figures are illustrative.</span>
        <span>Don't let your bank keep the difference.</span>
      </div>
    </footer>
  );
}
