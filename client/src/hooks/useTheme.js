import { useCallback, useEffect, useState } from 'react';

// Site-wide light/dark.
//
// The resolved theme is written to <html data-theme>, so it reaches every
// surface — modals, portals, and the canvas beyond the page — and the token
// layer in styles/global.css does the rest. It used to live on the .dash
// element because dark mode was dashboard-only; anything still keyed to
// `.dash[data-theme]` keeps working, since DashboardLayout sets both.
//
// index.html resolves and applies the same value BEFORE first paint. Without
// that, React mounts after the browser has already painted and a dark-mode user
// gets a white flash on every load — so if you change the resolution order
// here, change it there too.
const KEY = 'bb_theme';
const LEGACY_KEY = 'bb_dash_theme'; // dark mode was dashboard-only until now

// Kept in step with index.html's <meta name="theme-color"> and the --bg dark
// token. Hardcoded rather than read back off the meta tag: after the first
// change the tag holds OUR value, so reading it to find "the original" would
// latch the dark colour in permanently.
const LIGHT_THEME_COLOR = '#1d63c4';
const DARK_THEME_COLOR = '#0d1523';

const systemPrefersDark = () => {
  try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false; }
  catch { return false; }
};

const readStored = () => {
  try {
    const v = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch { return null; } // Safari private mode throws on access
};

export function useTheme() {
  // Resolved once on mount so the first render already matches what the
  // pre-paint script put on <html>.
  const [theme, setTheme] = useState(() => readStored() || (systemPrefersDark() ? 'dark' : 'light'));
  const [pinned, setPinned] = useState(() => readStored() !== null);

  // Follow the OS while the user hasn't made an explicit choice. Once they hit
  // the toggle, their pick wins and we stop listening.
  useEffect(() => {
    if (pinned) return undefined;
    let mq;
    try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return undefined; }
    const on = (e) => setTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [pinned]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Installed as a PWA, the OS status/title bar follows this. Brand blue over
    // a dark page reads as a rendering bug.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
      return next;
    });
    setPinned(true);
  }, []);

  return { theme, toggle };
}
