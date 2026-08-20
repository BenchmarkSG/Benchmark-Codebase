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
import { supabase } from './lib/supabase.js';

// After-auth resume intents live in lib/afterAuth.js (shared with AuthModal,
// which clears a pending intent when the user dismisses sign-in without
// authenticating — so a stale intent can't reopen a pay screen later).
import { readAfterAuth, storeAfterAuth, clearAfterAuth } from './lib/afterAuth.js';

export default function App() {
  const { user, signInWithOtp } = useAuth();
  const [tiersOpen, setTiersOpen] = useState(false);
  const [context, setContext] = useState(null);
  const [resume, setResume] = useState(null); // set when returning from Stripe Checkout / after auth
  const [authOpen, setAuthOpen] = useState(false);
  const [advisorOpen, setAdvisorOpen] = useState(false);
  const [calcSelection, setCalcSelection] = useState(null);
  const [market, setMarket] = useState('SG'); // market picked in the calculator; drives the partner-logo marquee

  // A first-time reveal buyer has no account. Create it passwordlessly from the
  // name + email they entered (that email becomes their login), and defer saving
  // the revealed benchmark until they confirm the magic link — see the
  // 'reveal-complete' after-auth branch. Never re-charges.
  const provisionRevealAccount = useCallback((email, name, ctx) => {
    if (!email) return;
    signInWithOtp(email, { full_name: name }).catch(() => {});
    if (ctx?.saveRow) {
      const ctxForModal = { ...ctx };
      delete ctxForModal.saveRow; delete ctxForModal.email; delete ctxForModal.name;
      storeAfterAuth({ kind: 'reveal-complete', email, saveRow: ctx.saveRow, context: ctxForModal });
    }
  }, [signInWithOtp]);

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
    const tier = p.get('tier') || stash?.tier || 'call';
    // A canceled ~$1 reveal means NOTHING was bought — never open the modal (its
    // 'options' view shows the bank + certificate, i.e. the paid product).
    if (checkout === 'cancel' && tier === 'reveal') return;
    setContext(stash?.context || null);
    setResume({
      tier,
      sessionId: p.get('session_id') || null,
      expert: stash?.expert || null,
      canceled: checkout === 'cancel',
    });
    setTiersOpen(true);

    // A first-time user just paid for the reveal via the inline name/email — they
    // have no account yet. Create it passwordlessly (that email becomes their
    // login) and, once they confirm the magic link, persist the revealed
    // benchmark to their dashboard. This never re-charges.
    if (checkout === 'success' && tier === 'reveal' && stash?.lead?.email) {
      (async () => {
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session) return; // already signed in — nothing to provision
          provisionRevealAccount(stash.lead.email, stash.lead.name, stash.context);
        } catch { /* ignore */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (resumeIntent && (resumeIntent.kind === 'journey' || resumeIntent.kind === 'save')) {
      storeAfterAuth(resumeIntent);
    }
    setAuthOpen(true);
  }, []);
  const openAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);

  // The ~$1 reveal — NO sign-in screen. The name + email are captured inline on
  // the result screen; that email is what we bill and what becomes the user's
  // account/login (created passwordlessly on the way back from Stripe). We charge
  // in the user's market currency (FX-localized, priced server-side). If Stripe
  // isn't configured, fall back to a demo reveal so the flow still works.
  const revealBank = useCallback(async (ctx) => {
    const ready = ctx || {};
    const email = (ready.email || user?.email || '').trim();
    const name = (ready.name || user?.user_metadata?.full_name || '').trim();
    if (!email) return; // the calculator validates first; guard anyway.

    // Signed-in users: persist immediately so the reveal lands in their dashboard.
    // First-time users have no session yet (writes are RLS-scoped to their own
    // row), so we defer the save until their new account is confirmed — see the
    // Stripe-return handler below. Reuse an already-saved row when present.
    let saved = ready;
    if (user && !saved.benchmarkId && saved.saveRow) {
      try { const row = await saveBenchmark(saved.saveRow); saved = { ...saved, benchmarkId: row?.id }; }
      catch { /* proceed without persistence */ }
    }
    try {
      sessionStorage.setItem('bb_journey', JSON.stringify({ tier: 'reveal', context: saved, lead: { email, name } }));
      const { url } = await createCheckout({
        tier: 'reveal',
        currency: saved.currency || 'SGD',
        product: saved.product || null,
        segment: saved.segment || 'individual',
        email,
      });
      if (!isStripeCheckoutUrl(url)) throw new Error('Unexpected checkout URL');
      window.location.assign(url);
    } catch (err) {
      sessionStorage.removeItem('bb_journey');
      // Only fall back to the free demo reveal when Stripe genuinely isn't
      // configured (the server 503s with this exact message). Any OTHER failure
      // — network blip, server error — must NOT give the paid product away:
      // rethrow so the result screen shows a retry error instead.
      if (!/not configured/i.test(err?.message || '')) throw err;
      if (!user) provisionRevealAccount(email, name, saved);
      if (saved.benchmarkId) updateBenchmark(saved.benchmarkId, { stage: 'revealed' }).catch(() => {});
      setContext(saved);
      setResume({ tier: 'reveal', demo: true });
      setTiersOpen(true);
    }
  }, [user, provisionRevealAccount]);

  // Once the user is authenticated (in-session sign-in, or after an email-confirm
  // / OAuth reload), reopen the journey exactly where they left off.
  useEffect(() => {
    if (!user) return;
    const intent = readAfterAuth();
    if (!intent) return;
    // Confirmed the account we created during a reveal payment → persist the
    // benchmark (as revealed) and reopen the certificate + options. No payment.
    // Bound to the buyer: if a DIFFERENT account signs in on this browser within
    // the TTL, do nothing (their dashboard must not receive someone else's row).
    if (intent.kind === 'reveal-complete') {
      if (intent.email && intent.email.toLowerCase() !== (user.email || '').toLowerCase()) return;
      clearAfterAuth();
      setAuthOpen(false);
      if (intent.saveRow) saveBenchmark({ ...intent.saveRow, stage: 'revealed' }).catch(() => {});
      setContext(intent.context || null);
      setResume({ afterAuth: true, tier: 'reveal', view: 'options' });
      setTiersOpen(true);
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
  }, [user]);

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
