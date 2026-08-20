import { useEffect, useState } from 'react';
import App from './App.jsx';
import AdminApp from './admin/AdminApp.jsx';
import LegalPage from './components/LegalPage.jsx';
import UserDashboard from './dashboard/UserDashboard.jsx';
import AdvisorDashboard from './dashboard/AdvisorDashboard.jsx';
import { ConfirmProvider } from './components/ConfirmProvider.jsx';

/* Tiny hash router: `/#admin` renders the admin portal, `#terms` / `#privacy`
   render the legal pages, everything else the marketing site. Hash routing needs
   no server/Vercel rewrite config. */
function useHashRoute() {
  // Strip the leading '#'/'#/' and any trailing '/' so '#dashboard/' still routes.
  const read = () => window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  const [hash, setHash] = useState(read);
  useEffect(() => {
    const on = () => setHash(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

function Route({ hash }) {
  if (hash === 'admin' || hash.startsWith('admin/')) return <AdminApp />;
  if (hash === 'terms') return <LegalPage doc="terms" />;
  if (hash === 'privacy') return <LegalPage doc="privacy" />;
  if (hash === 'disclaimer') return <LegalPage doc="disclaimer" />;
  if (hash === 'dashboard') return <UserDashboard />;
  if (hash === 'advisor' || hash.startsWith('advisor/')) return <AdvisorDashboard />;
  return <App />;
}

export default function Root() {
  const hash = useHashRoute();
  return (
    <ConfirmProvider>
      <Route hash={hash} />
    </ConfirmProvider>
  );
}
