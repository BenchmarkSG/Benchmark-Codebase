import { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { getReference } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdvisorRow } from '../hooks/useAdvisorRow.js';
import { isAdminEmail, isSupportEmail } from '../lib/roles.js';
import { CTA_PRIMARY } from '../lib/copy.js';
import { Avatar } from './DefaultAvatar.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const LINKS = [
  ['#how', 'How it works'],
  ['#products', 'Products'],
  ['#savings', 'Real savings'],
  ['#partners', 'Banks we track'],
];

/* One entry for now. Kept as a real <select> rather than static text so adding
   a second locale is a one-line change and the control never has to be
   redesigned. */
const LANGUAGES = [['en', 'EN']];

const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
  </svg>
);

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { advisor } = useAdvisorRow();
  const admin = isAdminEmail(user);
  // isSupportEmail() is true for an admin too, so this is only the
  // support-desk account — an admin already has a portal link below.
  const support = !admin && isSupportEmail(user);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const name = user?.user_metadata?.full_name || user?.email;
  const go = () => setOpen(false);
  return (
    <div className="nav__user" ref={ref}>
      <button className="nav__avatar" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        <Avatar url={user?.user_metadata?.avatar_url} className="nav__avatar-img" />
      </button>
      {open && (
        <div className="nav__menu">
          <div className="nav__menu-name">{name}</div>
          <div className="nav__menu-email">{user?.email}</div>
          {admin && <a className="nav__menu-item" href="#admin" onClick={go}>Admin portal</a>}
          {support && <a className="nav__menu-item" href="#support" onClick={go}>Support portal</a>}
          {!admin && !support && (
            <a className="nav__menu-item" href="#dashboard" onClick={go}>My dashboard</a>
          )}
          {advisor && !admin && (
            <a className="nav__menu-item" href="#advisor" onClick={go}>Advisor dashboard</a>
          )}
          <button className="nav__menu-item nav__menu-item--danger" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Navbar({ onGetStarted, onSignIn, market = 'SG', onMarketChange }) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [countries, setCountries] = useState([]);
  const [lang, setLang] = useState('en');
  const ref = useRef(null);

  // Same catalog the calculator uses, so the header can never offer a market the
  // rest of the app doesn't have. getReference() memoises its promise, so this
  // shares the request the page already makes rather than adding one.
  useEffect(() => {
    getReference().then((r) => setCountries(r.countries || [])).catch(() => setCountries([]));
  }, []);

  // A <select> closed shows the selected option's own text, so the only way to
  // read "SG" when closed and "SG - Singapore" when open is to rewrite the
  // options at the moment the menu opens. mousedown/touchstart/keydown all fire
  // before the native menu is built, and React flushes these discrete events
  // synchronously, so the list is already relabelled by the time it appears.
  // Tab never opens the menu, and Escape closes it while keeping focus on the
  // select - so neither should leave the long labels on screen.
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  return (
    <header className="nav" ref={ref}>
      <div className="container nav__inner">
        <a className="nav__brand" href="#top" onClick={close}>
          {/* alt="" on purpose: the wordmark beside it already names the brand,
              so a screen reader would otherwise say "FeeOptima" twice. Intrinsic
              width/height keep the row from reflowing before the file loads. */}
          <img className="nav__logo" src="/logo-mark.png" alt="" width="162" height="120" />
          <span className="nav__brand-name"><span className="nav__brand-accent">Fee</span>Optima</span>
        </a>
        <nav className="nav__links">
          {LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        </nav>
        <div className="nav__actions">
          <ThemeToggle className="nav__theme" />
          {user ? (
            <UserMenu user={user} onSignOut={signOut} />
          ) : (
            <>
              {/* Desktop: text button. Phone: replaced by the profile icon below. */}
              <button className="btn btn--ghost nav__signin" onClick={onSignIn}>Sign in</button>
              <button className="nav__signin-icon" onClick={onSignIn} aria-label="Sign in">
                <ProfileIcon />
              </button>
            </>
          )}
          {/* Locale pickers, where the CTA used to sit. The country one is not
              decorative: it drives the same `market` the calculator, the
              products grid and the partner-logo marquee already follow. */}
          <label className="nav__pick nav__pick--lang">
            <span className="sr-only">Language</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <label className="nav__pick nav__pick--country">
            <span className="sr-only">Country</span>
            <select
              value={market}
              onChange={(e) => { setListOpen(false); onMarketChange?.(e.target.value); }}
              onMouseDown={() => setListOpen(true)}
              onTouchStart={() => setListOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') setListOpen(false); else if (e.key !== 'Tab') setListOpen(true); }}
              onBlur={() => setListOpen(false)}
              disabled={!countries.length}
            >
              {/* Until the catalog lands, show the current market rather than an
                  empty control that looks broken. */}
              {countries.length
                ? countries.map((c) => (
                  <option key={c.code} value={c.code}>{listOpen ? `${c.code} — ${c.name}` : c.code}</option>
                ))
                : <option value={market}>{market}</option>}
            </select>
          </label>
          <button
            className={`nav__burger ${menuOpen ? 'is-open' : ''}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu" aria-expanded={menuOpen}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="nav__mobile">
          {LINKS.map(([href, label]) => (
            <a key={href} href={href} onClick={close}>{label}</a>
          ))}
          <button className="btn btn--primary nav__mobile-cta" onClick={() => { close(); onGetStarted(); }}>
            {CTA_PRIMARY}
          </button>
        </div>
      )}
    </header>
  );
}
