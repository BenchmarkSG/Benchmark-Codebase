import { useState } from 'react';
import './dashboard.css';
import { useAuth } from '../context/AuthContext.jsx';
import AuthModal from '../components/AuthModal.jsx';

function initials(user) {
  const name = user?.user_metadata?.full_name || user?.email || '';
  const parts = name.replace(/@.*/, '').split(/[.\s_-]+/).filter(Boolean);
  return (parts[0]?.[0] || '?').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

/* Shared chrome + auth gate for both dashboards. Renders children only when a
   user is signed in; otherwise shows a sign-in prompt (reusing AuthModal). */
export default function DashboardLayout({ title, eyebrow, tabs, activeTab, onTab, children }) {
  const { configured, loading, user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <div className="dash">
      <header className="dash__top">
        <div className="dash__top-inner">
          <a className="dash__brand" href="#top">Bank<span>Benchmark</span>.sg</a>
          <div className="dash__top-right">
            {user ? (
              <>
                <span className="dash__avatar" aria-hidden="true">{initials(user)}</span>
                <span className="dash__who">{user.user_metadata?.full_name || user.email}</span>
                <button className="dash__signout" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <a className="dash__homelink" href="#top">← Home</a>
            )}
          </div>
        </div>
      </header>

      {!user ? (
        <div className="dash__gate">
          <div className="dash__gate-card">
            <div className="dash__gate-icon">🔒</div>
            <h1>Sign in to view your dashboard</h1>
            <p>
              {configured
                ? 'Your saved benchmarks, savings and next steps live here.'
                : 'Sign-in isn’t configured yet — add your Supabase keys to enable dashboards.'}
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
