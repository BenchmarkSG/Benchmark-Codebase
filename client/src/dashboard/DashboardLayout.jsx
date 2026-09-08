import { useState } from 'react';
import './dashboard.css';
import { useAuth } from '../context/AuthContext.jsx';
import AuthModal from '../components/AuthModal.jsx';
import { Avatar } from '../components/DefaultAvatar.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { ThemeIcon } from '../components/ThemeToggle.jsx';

// Sun / moon, inline so the toggle needs no icon dependency.
/* Shared chrome + auth gate for both dashboards. Renders children only when a
   user is signed in; otherwise shows a sign-in prompt (reusing AuthModal). */
export default function DashboardLayout({ title, eyebrow, tabs, activeTab, onTab, children }) {
  const { configured, loading, user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <div className="dash" data-theme={theme}>
      <header className="dash__top">
        <div className="dash__top-inner">
          <a className="dash__brand" href="#top"><span>Fee</span>Optima</a>
          <div className="dash__top-right">
            <button
              type="button" className="dash__theme" onClick={toggle}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-pressed={theme === 'dark'}
            >
              <ThemeIcon dark={theme === 'dark'} />
            </button>
            {user ? (
              <>
                <Avatar url={user.user_metadata?.avatar_url} className="dash__avatar dash__avatar--img" />
                <span className="dash__who">{user.user_metadata?.full_name || user.email}</span>
                <button className="dash__signout" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <a className="dash__homelink" href="#top">← Home</a>
            )}
          </div>
        </div>
      </header>

      {!user && loading ? (
        /* Session still resolving — don't flash the sign-in gate at signed-in users. */
        <div className="dash__gate">
          <div className="dash__gate-card">
            <div className="dash__gate-icon">⏳</div>
            <h1>Loading your dashboard…</h1>
          </div>
        </div>
      ) : !user ? (
        <div className="dash__gate">
          <div className="dash__gate-card">
            <div className="dash__gate-icon">🔒</div>
            <h1>Sign in to view your dashboard</h1>
            <p>
              {configured
                ? 'Your saved benchmarks, savings and next steps live here.'
                : 'Sign-in is temporarily unavailable. Please try again later.'}
            </p>
            {configured && !loading && (
              <button className="btn btn--primary" onClick={() => setAuthOpen(true)}>Sign in</button>
            )}
            <a className="dash__gate-back" href="#top">← Back to home</a>
          </div>
          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
        </div>
      ) : (
        <main className="dash__main">
          <div className="dash__head">
            {eyebrow && <span className="dash__eyebrow">{eyebrow}</span>}
            <h1 className="dash__title">{title}</h1>
          </div>

          {tabs?.length > 0 && (
            <div className="dash__tabs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={`dash__tab ${activeTab === t.key ? 'is-active' : ''}`}
                  onClick={() => onTab(t.key)}
                >
                  {t.label}{t.count != null && <span className="dash__tab-count">{t.count}</span>}
                </button>
              ))}
            </div>
          )}

          {children}
        </main>
      )}
    </div>
  );
}
