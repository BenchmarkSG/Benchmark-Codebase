# Admin Portal

A hidden portal to edit the benchmarking values stored in Supabase. It shows the
current value for each field, a pencil to edit it, and writes to the database only
when **Save** is pressed.

**URL:** `/#admin` (e.g. `http://localhost:5173/#admin` or
`https://your-app.vercel.app/#admin`). It's not linked anywhere on the site.

## Security model (important)

The password is **not** in the code. Instead:

- The admin is a real **Supabase Auth** account (`admin@benchmark.com`), with its
  password stored hashed by Supabase.
- Write access to the rate tables is enforced by **Postgres Row Level Security**
  (`supabase/admin.sql`): only a signed-in user whose email is in `public.admins`
  can insert/update/delete. This can't be bypassed by editing the browser code —
  even if someone opened the portal UI, the database would reject their writes.
- The client-side email check is only for UX (showing the editor vs a login form).

## One-time setup

1. Ensure the data schema exists — run [`supabase/rates_schema.sql`](supabase/rates_schema.sql),
   then seed it (`npm run seed:rates`). See [PRODUCT_DATA.md](PRODUCT_DATA.md).
2. Run [`supabase/admin.sql`](supabase/admin.sql) in the Supabase SQL editor
   (creates the `admins` list, `is_admin()`, and admin write policies).
   Then run [`supabase/user_profiles.sql`](supabase/user_profiles.sql) — it adds
   the `user_profiles` table (sign-up details) and lets admins read every row.
   Then run [`supabase/advisors.sql`](supabase/advisors.sql) — it adds the
   `advisors` table (founding-member applications) + the `advisor-photos` storage
   bucket, with public apply / admin-only read.
3. Create the admin account (uses the service-role key):
   ```bash
   export SUPABASE_URL="https://<ref>.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="<service_role secret>"
   npm run create:admin        # admin@benchmark.com / rohitjamwal
   ```
   Override with `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars if you like. Re-running
   just resets the password.
4. Make sure the client has Supabase keys (`client/.env.local`, see AUTH_SETUP.md)
   and restart the dev server.

## Using it

1. Go to `/#admin` and sign in with the admin credentials.
2. Pick a section (Overdraft, Loans & trade finance, Remittance, Negotiation
   thresholds, Individual product rates, Registered users, Advisor applications,
   Banks, Countries) and, where relevant, a country. **Registered users** is
   read-only — it lists every sign-up with name, email, WhatsApp phone and
   monthly-income bracket. **Advisor applications** lists founding-member
   applicants (name, contact, specialization, products, photo); only **Status**
   is editable (mark `approved` / `rejected`).
3. Each row shows current values. Click the **pencil** to edit, change the
   value(s), then **Save** — that's when the update is written to Supabase. The
   row briefly highlights green on success. **Cancel** discards changes.

## Editable fields

- **Overdraft** — min/max rate, indicative flag
- **Loans & trade finance** — interest rate, arrangement/other fees, tenor
- **Remittance** — upfront/intermediary/lifting fees, FX spread
- **Negotiation thresholds** — target saving, threshold, switching cost/weeks, worthwhile
- **Banks** — name, category, order
- **Countries** — name, currency, symbol, order

Read-only columns (bank name, currency, product type, direction) are identity
fields; change them via the Banks/Countries sections or a reseed.

## Notes

- Edits set the value directly; if you're replacing indicative data with sourced
  figures, also untick **Indicative** on those rows.
- Because writes go through RLS as the admin's session, they're audited under that
  account and can't be performed anonymously.
