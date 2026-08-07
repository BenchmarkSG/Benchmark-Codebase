# Dashboards — users & advisors

Signed-in members get a dashboard; approved advisors get a second one. Both are
hash routes behind Supabase auth, so no server/Vercel rewrite config is needed.

| Route | Who | What |
|-------|-----|------|
| `/#dashboard` | any signed-in user | saved benchmarks, savings, action pipeline, recommendations |
| `/#advisor`   | approved advisors  | status, profile editor, matched leads, pipeline & earnings, bookings |

Both are reachable from the account menu (avatar → **My dashboard** / **Advisor
dashboard**). The advisor entry only appears when the signed-in email matches an
`advisors` row.

## User dashboard (`/#dashboard`)
- **Savings summary** — total *potential* savings/yr across open benchmarks,
  *realised* savings from negotiated ones, and count tracked.
- **My benchmarks** — every run the user saved from the calculator (**Save to my
  dashboard** on the result). Shows your rate vs best, the annual saving, and an
  **action pipeline**: `Not started → Email drafted → Call booked → Expert
  engaged → Negotiated`. Marking *Negotiated* reveals a field to record the
  actual saving secured. Rows can be removed.
- **Recommended next** — products in the user's segment(s) they haven't
  benchmarked yet, linking back to the calculator.

Benchmarks are saved to `public.saved_benchmarks` (one row per run). Saving
requires sign-in — the result's save button prompts sign-in otherwise.

## Advisor dashboard (`/#advisor`)
- **Status banner** — pending / approved / rejected + founding-advisor badge.
- **Overview** — open pipeline value, savings delivered, fees earned (success-fee
  model).
- **Leads** — clients who picked this advisor in the expert step, matched by
  `advisor_id`. Each shows contact (email / WhatsApp), the opportunity size, and a
  stage pipeline: `New → Contacted → Negotiating → Won / Lost`. Marking *Won*
  reveals fields for savings delivered and the success fee.
- **Bookings** — leads flagged as a booking, with the advisor's scheduling link.
- **Profile** — edit the public profile clients see (bio, company, years, serves,
  specialization, products, Calendly link). Name/email are fixed; a guard trigger
  stops non-admins editing their approval status.

## How the data becomes real
- **Saved benchmarks** are written when a signed-in user clicks *Save to my
  dashboard* on a benchmark result.
- **Leads** are written when a signed-in user selects a real (approved) advisor in
  the **Get me an Expert** step. The expert picker reads
  `public.advisor_directory` (approved advisors, PII-safe); if none are approved
  yet it falls back to the labelled demo advisors and creates no lead.

## Data model (see `supabase/dashboards.sql`)
- `saved_benchmarks` — user-owned; RLS: users read/write only their own rows.
- `leads` — `user_id` (creator) + `advisor_id` (assignee). RLS: readable by the
  lead's user, the assigned advisor, or an admin; updatable by the assigned
  advisor (pipeline/savings/fee).
- `advisors` gains `user_id`, `calendly_url`, `updated_at`, self read/update
  policies (matched by JWT email), and a guard trigger against self-approval.
- `my_advisor_id()` — the caller's advisor row id (email match), used by lead RLS.
- `advisor_directory` — view of approved advisors' non-PII columns, readable by
  everyone (for the expert picker).

## Setup
Run `supabase/dashboards.sql` in the Supabase SQL editor **after**
`admin.sql`, `user_profiles.sql` and `advisors.sql`. No reseed needed.

An advisor gets access by signing in with the **same email** they applied with,
once an admin sets their `advisors.status` to `approved` (via `/#admin`).
