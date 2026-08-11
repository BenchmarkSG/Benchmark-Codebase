import { useCallback, useEffect, useState } from 'react';
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
import {
  RealSavings,
  FAQ,
  FinalCTA,
  Footer,
} from './components/Sections.jsx';

export default function App() {
  const [tiersOpen, setTiersOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [resume, setResume] = useState(null); // set when returning from Stripe Checkout
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

  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const openAdvisor = useCallback(() => setAdvisorOpen(true), []);
  const closeAdvisor = useCallback(() => setAdvisorOpen(false), []);

  return (
    <>
      <Navbar onGetStarted={scrollToCalc} onSignIn={openAuth} />
      <main>
        <Hero onDetailedFeedback={openTiers} onStart={scrollToCalc} calcSelection={calcSelection} onRequireAuth={openAuth} />
        <WorksProducts onGetStarted={scrollToCalc} onCompare={handleCompare} />
        <RealSavings />
        <SegmentsWhy onGetStarted={scrollToCalc} onCompare={handleCompare} />
        <EfficiencyChecks />
        <TrustedFounding onBecomeMember={openAdvisor} />
        <FinalCTA onGetStarted={scrollToCalc} onConnect={() => openTiers()} />
        <FAQ />
      </main>
      <Footer />
      <JourneyModal open={tiersOpen} onClose={closeTiers} context={context} onRequireAuth={openAuth} resume={resume} />
      <AuthModal open={authOpen} onClose={closeAuth} />
      <CompleteProfileModal />
      <ResetPasswordModal />
      <AdvisorModal open={advisorOpen} onClose={closeAdvisor} />
    </>
  );
}
