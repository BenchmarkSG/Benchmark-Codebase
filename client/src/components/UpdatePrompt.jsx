import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import './UpdatePrompt.css';

// Service-worker updates are OFFERED, never forced. The plugin's 'autoUpdate'
// mode reloads the page the moment a new deployment's worker activates, which
// can wipe whatever someone is in the middle of — the negotiation email draft
// in JourneyModal is the exposed one, since it lives only in component state.
// So we register in 'prompt' mode and let the user pick the moment.
//
// Long-lived tabs are the reason for the hourly poll: browsers only check for a
// new worker on navigation and roughly once a day, so a dashboard left open all
// week would otherwise never learn there's a fix waiting.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export default function UpdatePrompt() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [updateSW, setUpdateSW] = useState(null);

  useEffect(() => {
    let timer;
    const update = registerSW({
      onNeedRefresh() { setReady(true); },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        timer = setInterval(() => {
          // Skip while offline — update() would just throw and log noise.
          if (navigator.onLine === false) return;
          registration.update().catch(() => {});
        }, UPDATE_CHECK_MS);
      },
      onRegisterError() { /* no SW support, or blocked — the app runs regardless */ },
    });
    // Store the callable behind a function so useState doesn't invoke it.
    setUpdateSW(() => update);
    return () => clearInterval(timer);
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div className="swup" role="status" aria-live="polite">
      <div className="swup__text">
        <strong>A new version is available</strong>
        <span>Refresh to get the latest — anything you’re typing will be lost.</span>
      </div>
      <div className="swup__actions">
        <button type="button" className="swup__btn swup__btn--go" onClick={() => updateSW?.(true)}>
          Refresh
        </button>
        <button type="button" className="swup__btn" onClick={() => setDismissed(true)}>
          Later
        </button>
      </div>
    </div>
  );
}
