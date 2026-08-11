import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import WorksProducts from './components/WorksProducts.jsx';
import SegmentsWhy from './components/SegmentsWhy.jsx';
import EfficiencyChecks from './components/EfficiencyChecks.jsx';
import TrustedFounding from './components/TrustedFounding.jsx';
import JourneyModal from './components/JourneyModal.jsx';
import AuthModal from './components/AuthModal.jsx';
import CompleteProfileModal from './components/CompleteProfileModal.jsx';
import ResetPasswordModal from './components/ResetPasswordModal.jsx';
import AdvisorModal from './components/AdvisorModal.jsx';
import NeedHelp from './components/NeedHelp.jsx';
import {
  RealSavings,
  FAQ,
  FinalCTA,
  Footer,
} from './components/Sections.jsx';

// Where a not-logged-in user was when we sent them to sign in, so we can bring
// them back to the exact journey screen after auth — even when sign-up (email
// confirmation) or Google OAuth reloads the page. Kept in localStorage (survives
// a new tab / reload), with a freshness window so a stale intent can't reopen
// the modal on some unrelated future login.
const AFTER_AUTH_KEY = 'bb_after_auth';
const AFTER_AUTH_TTL = 30 * 60 * 1000; // 30 min
const readAfterAuth = () => {
  try {
    const d = JSON.parse(localStorage.getItem(AFTER_AUTH_KEY) || 'null');
    if (!d || typeof d.at !== 'number' || Date.now() - d.at > AFTER_AUTH_TTL) { localStorage.removeItem(AFTER_AUTH_KEY); return null; }
    return d;
  } catch { return null; }
};
const clearAfterAuth = () => { try { localStorage.removeItem(AFTER_AUTH_KEY); } catch { /* ignore */ } };

export default function App() {
  const { user } = useAuth();
  const [tiersOpen, setTiersOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [resume, setResume] = useState(null); // set when returning from Stripe Checkout / after auth
  const [authOpen, setAuthOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [calcSelection, setCalcSelection] = useState(null);

  // Returning from Stripe Checkout (?checkout=success|cancel): restore the stashed
  // journey context and reopen the modal to the scheduler.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const checkout = p.get('checkout');
    if (!checkout) return;
    let stash = null;
    try { stash = JSON.parse(sessionStorage.getItem('bb_journey') || 'null'); } catch { /* ignore */ }
    sessionStorage.removeItem('bb_journey');
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    setContext(stash?.context || null);
    setResume({
      tier: p.get('tier') || stash?.tier || 'call',
      sessionId: p.get('session_id') || null,
      expert: stash?.expert || null,
      canceled: checkout === 'cancel',
    });
    setTiersOpen(true);
  }, []);

  const scrollToCalc = useCallback(() => {
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // A "Compare Now" card: select that product in the calculator, then scroll to it.
  // A fresh object each call so re-clicking the same product still re-applies.
  const handleCompare = useCallback((sel) => {
    setCalcSelection({ ...sel });
    scrollToCalc();
  }, [scrollToCalc]);

  const openTiers = useCallback((ctx) => {
    setContext(ctx || null);
    setTiersOpen(true);
  }, []);
  const closeTiers = useCallback(() => { setTiersOpen(false); setResume(null); }, []);

  // Open the auth modal. If a `resumeIntent` is given (e.g. from inside the
  // journey), stash it so we can return the user to that exact screen post-auth.
  const requireAuth = useCallback((resumeIntent) => {
    if (resumeIntent && resumeIntent.kind === 'journey') {
      try { localStorage.setItem(AFTER_AUTH_KEY, JSON.stringify({ at: Date.now(), ...resumeIntent })); } catch { /* ignore */ }
    }
    setAuthOpen(true);
  }, []);
  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  // Once the user is authenticated (in-session sign-in, or after an email-confirm
  // / OAuth reload), reopen the journey exactly where they left off.
  useEffect(() => {
    if (!user) return;
    const intent = readAfterAuth();
    if (!intent || intent.kind !== 'journey') return;
    clearAfterAuth();
    setAuthOpen(false);
    setContext(intent.context || null);
    setResume({ afterAuth: true, view: intent.view || 'options', expert: intent.expert || null });
    setTiersOpen(true);
  }, [user]);

  const openAdvisor = useCallback(() => setAdvisorOpen(true), []);
  const closeAdvisor = useCallback(() => setAdvisorOpen(false), []);

  return (
    <>
      <Navbar onGetStarted={scrollToCalc} onSignIn={openAuth} />
      <main>
        <Hero onDetailedFeedback={openTiers} onStart={scrollToCalc} calcSelection={calcSelection} onRequireAuth={requireAuth} />
        <WorksProducts onGetStarted={scrollToCalc} onCompare={handleCompare} />
        <RealSavings />
        <SegmentsWhy onGetStarted={scrollToCalc} onCompare={handleCompare} />
        <EfficiencyChecks />
        <TrustedFounding onBecomeMember={openAdvisor} />
        <FinalCTA onGetStarted={scrollToCalc} onConnect={() => openTiers()} />
        <FAQ />
      </main>
      <Footer />
      <JourneyModal open={tiersOpen} onClose={closeTiers} context={context} onRequireAuth={requireAuth} resume={resume} />
      <AuthModal open={authOpen} onClose={closeAuth} />
      <CompleteProfileModal />
      <ResetPasswordModal />
      <AdvisorModal open={advisorOpen} onClose={closeAdvisor} />
      <NeedHelp />
    </>
  );
}
