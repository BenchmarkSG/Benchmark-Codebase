# Authentication Setup (Supabase + Google + Apple)

The app ships with a full sign in / sign up flow (email/password, **Google**, and
**Apple**) backed by a **cloud Postgres database on Supabase**. The code is done —
you just need to create a Supabase project, enable the providers, and paste in two
keys. Until you do, the app still runs and the auth dialog shows a friendly
"not configured yet" message.

---

## 1. Create the Supabase project (cloud database)

1. Sign up at <https://supabase.com> and create a new project (free tier is fine).
2. Go to **Project Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`
3. In the client folder, create `.env.local` (copy from `.env.example`):

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```

4. Restart the dev server so Vite picks up the env vars.

## 2. Create the database tables

Open **SQL Editor → New query** and run the project's SQL files in order:
[`supabase/rates_schema.sql`](supabase/rates_schema.sql),
[`supabase/admin.sql`](supabase/admin.sql), then
[`supabase/user_profiles.sql`](supabase/user_profiles.sql). The last one creates
the `user_profiles` table, Row Level Security policies, and a trigger that
auto-creates a profile (name, email, phone, monthly income) whenever someone signs
up. (Accounts themselves live in Supabase's managed `auth.users` table
automatically.) See [PRODUCT_DATA.md](PRODUCT_DATA.md) and [ADMIN.md](ADMIN.md) for
the full data/admin setup.

## 3. Set the redirect URLs

**Authentication → URL Configuration**:
- **Site URL**: `http://localhost:5173` (dev) or your production URL.
- **Redirect URLs**: add both your local and deployed origins, e.g.
  `http://localhost:5173` and `https://your-app.vercel.app`.

## 4. Enable Google sign-in (free)

1. In **Google Cloud Console** → create/choose a project → **APIs & Services →
   Credentials → Create OAuth client ID → Web application**.
2. **Authorized redirect URI**: `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback`
   (Supabase shows this exact value on the provider page).
3. Copy the **Client ID** and **Client secret**.
4. In Supabase → **Authentication → Providers → Google** → toggle on, paste the
   Client ID + Secret → Save.

## 5. Enable Apple sign-in (requires a paid Apple Developer account — $99/yr)

Apple is heavier than Google. In the [Apple Developer](https://developer.apple.com) portal:
1. Create an **App ID**, then a **Services ID** (this becomes the client id).
2. Create a **Sign in with Apple key** (`.p8`) and note the **Key ID** and your **Team ID**.
3. Add the return URL `https://YOUR-PROJECT-ref.supabase.co/auth/v1/callback` and
   verify your domain.
4. In Supabase → **Authentication → Providers → Apple** → toggle on, and enter the
   Services ID, Team ID, Key ID, and the `.p8` key contents → Save.

> Tip: ship Google first (free, 5 minutes). Add Apple when you have the developer
> account — the "Continue with Apple" button is already wired and will just start
> working once the provider is enabled.

## 6. Deploy (Vercel)

Add the same two env vars in **Vercel → Project → Settings → Environment Variables**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Then redeploy. Add your Vercel URL to the Supabase redirect URLs (step 3).

---

## What's implemented

- `client/src/lib/supabase.js` — Supabase client (no-ops safely if unconfigured).
- `client/src/context/AuthContext.jsx` — session state + `signInWithEmail`,
  `signUpWithEmail`, `signInWithGoogle`, `signInWithApple`, `signOut`.
- `client/src/components/AuthModal.jsx` — sign in / sign up dialog with the three
  methods.
- `client/src/components/Navbar.jsx` — "Sign in" button when logged out; avatar +
  dropdown with sign out when logged in.
- `supabase/user_profiles.sql` — `user_profiles` table, RLS, and the new-user
  trigger that captures name / email / phone / monthly income.

## Notes on data governance

This aligns with the project's data policy (see `scope.md`): we store the sign-up
details a user gives us (id, name, email, WhatsApp phone, monthly-income bracket)
so we can tailor benchmarks and follow up. No bank statements or
account-identifying transactional data are persisted by the auth layer.
