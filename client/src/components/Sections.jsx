import { useCallback, useEffect, useRef, useState } from 'react';
import './Sections.css';
import { getReference, getFxRate } from '../api.js';
import { subscribeNewsletter } from '../lib/dashboardApi.js';
import { CTA_PRIMARY } from '../lib/copy.js';

/* -------- Banking products we compare --------
   Sourced from the same /api/reference catalog as the benchmark calculator, so
   the two never drift. Clicking a card selects that product in the calculator. */
export function Products({ onCompare, market = 'SG' }) {
  const [seg, setSeg] = useState('individual');
  const [products, setProducts] = useState([]);

  useEffect(() => {
    getReference().then((r) => setProducts(r.products || [])).catch(() => {});
  }, []);

  /* Market as well as segment — the same `onlyCountries` allowlist the
     calculator honours. Some products exist in one market and not another: an
     SME current account is benchmarked on the interest it EARNS in Singapore,
     but on the charges it COSTS in India, where the RBI forbids banks to pay
     interest on one. Filtering by segment alone showed both cards side by side,
     which read as a duplicate rather than as two markets' versions of the same
     thing — and offered a product the calculator would then refuse. */
  const list = products.filter((p) => p.segments?.includes(seg)
    && (!p.onlyCountries || p.onlyCountries.includes(market)));

  return (
    <div className="products" id="products">
      <h2 className="section-title products__title">Banking Products We Compare</h2>

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
    // Authored in SGD; shown in the visitor's market currency (see localAmount).
    amount: 28000, bigSub: 'annual savings',
    quote: '"Reduced overheads dramatically — clear, credible benchmarks." ★★★★★',
  },
  {
    tint: 'red', icon: '🏠', tag: 'Homeowner',
    lines: ['Mortgage rates across lenders'],
    amount: 5800, bigSub: 'annual savings',
    quote: '"Switched lender terms on the benchmark and never looked back." ★★★★★',
  },
  {
    tint: 'navy', icon: '🌐', tag: 'Importer / Exporter SME',
    lines: ['FX & cross-border payments'],
    // A ratio, not a sum — the same in every currency, so it never converts.
    big: '18%', bigSub: 'lower fees',
    quote: '"Transparent insights, real savings. Easy decision." ★★★★★',
  },
];

// The currency these scenarios are written in.
const SAVINGS_BASE = 'SGD';

/* Two significant figures. A converted figure like 1,848,000 reads as a precise
   measurement of something; 1,800,000 reads as the illustration it is, and the
   section says so directly underneath. */
function round2sf(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

const GROUP_LOCALE = { SGD: 'en-SG', INR: 'en-IN', MYR: 'ms-MY', IDR: 'id-ID', THB: 'th-TH', USD: 'en-US' };

/* CODE + grouped number, e.g. "SGD 28,000" / "INR 18,00,000". Deliberately not
   formatMoney(): these cards have always shown the ISO code rather than a
   symbol, and an Indian reader gets lakh grouping from the locale. */
function formatScenario(amount, ccy) {
  try {
    return `${ccy} ${new Intl.NumberFormat(GROUP_LOCALE[ccy] || 'en-US', { maximumFractionDigits: 0 }).format(amount)}`;
  } catch {
    return `${ccy} ${Math.round(amount).toLocaleString()}`;
  }
}

export function RealSavings({ market = 'SG' }) {
  /* Show the scenarios in the money the visitor actually banks in. The figures
     are authored in SGD, so this resolves the chosen market's currency and
     converts at the mid-market rate. Anything that fails — unknown market, FX
     down — leaves the original SGD figures on screen rather than a blank or a
     half-converted number. */
  const [local, setLocal] = useState(null); // { ccy, rate }

  useEffect(() => {
    let live = true;
    setLocal(null);
    getReference()
      .then((r) => (r.countries || []).find((c) => c.code === market)?.currency)
      .then((ccy) => {
        if (!live || !ccy || ccy === SAVINGS_BASE) return;
        return getFxRate(SAVINGS_BASE, ccy).then((rate) => {
          if (live && rate) setLocal({ ccy, rate });
        });
      })
      .catch(() => { /* stay in SGD */ });
    return () => { live = false; };
  }, [market]);

  const bigFor = (s) => {
    if (s.big) return s.big;                                   // already a ratio
    if (!local) return formatScenario(s.amount, SAVINGS_BASE);
    return formatScenario(round2sf(s.amount * local.rate), local.ccy);
  };

  // Duplicate so the marquee loops seamlessly (same trick as the bank logos).
  const loop = [...SAVINGS, ...SAVINGS];
  return (
    <section className="section section--blue savings" id="savings">
      <div className="container">
        <h2 className="section-title">Real Savings Your Peers are Seeing</h2>
        <p className="section-sub savings__sub">Illustrative examples of individuals &amp; corporates who routinely benchmark their bank fees &amp; rates.</p>
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
                <div className="savings__big">{bigFor(s)}</div>
                <div className="savings__big-sub">{s.bigSub}</div>
              </div>
              {s.quote && <p className="savings__quote">{s.quote}</p>}
            </article>
          ))}
        </div>
      </div>

      <p className="savings__foot container">🛡️ Built on market data &amp; actual savings negotiated by our advisors.</p>
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
                {/* Arrows swapped: left = navy, right = blue. Colours come from
                    CSS (see SegmentsWhy.css) because the navy one is the same
                    navy as the panel behind it once the page goes dark. */}
                <marker id="ah-blue" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <path className="segments__arrowhead segments__arrowhead--blue" d="M0 0 L7 3.5 L0 7 Z" />
                </marker>
                <marker id="ah-navy" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                  <path className="segments__arrowhead segments__arrowhead--navy" d="M0 0 L7 3.5 L0 7 Z" />
                </marker>
              </defs>
              <path className="segments__arrow segments__arrow--navy" d="M24 46 A58 58 0 0 0 30 104" strokeWidth="3" strokeLinecap="round" markerEnd="url(#ah-navy)" />
              <path className="segments__arrow segments__arrow--blue" d="M124 102 A58 58 0 0 0 118 44" strokeWidth="3" strokeLinecap="round" markerEnd="url(#ah-blue)" />
            </svg>
            <span>Compare What Matters Most to You</span>
          </div>
        </div>

        <article className="segments__col segments__col--sme">
          <div className="segments__head"><span className="segments__avatar">🏢</span><h3>For SMEs &amp; Corporates</h3></div>
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
  { icon: '🎓', title: 'Decades of Expertise', body: 'Powered by team of ex-Bankers.' },
  { icon: '🎯', title: 'Real Savings Focus', body: 'We focus on real cost savings & negotiation leverage.' },
  { icon: '⚡', title: 'Fast & Free', body: 'Start free comparison, full fee refunded in case savings not upto satisfaction.' },
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

/* A scroll-snap carousel rather than a transform-based one: the number of cards
   on screen is set in CSS (3 / 2 / 1 by width), so the component never has to
   know the breakpoints — it measures a card and scrolls by that much. Native
   scrolling also means trackpad swipes and touch work for free. */
export function Testimonials() {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);   // leftmost visible card
  const [maxIndex, setMaxIndex] = useState(0);
  const hovering = useRef(false);

  // One card plus one gap: the distance a single step scrolls.
  const step = () => {
    const el = trackRef.current;
    const card = el?.querySelector('.tst__card');
    if (!el || !card) return 0;
    return card.getBoundingClientRect().width + (parseFloat(getComputedStyle(el).columnGap) || 0);
  };

  // How far the track can actually scroll decides how many dots there are, so
  // the last dot lands on the last card rather than on empty space.
  const measure = useCallback(() => {
    const el = trackRef.current;
    const s = step();
    if (!el || !s) return;
    setMaxIndex(Math.max(0, Math.round((el.scrollWidth - el.clientWidth) / s)));
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const go = (i) => {
    const el = trackRef.current;
    const s = step();
    if (!el || !s) return;
    el.scrollTo({ left: i * s, behavior: 'smooth' });
  };

  const onScroll = () => {
    const el = trackRef.current;
    const s = step();
    if (!el || !s) return;
    setIndex(Math.round(el.scrollLeft / s));
  };

  // Advance on its own, but never while someone is reading a card or tabbing
  // through them, and never when the visitor has asked for less motion.
  useEffect(() => {
    if (maxIndex < 1) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => {
      if (hovering.current) return;
      setIndex((i) => { const next = i >= maxIndex ? 0 : i + 1; go(next); return next; });
    }, 6000);
    return () => clearInterval(t);
  }, [maxIndex]);

  return (
    <div className="tst">
      <h2 className="section-title tst__title">Built for Businesses &amp; Professionals</h2>
      <p className="section-sub tst__sub">Illustrative scenarios showing how people use their benchmark — real reviews will appear here as they come in.</p>

      <div
        className="tst__carousel"
        onMouseEnter={() => { hovering.current = true; }}
        onMouseLeave={() => { hovering.current = false; }}
        onFocusCapture={() => { hovering.current = true; }}
        onBlurCapture={() => { hovering.current = false; }}
      >
        <div className="tst__list" ref={trackRef} onScroll={onScroll}>
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

        {maxIndex > 0 && (
          <div className="tst__controls">
            <button
              type="button" className="tst__arrow" aria-label="Previous testimonials"
              onClick={() => go(Math.max(0, index - 1))} disabled={index === 0}
            >←</button>
            <div className="tst__dots" role="tablist" aria-label="Testimonials">
              {Array.from({ length: maxIndex + 1 }, (_, i) => (
                <button
                  key={i} type="button" role="tab" aria-selected={i === index}
                  className={`tst__dot ${i === index ? 'is-active' : ''}`}
                  aria-label={`Show testimonials ${i + 1}`}
                  onClick={() => go(i)}
                />
              ))}
            </div>
            <button
              type="button" className="tst__arrow" aria-label="More testimonials"
              onClick={() => go(Math.min(maxIndex, index + 1))} disabled={index >= maxIndex}
            >→</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------- Founding advisors (column content) -------- */
export function Founding({ onBecomeMember }) {
  return (
    <div className="founding">
      <h2 className="section-title founding__title">Join Our Team of Advisors</h2>
      <p className="section-sub founding__sub">
        Are you an ex-Banker, ex-Accountant or an ex-Corporate Treasury / SME Finance professional
        and want to contribute to community? Join team of advisors in FeeOptima and get matched with
        the individuals and businesses who need your expertise for a fee that you decide.
      </p>
      <div className="founding__grid">
        {[
          ['💰', 'Monetize your expertise', '— you know banking, now get paid for it. Turn your banking knowledge into income.'],
          ['🗓️', 'Flexibility & independence', '— be your own boss: you decide your schedule and your fees. We bring the clients, you bring the expertise.'],
          ['🤝', 'Purpose & community', '— put your experience to the people who need it, alongside a network of ex-bankers and finance leaders.'],
          ['🆓', 'Low risk & no cost', '— free to join. Zero upfront cost. Earn from day one.'],
        ].map(([i, t, s]) => (
          <div className="founding__item" key={t}>
            <span>{i}</span><div><strong>{t}</strong> {s}</div>
          </div>
        ))}
      </div>
      <button className="btn btn--red btn--block founding__cta" onClick={onBecomeMember}>
        Join as an Advisor
      </button>
    </div>
  );
}

/* -------- FAQ -------- */
const FAQS = [
  {
    q: 'Is it really free?',
    a: 'Benchmarking your rates, fees and FX margins is completely free with no sign-up. Revealing your best-match bank costs a small one-off fee — and drafting your negotiation email is then included. If you want hands-on help, a coaching call and an expert-led negotiation are also available. Every price is shown in your local currency before you pay, and the paid help is fully refundable if we don’t find you savings.',
  },
  {
    q: 'Do you store my bank statements or personal data?',
    a: 'No. We don’t keep personal or account-identifying data. When you paste or upload transaction data we process it to benchmark and keep only anonymised metrics (fees, margins, volumes). Please mask beneficiary names and references before sharing.',
  },
  {
    q: 'How does the expert negotiation work?',
    a: 'An ex-banker contacts your bank armed with your specific benchmarking data and negotiates on your behalf. The fee is fully refundable if no savings are delivered — so there’s no risk in trying.',
  },
];

export function FAQ() {
  // Every answer starts closed. Opening the first one for the reader decides
  // which question they had, and pushes the other two down the page.
  const [open, setOpen] = useState(null);
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
/* Social profiles.
 *
 * TODO(launch): every href below is a PLACEHOLDER pointing at the platform's own
 * homepage, so the icons render while the FeeOptima accounts are still being
 * created. Swap each one for the real profile URL (the shape is in the comment
 * beside it) before going live — a footer icon that lands on linkedin.com's
 * front door reads as an unfinished site. Blank an href to skip that platform;
 * blank all four and the whole "Follow us on" block hides itself.
 *
 * Marks are drawn inline rather than fetched: four network requests for four
 * 20px glyphs, and logo CDNs are exactly what an ad blocker eats. */
const SOCIALS = [
  {
    label: 'LinkedIn',
    slug: 'linkedin',
    href: 'https://www.linkedin.com/', // placeholder — real: https://www.linkedin.com/company/feeoptima
    path: 'M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z',
  },
  {
    label: 'Instagram',
    slug: 'instagram',
    href: 'https://www.instagram.com/', // placeholder — real: https://www.instagram.com/feeoptima
    path: 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.71-2.13 1.38C1.34 2.68.93 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.71 1.46 1.38 2.13.67.67 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.71 2.13-1.38.67-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.71-1.46-1.38-2.13C21.32 1.34 20.65.93 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.85-10.4a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z',
  },
  {
    label: 'Facebook',
    slug: 'facebook',
    href: 'https://www.facebook.com/', // placeholder — real: https://www.facebook.com/feeoptima
    path: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z',
  },
  {
    label: 'X',
    slug: 'x',
    href: 'https://x.com/', // placeholder — real: https://x.com/feeoptima
    path: 'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z',
  },
].filter((s) => s.href);

/* Footer newsletter sign-up. Anonymous by design — no account needed, so the
   insert goes in as the anon role (see supabase/newsletter.sql). */
function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | busy | done | already | error
  const [msg, setMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const clean = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setState('error'); setMsg('Please enter a valid email address.');
      return;
    }
    setState('busy'); setMsg('');
    try {
      const r = await subscribeNewsletter(clean);
      setState(r === 'already' ? 'already' : 'done');
      setEmail('');
    } catch {
      setState('error');
      setMsg('Couldn’t sign you up just now — please try again.');
    }
  };

  return (
    <form className="footer__news" onSubmit={submit} noValidate>
      <h4>Subscribe to our newsletter</h4>
      <div className="footer__news-row">
        <label className="sr-only" htmlFor="footer-news-email">Email address</label>
        <input
          id="footer-news-email" type="email" inputMode="email" autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state !== 'idle') { setState('idle'); setMsg(''); } }}
        />
        <button type="submit" disabled={state === 'busy'}>
          {state === 'busy' ? 'Adding\u2026' : 'Subscribe'}
        </button>
      </div>
      {/* Polite, not assertive — a confirmation, not an alert. */}
      <p className={`footer__news-note ${state === 'error' ? 'is-err' : ''}`} role="status" aria-live="polite">
        {state === 'done' ? '✓ You’re on the list.'
          : state === 'already' ? '✓ You’re already subscribed.'
            : msg}
      </p>
    </form>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div>
          <div className="footer__brand"><span>Fee</span>Optima</div>
          <p>We’re an independent platform that shows individuals, SMEs, and corporates how their bank’s fees, rates, and pricing compare to the cheapest options available — with no bank bias. The best rate wins. Always.</p>
          <Newsletter />
        </div>
        <div>
          <h4>Product</h4>
          <a href="#how">How it works</a><a href="#products">Products</a><a href="#savings">Real savings</a>
        </div>
        <div>
          <h4>Company</h4>
          <a href="#partners">Banks we track</a><a href="#faq">FAQ</a>
          {/* Inside the Company column rather than a grid cell of its own: as its
              own cell it landed on a second grid row, whose top is set by the
              tallest first-row cell (the brand column, which carries the
              newsletter) — leaving a band of dead space above it. */}
          {SOCIALS.length > 0 && (
            <div className="footer__follow">
              <h4>Follow us on</h4>
              <div className="footer__social">
                {SOCIALS.map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                     data-net={s.slug} aria-label={s.label} title={s.label}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                      <path d={s.path} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>
          )}
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
