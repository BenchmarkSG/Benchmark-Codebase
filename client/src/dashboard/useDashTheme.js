import { useCallback, useEffect, useState } from 'react';

// Light/dark for the dashboard shell only. The theme is applied as a data-theme
// attribute on the .dash element rather than on <html>, and the dashboard CSS
// swaps its OWN token layer (--d-*) rather than the global palette. That's
// deliberate: JourneyModal renders inside .dash but keeps its own light design,
// and inherited dark tokens would leave it with pale text on white cards.
const KEY = 'bb_dash_theme';

// Kept in step with index.html's <meta name="theme-color"> and the --d-bg dark
// token. Hardcoded rather than read back off the meta tag: after the first
// change the tag holds OUR value, so reading it to find "the original" would
// latch the dark colour in permanently.
const SITE_THEME_COLOR = '#1d63c4';
const DARK_THEME_COLOR = '#0d1523';

const systemPrefersDark = () => {
  try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false; }
  catch { return false; }
};

const readStored = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch { return null; } // Safari private mode throws on access
};

export function useDashTheme() {
  // Resolved once on mount so the first paint is already correct.
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

  // Installed as a PWA, the OS status/title bar follows <meta name="theme-color">.
  // Brand blue above a dark dashboard reads as a rendering bug, so track the page
  // while this is mounted and hand the colour back when the user leaves.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return undefined;
    meta.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : SITE_THEME_COLOR);
    return () => meta.setAttribute('content', SITE_THEME_COLOR);
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
