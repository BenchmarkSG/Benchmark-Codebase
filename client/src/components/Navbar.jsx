import { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { useAuth } from '../context/AuthContext.jsx';

function initials(user) {
  const name = user?.user_metadata?.full_name || user?.email || '';
  const parts = name.replace(/@.*/, '').split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function UserMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const name = user?.user_metadata?.full_name || user?.email;
  return (
    <div className="nav__user" ref={ref}>
      <button className="nav__avatar" onClick={() => setOpen((o) => !o)} aria-label="Account menu">
        {initials(user)}
      </button>
      {open && (
        <div className="nav__menu">
          <div className="nav__menu-name">{name}</div>
          <div className="nav__menu-email">{user?.email}</div>
          <button className="nav__menu-item" onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export default function Navbar({ onGetStarted, onSignIn }) {
  const { user, signOut } = useAuth();

  return (
    <header className="nav">
      <div className="container nav__inner">
        <a className="nav__brand" href="#top">
          Bank<span className="nav__brand-accent">Benchmark</span>
          <span className="nav__tld">.sg</span>
        </a>
        <nav className="nav__links">
          <a href="#how">How it works</a>
          <a href="#products">Products</a>
          <a href="#savings">Real savings</a>
          <a href="#partners">Partners</a>
        </nav>
        <div className="nav__actions">
          {user ? (
            <UserMenu user={user} onSignOut={signOut} />
          ) : (
            <button className="btn btn--ghost nav__signin" onClick={onSignIn}>Sign in</button>
          )}
          <button className="btn btn--primary nav__cta" onClick={onGetStarted}>
            Get My Free Benchmark
          </button>
        </div>
      </div>
    </header>
  );
}
