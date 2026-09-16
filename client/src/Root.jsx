import { useEffect, useState } from 'react';
import App from './App.jsx';
import AdminApp from './admin/AdminApp.jsx';
import SupportApp from './support/SupportApp.jsx';
import LegalPage from './components/LegalPage.jsx';
import UserDashboard from './dashboard/UserDashboard.jsx';
import AdvisorDashboard from './dashboard/AdvisorDashboard.jsx';
import { ConfirmProvider } from './components/ConfirmProvider.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';

/* Tiny hash router: `/#admin` renders the admin portal, `#support` the
   customer-support portal, `#terms` / `#privacy` render the legal pages,
   everything else the marketing site. Hash routing needs no server/Vercel
   rewrite config. */
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
  if (hash === 'support' || hash.startsWith('support/')) return <SupportApp />;
  if (hash === 'terms') return <LegalPage doc="terms" />;
  if (hash === 'privacy') return <LegalPage doc="privacy" />;
  if (hash === 'disclaimer') return <LegalPage doc="disclaimer" />;
  if (hash === 'dashboard') return <UserDashboard />;
  if (hash === 'advisor' || hash.startsWith('advisor/')) return <AdvisorDashboard />;
  return <App />;
}

export default function Root() {
  const hash = useHashRoute();

  // A leftover `?journey=1` means the tab was reloaded while the journey overlay
  // was open (the overlay pushes that marker so Back dismisses it). The overlay
  // isn't open now, so strip the param — otherwise the URL advertises a screen
  // it can't restore, and the next open would find the marker already set.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('journey')) return;
    params.delete('journey');
    const query = params.toString();
    const { pathname, hash: frag } = window.location;
    window.history.replaceState({}, '', `${pathname}${query ? `?${query}` : ''}${frag}`);
  }, []);

  return (
    <ConfirmProvider>
      <Route hash={hash} />
      {/* Outside <Route> so it survives navigation, and outside .dash so the
          dashboard's dark tokens can't reach it. */}
      <UpdatePrompt />
    </ConfirmProvider>
  );
}
