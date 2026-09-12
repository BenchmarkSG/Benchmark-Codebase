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
import PartnerBanks from './components/PartnerBanks.jsx';
import {
  RealSavings,
  FAQ,
  FinalCTA,
  Footer,
} from './components/Sections.jsx';
import { createCheckout } from './api.js';
import { isStripeCheckoutUrl } from './lib/safeUrl.js';
import { saveBenchmark, updateBenchmark } from './lib/dashboardApi.js';
import { readCheckoutReturn, stashJourney, clearJourney, goToPage } from './lib/checkoutReturn.js';
import { markUnlocked, unlockedTierFor } from './lib/unlocks.js';
import { getAccessToken } from './lib/supabase.js';

// After-auth resume intents live in lib/afterAuth.js (shared with AuthModal,
// which clears a pending intent when the user dismisses sign-in without
// authenticating — so a stale intent can't reopen a pay screen later).
import { readAfterAuth, storeAfterAuth, clearAfterAuth } from './lib/afterAuth.js';

export default function App() {
  const { user } = useAuth();
  const [tiersOpen, setTiersOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [resume, setResume] = useState(null); // set when returning from Stripe Checkout / after auth
  const [authOpen, setAuthOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [calcSelection, setCalcSelection] = useState(null);
  const [market, setMarket] = useState('SG'); // market picked in the calculator; drives the partner-logo marquee

  // Returning from Stripe Checkout (?checkout=success|cancel): restore the stashed
  // journey context and reopen the modal to the scheduler.
  useEffect(() => {
    const r = readCheckoutReturn('home');
    if (!r) return;
    // Paid from the dashboard: Stripe always returns to the bare origin, so send
    // them back to the page they started on and let it finish the resume.
    if (r.redirectTo) { goToPage(r.redirectTo); return; }
    // A canceled ~$1 reveal means NOTHING was bought — never open the modal (its
    // 'options' view shows the bank + certificate, i.e. the paid product).
    if (r.canceled && r.tier === 'reveal') return;
    setContext(r.context);
    setResume({ tier: r.tier, sessionId: r.sessionId, expert: r.expert, canceled: r.canceled });
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

  // Reopen something already paid for, in read/manage mode — the same route the
  // dashboard uses for an unlocked row, so no tier is offered for sale again.
  const reopenUnlocked = useCallback((ctx, tier) => {
    setContext(ctx);
    setResume({ afterAuth: true, view: 'options', unlockedTier: tier });
    setTiersOpen(true);
  }, []);

  // Open the auth modal. If a `resumeIntent` is given (e.g. from inside the
  // journey), stash it so we can return the user to that exact screen post-auth.
  const requireAuth = useCallback((resumeIntent) => {
    if (resumeIntent && ['journey', 'save', 'reveal'].includes(resumeIntent.kind)) {
      storeAfterAuth(resumeIntent);
    }
    setAuthOpen(true);
  }, []);
  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  // The ~$1 reveal. SIGN IN FIRST: an account is what the purchase, the saved
  // benchmark and the dashboard all hang off, so we never take money without one.
  // The result is stashed (see the calculator's RESTORE_KEY) and the intent is
  // recorded, so after signing in — even through an OAuth/email-confirm page
  // reload — the user lands straight on payment with their numbers intact.
  // Priced in the user's market currency (FX-localized, server-side).
  const revealBank = useCallback(async (ctx) => {
    const ready = ctx || {};
    if (!user) { requireAuth({ kind: 'reveal', context: ready }); return; }

    // Already bought — reopen it instead of selling it again. Closing the modal
    // (or mis-clicking its ✕) must never cost a second payment.
    const owned = unlockedTierFor(ready);
    if (owned) { reopenUnlocked(ready, owned); return; }

    // Persist first so the reveal lands in their dashboard; reuse an existing row.
    let saved = ready;
    if (!saved.benchmarkId && saved.saveRow) {
      try { const row = await saveBenchmark(saved.saveRow); saved = { ...saved, benchmarkId: row?.id }; }
      catch { /* proceed without persistence */ }
    }
    try {
      stashJourney({ tier: 'reveal', context: saved });
      const { url } = await createCheckout({
        tier: 'reveal',
        currency: saved.currency || 'SGD',
        product: saved.product || null,
        segment: saved.segment || 'individual',
        email: user.email,
        // Lets the server refuse a reveal this benchmark already has.
        benchmarkId: saved.benchmarkId || undefined,
      }, await getAccessToken());
      if (!isStripeCheckoutUrl(url)) throw new Error('Unexpected checkout URL');
      window.location.assign(url);
    } catch (err) {
      clearJourney();
      // The server refuses to sell a reveal twice. That's not an error to show —
      // they own it, so record it locally and open what they paid for.
      if (err?.code === 'already_purchased') {
        markUnlocked(saved, 'reveal');
        reopenUnlocked(saved, 'reveal');
        return;
      }
      // Only fall back to the free demo reveal when Stripe genuinely isn't
      // configured (the server 503s with this exact message). Any OTHER failure
      // — network blip, server error — must NOT give the paid product away:
      // rethrow so the result screen shows a retry error instead.
      if (!/not configured/i.test(err?.message || '')) throw err;
      if (saved.benchmarkId) updateBenchmark(saved.benchmarkId, { stage: 'revealed' }).catch(() => {});
      markUnlocked(saved, 'reveal');
      setContext(saved);
      setResume({ tier: 'reveal', demo: true });
      setTiersOpen(true);
    }
  }, [user, requireAuth, reopenUnlocked]);

  // Once the user is authenticated (in-session sign-in, or after an email-confirm
  // / OAuth reload), reopen the journey exactly where they left off.
  useEffect(() => {
    if (!user) return;
    const intent = readAfterAuth();
    if (!intent) return;
    // Signed in specifically to reveal → carry straight on to the ~$1 checkout,
    // using the benchmark they'd already computed. Nothing to re-enter.
    if (intent.kind === 'reveal') {
      clearAfterAuth();
      setAuthOpen(false);
      revealBank(intent.context || null);
      return;
    }
    // Signed in from "Save to my dashboard" → persist the benchmark they computed.
    if (intent.kind === 'save') {
      clearAfterAuth();
      setAuthOpen(false);
      if (intent.saveRow) saveBenchmark(intent.saveRow).catch(() => {});
      return;
    }
    if (intent.kind !== 'journey') return;
    clearAfterAuth();
    setAuthOpen(false);
    setContext(intent.context || null);
    setResume({ afterAuth: true, view: intent.view || 'options', expert: intent.expert || null });
    setTiersOpen(true);
  }, [user, revealBank]);

  // In-page section anchors (#how, #products, #calculator, …) don't scroll when
  // the browser navigates from another hash route (the fragment scroll fires
  // before React mounts the landing page) — so do it ourselves, on load and on
  // every hashchange. Unknown ids (routes, Supabase auth tokens) just no-op.
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (!id || !/^[a-z][a-z-]*$/.test(id)) return;
      const el = document.getElementById(id);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, []);

  const openAdvisor = useCallback(() => setAdvisorOpen(true), []);
  const closeAdvisor = useCallback(() => setAdvisorOpen(false), []);

  return (
    <>
      <Navbar onGetStarted={scrollToCalc} onSignIn={openAuth} />
      <main>
        <Hero onDetailedFeedback={openTiers} onReveal={revealBank} onStart={scrollToCalc} calcSelection={calcSelection} onRequireAuth={requireAuth} onMarketChange={setMarket} />
        <WorksProducts onGetStarted={scrollToCalc} onCompare={handleCompare} />
        <RealSavings />
        <SegmentsWhy onGetStarted={scrollToCalc} onCompare={handleCompare} />
        <PartnerBanks market={market} />
        <EfficiencyChecks />
        <TrustedFounding onBecomeMember={openAdvisor} />
        <FinalCTA onGetStarted={scrollToCalc} />
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
