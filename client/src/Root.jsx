import { useEffect, useState } from 'react';
import App from './App.jsx';
import AdminApp from './admin/AdminApp.jsx';

/* Tiny hash router: `/#admin` renders the admin portal, everything else the
   marketing site. Hash routing needs no server/Vercel rewrite config. */
function useIsAdminRoute() {
  const read = () => {
    const h = window.location.hash.replace(/^#\/?/, '');
    return h === 'admin' || h.startsWith('admin/');
  };
  const [isAdmin, setIsAdmin] = useState(read);
  useEffect(() => {
    const on = () => setIsAdmin(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return isAdmin;
}

export default function Root() {
  return useIsAdminRoute() ? <AdminApp /> : <App />;
}
