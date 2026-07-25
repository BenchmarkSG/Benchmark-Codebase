import { useCallback, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import WorksProducts from './components/WorksProducts.jsx';
import SegmentsWhy from './components/SegmentsWhy.jsx';
import TrustedFounding from './components/TrustedFounding.jsx';
import JourneyModal from './components/JourneyModal.jsx';
import {
  RealSavings,
  FinalCTA,
  Footer,
} from './components/Sections.jsx';

export default function App() {
  const [tiersOpen, setTiersOpen] = useState(false);
  const [context, setContext] = useState(null);

  const scrollToCalc = useCallback(() => {
    document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const openTiers = useCallback((ctx) => {
    setContext(ctx || null);
    setTiersOpen(true);
  }, []);
  const closeTiers = useCallback(() => setTiersOpen(false), []);

  return (
    <>
      <Navbar onGetStarted={scrollToCalc} />
      <main>
        <Hero onDetailedFeedback={openTiers} onStart={scrollToCalc} />
        <WorksProducts onGetStarted={scrollToCalc} />
        <RealSavings />
        <SegmentsWhy onGetStarted={scrollToCalc} onConnect={() => openTiers()} />
        <TrustedFounding onGetStarted={() => openTiers({ segment: 'sme' })} />
        <FinalCTA onGetStarted={scrollToCalc} />
      </main>
      <Footer />
      <JourneyModal open={tiersOpen} onClose={closeTiers} context={context} />
    </>
  );
}
