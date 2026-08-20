import { useEffect, useState } from 'react';
import './Sections.css';
import { getReference } from '../api.js';
import { CTA_PRIMARY } from '../lib/copy.js';

/* -------- Banking products we compare --------
   Sourced from the same /api/reference catalog as the benchmark calculator, so
   the two never drift. Clicking a card selects that product in the calculator. */
export function Products({ onCompare }) {
  const [seg, setSeg] = useState('individual');
  const [products, setProducts] = useState([]);

  useEffect(() => {
    getReference().then((r) => setProducts(r.products || [])).catch(() => {});
  }, []);

  const list = products.filter((p) => p.segments?.includes(seg));

  return (
    <div className="products" id="products">
      <h2 className="section-title products__title">Banking Products We Compare</h2>
      <p className="section-sub products__sub">Comprehensive benchmarking across all major banking categories.</p>

      <div className="products__toggle">
        <button className={seg === 'individual' ? 'is-active' : ''} onClick={() => setSeg('individual')}>For Individuals</button>
        <button className={seg === 'sme' ? 'is-active' : ''} onClick={() => setSeg('sme')}>For SMEs &amp; Corporates</button>
      </div>

      <div className="products__grid">
        {list.map((p) => (
          <button
            type="button"
            className="products__card"
            key={p.id}
            onClick={() => onCompare?.({ segment: seg, productId: p.id })}
          >
            <h3>{p.label}</h3>
            <p>{p.blurb}</p>
            <span className="products__link">Compare Now →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------- Savings scenarios (illustrative — swap in real, consented case
   studies as they land) -------- */
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
        <h2 className="section-title">The Savings on the Table</h2>
        <p className="section-sub savings__sub">Illustrative scenarios based on the gaps our benchmarks routinely uncover.</p>
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

      <p className="savings__foot container">🛡️ Built on anonymised market data + expert benchmarks. Examples are illustrative.</p>
    </section>
  );
}

/* -------- For individuals vs SMEs split -------- */
export function Segments({ onGetStarted, onCompare }) {
  const compare = (segment) => (onCompare ? onCompare({ segment }) : onGetStarted?.());
  return (
    <div className="segments">
      <div className="segments__stack">
        <article className="segments__col segments__col--ind">
          <div className="segments__head"><span className="segments__avatar">🧑</span><h3>For Individuals</h3></div>
          <p>Home, personal &amp; vehicle loan rates, fixed-deposit yields and cross-border transfer fees.</p>
          <ul>
            <li>Home Loans</li>
            <li>Personal Loans</li>
            <li>Vehicle Loans</li>
            <li>Fixed Deposits</li>
            <li>Cross-border Transfers</li>
          </ul>
          <button className="btn btn--navy btn--block" onClick={() => compare('individual')}>Compare Now</button>
        </article>

        <div className="segments__mid">
          <div className="segments__circle">
            <svg className="segments__arrows" viewBox="0 0 148 148" fill="none" aria-hidden="true">
              <defs>
                {/* Arrows swapped: left = navy, right = blue */}
                <marker id="ah-blue" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <path d="M0 0 L7 3.5 L0 7 Z" fill="#2f7bd8" />
                </marker>
                <marker id="ah-navy" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <path d="M0 0 L7 3.5 L0 7 Z" fill="#12294d" />
                </marker>
              </defs>
              <path d="M24 46 A58 58 0 0 0 30 104" stroke="#12294d" strokeWidth="3" strokeLinecap="round" markerEnd="url(#ah-navy)" />
              <path d="M124 102 A58 58 0 0 0 118 44" stroke="#2f7bd8" strokeWidth="3" strokeLinecap="round" markerEnd="url(#ah-blue)" />
            </svg>
            <span>Compare What Matters Most to You</span>
          </div>
        </div>

        <article className="segments__col segments__col--sme">
          <div className="segments__head"><span className="segments__avatar">🏢</span><h3>For SMEs</h3></div>
          <p>Current-account interest, overdraft &amp; trade-finance pricing, fixed-deposit yields and cross-border FX costs.</p>
          <ul>
            <li>Current Accounts</li>
            <li>Overdraft Facilities</li>
            <li>Trade Finance</li>
            <li>Guarantees &amp; L/Cs</li>
            <li>Fixed Deposits</li>
            <li>Cross-border Transfers</li>
          </ul>
          <button className="btn btn--primary btn--block" onClick={() => compare('sme')}>Compare Now</button>
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
      <h2 className="section-title why__title">Why Choose <span className="accent-blue">Fee</span>Optima?</h2>
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

// Distinct illustrated avatars (self-contained, no external assets). Varied skin
// tone, hair and clothing so each testimonial reads as a different person —
// clearly illustrations, not photos of specific individuals. Swap for real
// customer headshots (with consent) by dropping images in public/images.
const FACES = [
  { skin: '#eebd97', hair: '#3b2a1e', bg: '#e7eef8', shirt: '#2f5fbf', long: true },
  { skin: '#a5714a', hair: '#171717', bg: '#efe7f7', shirt: '#7a3ea0', long: false },
  { skin: '#e8b48c', hair: '#6b4a2b', bg: '#fbe9e7', shirt: '#d0544a', long: false },
  { skin: '#c98d5e', hair: '#242424', bg: '#e6f6ee', shirt: '#1a9d6a', long: true },
  { skin: '#f2d1b3', hair: '#9aa0a8', bg: '#eef1f6', shirt: '#334155', long: false },
  { skin: '#b57a4e', hair: '#201811', bg: '#fdf0e3', shirt: '#e0894b', long: true },
];

const Avatar = ({ i = 0 }) => {
  const f = FACES[i % FACES.length];
  const cid = `avc-${i}`;
  return (
    <svg className="tst__avatar" viewBox="0 0 48 48" width="52" height="52" role="img" aria-label="Customer avatar">
      <defs><clipPath id={cid}><circle cx="24" cy="24" r="24" /></clipPath></defs>
      <g clipPath={`url(#${cid})`}>
        <rect width="48" height="48" fill={f.bg} />
        <path d="M4 48c0-11 9-16 20-16s20 5 20 16z" fill={f.shirt} />
        <path d="M20 28h8v6a4 4 0 0 1-8 0z" fill={f.skin} />
        <circle cx="24" cy="20" r="10.5" fill={f.skin} />
        {f.long ? (
          <path d="M11 30c-1-4-1-9 1-13 2-5 7-7 12-7s10 2 12 7c2 4 2 9 1 13c0-2-1-4-2-6c0-8-4-9-11-9s-11 1-11 9c-1 2-2 4-2 6z" fill={f.hair} />
        ) : (
          <path d="M13.5 20c0-8 4.5-11 10.5-11s10.5 3 10.5 11c-1.5-4-4.5-6-10.5-6s-9 2-10.5 6z" fill={f.hair} />
        )}
      </g>
    </svg>
  );
};
const Stars = () => (
  <div className="tst__stars">{'★★★★★'.split('').map((s, i) => <span key={i}>★</span>)}</div>
);

export function Testimonials() {
  return (
    <div className="tst">
      <h2 className="section-title tst__title">Built for Businesses &amp; Professionals</h2>
      <p className="section-sub tst__sub">Illustrative scenarios showing how people use their benchmark — real reviews will appear here as they come in.</p>
      <div className="tst__list">
        {TESTIMONIALS.map((t, i) => (
          <article className="tst__card" key={t.quote}>
            <p className="tst__quote">“{t.quote}”</p>
            <div className="tst__foot">
              <Avatar i={i} />
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
      <h2 className="section-title founding__title">Join Our Advisors Community</h2>
      <p className="section-sub founding__sub">
        Be among the first banking specialists on FeeOptima and get matched with the individuals
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
    a: 'Benchmarking your rates, fees and FX margins is completely free with no sign-up. Revealing your best-match bank costs about S$1 (charged in your local currency) — and drafting your negotiation email is then included. If you want hands-on help, a coaching call is S$99 and an expert-led negotiation is S$199, both fully refundable if we don’t find you savings.',
  },
  {
    q: 'Do you store my bank statements or personal data?',
    a: 'No. We don’t keep personal or account-identifying data. When you paste or upload transaction data we process it to benchmark and keep only anonymised metrics (fees, margins, volumes). Please mask beneficiary names and references before sharing.',
  },
  {
    q: 'How does the expert negotiation work?',
    a: 'An ex-banker contacts your bank armed with your specific benchmarking data and negotiates on your behalf. The S$199 fee is fully refundable if no savings are delivered — so there’s no risk in trying.',
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
export function FinalCTA({ onGetStarted }) {
  return (
    <section className="finalcta">
      <div className="container finalcta__inner">
        <h2 className="finalcta__title">Don't Let Your Bank Keep Overcharging</h2>
        <p className="finalcta__sub">Compare free today and discover how much you could be saving.</p>
        <p className="finalcta__note">
          And you don't have to negotiate alone — an ex-banker can contact your bank on your
          behalf, armed with your specific benchmarking data. Fully refundable if we don't find you savings.
        </p>
        <div className="finalcta__actions">
          <button className="btn finalcta__btn" onClick={onGetStarted}>{CTA_PRIMARY} →</button>
        </div>
      </div>
    </section>
  );
}

/* -------- Footer -------- */
// Social profiles. Add entries with our REAL profile URLs when the accounts
// exist — icons for platforms we're not on yet must not ship (placeholder links
// to platform homepages read as broken). Shape: { label, href, icon }.
const SOCIALS = [];

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div>
          <div className="footer__brand"><span>Fee</span>Optima</div>
          <p>Independent bank benchmarking for individuals, SMEs and corporates across Singapore & SEA.</p>
          {SOCIALS.length > 0 && (
            <div className="footer__social" aria-label="Follow us">
              {SOCIALS.map((s) => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                   aria-label={s.label} title={s.label}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">{s.icon}</svg>
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4>Product</h4>
          <a href="#how">How it works</a><a href="#products">Products</a><a href="#savings">Real savings</a>
        </div>
        <div>
          <h4>Company</h4>
          <a href="#partners">Banks we track</a><a href="#faq">FAQ</a>
        </div>
        <div>
          <h4>Legal</h4>
          <a href="#privacy">Privacy Policy</a><a href="#terms">Terms &amp; Conditions</a><a href="#disclaimer">Disclaimer</a>
        </div>
      </div>

      <p className="container footer__legal">
        FeeOptima is an independent rate and fee benchmarking service. It is not a bank, a
        financial adviser, or a Capital Markets Services licence holder, and is not licensed or
        regulated by the Monetary Authority of Singapore (MAS). Nothing on this site constitutes
        financial, legal, or tax advice, or an offer to buy or sell any product. Benchmarks are
        indicative and based on curated market data together with anonymised, crowdsourced figures;
        your actual rates depend on your own circumstances. Bank names and logos are shown for
        identification only — we are not affiliated with, or endorsed by, any bank. Figures are
        illustrative. For regulated financial advice, please consult a MAS-licensed adviser. We aspire
        to be a leading voice for individuals and SMEs in banking — every customer, regardless of size,
        deserves equitable pricing and a bank that values their business.
      </p>

      <div className="container footer__bottom">
        <span>© {new Date().getFullYear()} FeeOptima. Figures are illustrative.</span>
        <span className="footer__tagline">Don't let your bank keep the difference.</span>
      </div>
    </footer>
  );
}
