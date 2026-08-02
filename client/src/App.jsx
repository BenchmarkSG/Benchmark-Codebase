import { useCallback, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import WorksProducts from './components/WorksProducts.jsx';
import SegmentsWhy from './components/SegmentsWhy.jsx';
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
  const [authOpen, setAuthOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);

  const scrollToCalc = useCallback(() => {
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const openTiers = useCallback((ctx) => {
    setContext(ctx || null);
    setTiersOpen(true);
  }, []);
  const closeTiers = useCallback(() => setTiersOpen(false), []);

  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const openAdvisor = useCallback(() => setAdvisorOpen(true), []);
  const closeAdvisor = useCallback(() => setAdvisorOpen(false), []);

  return (
    <>
      <Navbar onGetStarted={scrollToCalc} onSignIn={openAuth} />
      <main>
        <Hero onDetailedFeedback={openTiers} onStart={scrollToCalc} />
        <WorksProducts onGetStarted={scrollToCalc} />
        <RealSavings />
        <SegmentsWhy onGetStarted={scrollToCalc} />
        <TrustedFounding onBecomeMember={openAdvisor} />
        <FinalCTA onGetStarted={scrollToCalc} onConnect={() => openTiers()} />
        <FAQ />
      </main>
      <Footer />
      <JourneyModal open={tiersOpen} onClose={closeTiers} context={context} />
      <AuthModal open={authOpen} onClose={closeAuth} />
      <CompleteProfileModal />
      <ResetPasswordModal />
      <AdvisorModal open={advisorOpen} onClose={closeAdvisor} />
    </>
  );
}
