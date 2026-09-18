# Payments (Stripe) & scheduling (Calendly)

The [JourneyModal](client/src/components/JourneyModal.jsx) "act on your benchmark"
flow has three tiers: **Free** (negotiation email), **$99** (coaching call), and
**$199** (expert-led negotiation). The two paid tiers charge via **Stripe Checkout**
and then hand off to a **Calendly** scheduler. Both degrade gracefully: with no
Stripe key the paid tiers skip payment and go straight to demo scheduling; with no
Calendly URL a clear placeholder shows instead of the calendar.

## Flow

```
Tier chosen ──► POST /api/checkout ──► Stripe-hosted Checkout page
      ▲                                        │ pays
      │ resume (context stashed in             ▼
      │ sessionStorage)              /?checkout=success&tier=…&session_id=…
      └──────────────────────────────  App restores context, reopens modal,
                                        GET /api/checkout/session verifies payment,
                                        then shows the Calendly scheduler.
```

- **Payment is verified server-side** on return (`/api/checkout/session`), so a
  faked redirect can't unlock scheduling — the client trusts Stripe, not the URL.
- On `?checkout=cancel` the modal reopens with a "try again" message.

## Stripe setup

1. **Install the SDK** (added to [server/package.json](server/package.json)):
   ```bash
   npm install --prefix server
   ```
2. **Set the secret key** (server env — never the client):
   ```bash
   STRIPE_SECRET_KEY=sk_test_…        # test mode first; sk_live_… when ready
   ```
   Optional overrides:
   ```bash
   STRIPE_CURRENCY=sgd                # default sgd
   STRIPE_PRICE_CALL_CENTS=9900       # $99 coaching call
   STRIPE_PRICE_EXPERT_CENTS=19900    # $199 expert-led
   PUBLIC_BASE_URL=https://feeoptima.vercel.app   # success/cancel origin (else the request origin)
   ```
3. **Test with Stripe's card** `4242 4242 4242 4242`, any future expiry / CVC.
4. **Go live**: swap in `sk_live_…` and set `PUBLIC_BASE_URL` to the production URL.

Without `STRIPE_SECRET_KEY`, `/api/checkout` returns `503` and the UI falls back to
demo scheduling — the app runs fine and **server tests pass** (the Stripe SDK is
lazy-loaded, only imported when a key is set).

### Hardening (recommended before live)
`retrieveCheckout` confirms `payment_status: paid` on return, which is enough to
gate scheduling. For fulfilment you can't miss (emails, CRM, payouts), add a Stripe
**webhook** on `checkout.session.completed` — not required for the current flow.

## Calendly setup

- **Global scheduler** (the $99 call): set the client env
  ```bash
  VITE_CALENDLY_URL=https://calendly.com/your-team/intro
  ```
- **Per-advisor** (the $199 expert): each advisor's `calendly_url` (edited in the
  Advisor dashboard → Profile) is used automatically. It's exposed to the booking
  widget via the `advisor_directory` view — **re-run [supabase/dashboards.sql](supabase/dashboards.sql)**
  once to add the column to the view. Falls back to `VITE_CALENDLY_URL` if unset.

The embed uses Calendly's official inline widget and listens for the
`calendly.event_scheduled` event to show an in-app "time booked" confirmation.

## What each env var lives where
| Var | Where | Purpose |
|-----|-------|---------|
| `STRIPE_SECRET_KEY` | **server** | Enables Checkout. Keep secret. |
| `STRIPE_CURRENCY`, `STRIPE_PRICE_*_CENTS`, `PUBLIC_BASE_URL` | server | Optional pricing / URL config. |
| `VITE_CALENDLY_URL` | **client** | Global scheduler link. |

> The charge model here is **fixed upfront fees** ($99 / $199), matching the tiers
> in the UI. If you want a success-fee model instead (a % of delivered savings,
> billed after the fact), that's an invoice-based flow — not wired here.
