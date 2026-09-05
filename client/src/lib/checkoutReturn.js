// Stripe returns everyone to the bare origin — success_url is `${base}/?checkout=…`
// with no hash — so the page someone paid FROM is lost unless we carry it
// ourselves. Without this, paying from the dashboard dropped the user on the
// landing page, where the calculator's own restore then repopulated whatever
// benchmark they'd last computed there. Confusing, and the wrong page entirely.
//
// The originating page is recorded in the `bb_journey` stash on the way out and
// read back here. Only a page id is stored, never a URL: the redirect target is
// always derived locally from a fixed set, so a tampered stash can't turn this
// into an open redirect.

// Which top-level page a hash resolves to. Mirrors the router in Root.jsx.
export function pageOf(hash = (typeof window !== 'undefined' ? window.location.hash : '')) {
  const h = (hash || '').replace(/^#\/?/, '').replace(/\/+$/, '');
  if (h === 'dashboard') return 'dashboard';
  if (h === 'advisor' || h.startsWith('advisor/')) return 'advisor';
  if (h === 'admin' || h.startsWith('admin/')) return 'admin';
  return 'home';                     // section anchors (#calculator, #how, …)
}

const HASH_FOR = { home: '', dashboard: '#dashboard', advisor: '#advisor', admin: '#admin' };

export const STASH_KEY = 'bb_journey';

// Record where a checkout was started from, alongside whatever the caller needs
// on the way back.
export function stashJourney(data) {
  try { sessionStorage.setItem(STASH_KEY, JSON.stringify({ ...data, page: pageOf() })); }
  catch { /* private mode — the return just won't restore context */ }
}

export const clearJourney = () => {
  try { sessionStorage.removeItem(STASH_KEY); } catch { /* ignore */ }
};

/**
 * Read a Stripe return, if this page is the one that should handle it.
 *
 *   null                     — not a checkout return
 *   { redirectTo: 'dashboard' } — someone else's; send them there, consume nothing
 *   { tier, sessionId, … }   — ours: stash consumed, query params stripped
 */
export function readCheckoutReturn(page) {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const checkout = p.get('checkout');
  if (!checkout) return null;

  let stash = null;
  try { stash = JSON.parse(sessionStorage.getItem(STASH_KEY) || 'null'); } catch { /* ignore */ }

  // Started somewhere else — leave the stash and the query string alone so the
  // right page can finish the job once the router swaps to it.
  const from = HASH_FOR[stash?.page] !== undefined ? stash.page : 'home';
  if (from !== page) return { redirectTo: from };

  clearJourney();
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  return {
    tier: p.get('tier') || stash?.tier || 'call',
    sessionId: p.get('session_id') || null,
    expert: stash?.expert || null,
    context: stash?.context || null,
    canceled: checkout === 'cancel',
  };
}

// Only ever a hash on our own origin, from the fixed table above.
export function goToPage(page) {
  window.location.hash = HASH_FOR[page] ?? '';
}
