import { useCallback, useEffect, useRef, useState } from 'react';
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
import { createCheckout, revealBestBank } from './api.js';
import { isStripeCheckoutUrl } from './lib/safeUrl.js';
import { saveBenchmark, updateBenchmark, findPaidBenchmarkId } from './lib/dashboardApi.js';
import { readCheckoutReturn, stashJourney, clearJourney, goToPage } from './lib/checkoutReturn.js';
import { recoverPaidContext } from './lib/journeyContext.js';
import {
  markUnlocked, unlockedTierFor,
  rememberRevealSession, revealSessionFor, forgetRevealSession, revealPayload,
} from './lib/unlocks.js';
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
  const [market, setMarket] = useState('SG'); // market picked in the calculator; drives the partner-logo marquee + the products grid

  // Returning from Stripe Checkout (?checkout=success|cancel): restore the stashed
  // journey context and reopen the modal to the scheduler.
  const checkoutHandled = useRef(false);
  useEffect(() => {
    // StrictMode runs effects twice in dev. This one consumes the URL and the
    // stash, so it must happen exactly once - and it must NOT be undone by a
    // cleanup, which would cancel the reveal fetch it kicks off.
    if (checkoutHandled.current) return;
    checkoutHandled.current = true;
    const r = readCheckoutReturn('home');
    if (!r) return;
    // Paid from the dashboard: Stripe always returns to the bare origin, so send
    // them back to the page they started on and let it finish the resume.
    if (r.redirectTo) { goToPage(r.redirectTo); return; }
    // A canceled ~$1 reveal means NOTHING was bought — never open the modal (its
    // 'options' view shows the bank + certificate, i.e. the paid product).
    if (r.canceled && r.tier === 'reveal') return;
    setContext(r.context);
    setResume(r.resume);
    setTiersOpen(true);

    if (!(r.tier === 'reveal' && !r.canceled && r.sessionId)) return;

    (async () => {
      // The stash lives in ONE tab's sessionStorage, and a mobile 3-D Secure or
      // banking-app hop can land the return in a fresh one. Rebuild from the
      // server before anything else: the reveal below is asked per country +
      // product, so without this it can't even be asked — and the buyer would
      // sit on "we couldn't restore your benchmark" having just paid.
      let ctx = r.context;
      if (!ctx) {
        ctx = await recoverPaidContext(r.sessionId);
        if (ctx) setContext(ctx);
      }

      // A paid reveal. Two things the old flow never had to do, because the bank's
      // name used to arrive free with the benchmark:
      //   1. keep the session id in THIS BROWSER, durably, so coming back later
      //      re-unlocks instead of charging again;
      //   2. actually fetch the name, which now only the server can hand over.
      rememberRevealSession(ctx, r.sessionId);
      try {
        const { bestBank } = await revealBestBank({
          ...revealPayload(ctx),
          sessionId: r.sessionId,
        });
        if (!bestBank) return;
        setContext((c) => (c ? { ...c, bestBank } : c));
        // A signed-in buyer's row was saved BEFORE the name existed on the
        // client (the free benchmark no longer carries it), so write it back —
        // otherwise the dashboard shows a revealed benchmark with no bank on it.
        if (ctx?.benchmarkId) {
          updateBenchmark(ctx.benchmarkId, { best_bank: bestBank }).catch(() => {});
        }
      } catch { /* the modal copes with a missing name */ }
    })();
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

  /* Fetch the thing that was actually bought.

     The bank's name is no longer in the free benchmark response, so it has to be
     asked for — with proof. `sessionId` is a paid Stripe session; a signed-in
     owner is proved by the saved row's stage instead. If the call fails we still
     open the journey: everything else on that screen (certificate, the three
     options) is usable, and the name retries on the next open. */
  const openRevealed = useCallback(async (ctx, { sessionId = null, tier = 'reveal' } = {}) => {
    let full = ctx || {};
    try {
      // Neither proof to hand? A signed-in buyer who has claimed their purchase
      // and then recomputed the same benchmark holds no session id (it was
      // consumed) and no row id (a fresh result carries none) — so find the row
      // that records the purchase before giving up on the name.
      let benchmarkId = full.benchmarkId || undefined;
      if (!sessionId && !benchmarkId) {
        benchmarkId = (await findPaidBenchmarkId({ country: full.country, productId: full.productId })) || undefined;
        if (benchmarkId) full = { ...full, benchmarkId };
      }
      const { bestBank } = await revealBestBank({
        ...revealPayload(full),
        sessionId: sessionId || undefined,
        benchmarkId,
      }, await getAccessToken());
      if (bestBank) full = { ...full, bestBank };
    } catch { /* leave bestBank unset — the modal handles a missing name */ }
    setContext(full);
    setResume({ afterAuth: true, view: 'options', unlockedTier: tier });
    setTiersOpen(true);
    return full;
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

    // Already bought — reopen it instead of selling it again. Closing the modal
    // (or mis-clicking its ✕) must never cost a second payment.
    // This reopens through openRevealed rather than just re-showing what the
    // browser already has, because what the browser already has no longer
    // contains a bank. The free benchmark stopped carrying `bestBank` when the
    // paywall was closed — naming the winner IS the product — so the name now
    // exists only behind /api/reveal. Reopening without re-fetching it brought
    // the screen back with the three options and no bank, no logo and no rate,
    // which is what a buyer saw the second time they opened something they had
    // paid for. Proof is the Stripe session id (bought anonymously) or the saved
    // row (signed in); openRevealed sends whichever exists, and opens the screen
    // either way if neither is accepted.
    const owned = unlockedTierFor(ready);
    if (owned) {
      await openRevealed(ready, { sessionId: revealSessionFor(ready) || undefined, tier: owned });
      return;
    }

    // Bought anonymously, earlier. The Stripe session id outlives the tab, so a
    // returning payer re-unlocks for free instead of being charged again — the
    // server re-verifies that session with Stripe before it answers.
    const paidSession = revealSessionFor(ready);
    if (paidSession) { await openRevealed(ready, { sessionId: paidSession }); return; }

    // Persist first so the reveal lands in their dashboard; reuse an existing
    // row. Anonymous buyers have no row to write to (RLS) — they get one when
    // they claim the purchase with the magic link sent after payment.
    let saved = ready;
    if (user && !saved.benchmarkId && saved.saveRow) {
      try { const row = await saveBenchmark(saved.saveRow); saved = { ...saved, benchmarkId: row?.id }; }
      catch { /* proceed without persistence */ }
    }
    try {
      stashJourney({ tier: 'reveal', context: saved });
      const { url } = await createCheckout({
        tier: 'reveal',
        currency: saved.currency || 'SGD',
        product: saved.product || null,
        // Binds the session to one benchmark, so a paid session id can't be
        // replayed against another product or market (server/app.js).
        country: saved.country || 'SG',
        productId: saved.productId || null,
        segment: saved.segment || 'individual',
        email: user?.email,
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
        openRevealed(saved, { tier: 'reveal' });
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
  }, [user, openRevealed]);

  /* Attach a reveal that was bought without an account.

     Until this runs, the only proof of the purchase is a session id in one
     browser. Saving the benchmark and moving it to the 'revealed' stage makes it
     permanent and portable: the server will then serve the reveal to this user
     on any device, and refuse to sell it to them a second time. */
  const claimAnonymousReveal = useCallback(async (ctx) => {
    if (!ctx?.saveRow || ctx.benchmarkId) return;
    const sessionId = revealSessionFor(ctx);
    if (!sessionId) return;
    try {
      const row = await saveBenchmark({ ...ctx.saveRow, best_bank: ctx.bestBank ?? null });
      if (!row?.id) return;
      await updateBenchmark(row.id, { stage: 'revealed' });
      // The row is the durable record now; the local capability has done its job.
      forgetRevealSession(sessionId);
      setContext((c) => (c ? { ...c, benchmarkId: row.id } : c));
    } catch { /* keep the session id: it is still valid proof on its own */ }
  }, []);

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
    // They signed in from inside the journey — which is where an anonymous
    // reveal finally gets an account to belong to.
    claimAnonymousReveal(intent.context);
    setResume({ afterAuth: true, view: intent.view || 'options', expert: intent.expert || null });
    setTiersOpen(true);
  }, [user, revealBank, claimAnonymousReveal]);

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
      <Navbar onGetStarted={scrollToCalc} onSignIn={openAuth} market={market} onMarketChange={setMarket} />
      <main>
        <Hero onDetailedFeedback={openTiers} onReveal={revealBank} onStart={scrollToCalc} calcSelection={calcSelection} market={market} onMarketChange={setMarket} />
        <WorksProducts onGetStarted={scrollToCalc} onCompare={handleCompare} market={market} />
        <RealSavings market={market} />
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
