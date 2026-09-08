import { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { useAuth } from '../context/AuthContext.jsx';
import { useAdvisorRow } from '../hooks/useAdvisorRow.js';
import { isAdminEmail } from '../lib/roles.js';
import { CTA_PRIMARY } from '../lib/copy.js';
import { Avatar } from './DefaultAvatar.jsx';
import ThemeToggle from './ThemeToggle.jsx';

const LINKS = [
  ['#how', 'How it works'],
  ['#products', 'Products'],
  ['#savings', 'Real savings'],
  ['#partners', 'Banks we track'],
];

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
          {admin ? (
            <a className="nav__menu-item" href="#admin" onClick={go}>Admin portal</a>
          ) : (
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

export default function Navbar({ onGetStarted, onSignIn }) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);

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
          {/* CTA is hidden on phones (see Navbar.css). */}
          <button className="btn btn--primary nav__cta" onClick={onGetStarted}>
            {CTA_PRIMARY}
          </button>
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
