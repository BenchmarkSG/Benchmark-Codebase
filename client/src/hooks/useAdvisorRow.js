import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getMyAdvisor } from '../lib/dashboardApi.js';
import { isSupabaseConfigured } from '../lib/supabase.js';

/* The signed-in user's advisor application row (or null if they aren't an
   advisor). Drives advisor-dashboard access and the "Advisor" nav entry. */
export function useAdvisorRow() {
  const { user } = useAuth();
  const [advisor, setAdvisor] = useState(null);
  const [loading, setLoading] = useState(Boolean(user?.email) && isSupabaseConfigured);

  const refresh = useCallback(async () => {
    if (!user?.email || !isSupabaseConfigured) {
      setAdvisor(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setAdvisor(await getMyAdvisor(user.email));
    } catch {
      setAdvisor(null);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => { refresh(); }, [refresh]);

  return { advisor, loading, refresh };
}
