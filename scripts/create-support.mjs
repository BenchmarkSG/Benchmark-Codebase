/* -----------------------------------------------------------------------------
 * Creates (or resets) the customer-support account used by the support portal.
 *
 * The password is stored HASHED by Supabase Auth — it is never committed to the
 * repo or shipped to the browser. What support can see and do is enforced by RLS
 * (supabase/support.sql): read the callback queue and the benchmark behind each
 * lead, and set a lead's stage. Nothing else.
 *
 * Usage:
 *   1. Run supabase/dashboards.sql, supabase/admin.sql and supabase/support.sql.
 *   2. export SUPABASE_URL="https://<ref>.supabase.co"
 *      export SUPABASE_SERVICE_ROLE_KEY="<service_role secret>"
 *   3. SUPPORT_PASSWORD='…' node scripts/create-support.mjs
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPPORT_PASSWORD.
 * Optional: SUPPORT_EMAIL (defaults to usersupport@feeoptima.com).
 *
 * The password is NEVER hardcoded — supply a strong one at run time:
 *   SUPPORT_PASSWORD="$(openssl rand -base64 18)" node scripts/create-support.mjs
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.SUPPORT_EMAIL || 'usersupport@feeoptima.com').toLowerCase();
const password = process.env.SUPPORT_PASSWORD;

if (!url || !key) {
  console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role, not anon).');
  process.exit(1);
}
/* Min length matches create-admin.mjs. ALLOW_WEAK_PASSWORD=1 exists because the
   owner may deliberately want a short, memorable password for a shared support
   desk - that is a business call. It has to be typed explicitly, so nobody ever
   sets a weak one by accident. */
const allowWeak = process.env.ALLOW_WEAK_PASSWORD === '1';
if (!password) {
  console.error('✗ Set SUPPORT_PASSWORD. Example:');
  console.error('    SUPPORT_PASSWORD="$(openssl rand -base64 18)" node scripts/create-support.mjs');
  process.exit(1);
}
if (password.length < 12 && !allowWeak) {
  console.error(`✗ SUPPORT_PASSWORD is ${password.length} characters; 12 is the minimum.`);
  console.error('  Either pick a longer one, or say so explicitly:');
  console.error('    ALLOW_WEAK_PASSWORD=1 SUPPORT_PASSWORD="…" node scripts/create-support.mjs');
  process.exit(1);
}

/* This account reads real customer PII (names, emails, phone numbers). A password
   that has ever been committed, pasted into a chat, or shared with a third party
   is not a secret any more. Warn hard, but do not block: which password guards
   this portal is the owner's call, not this script's. */
const BURNED = new Set(['rohitjamwal', 'rohitjamwal123', 'admin123', 'password123']);
if (BURNED.has(password.toLowerCase()) || password.length < 12) {
  console.warn('\n⚠  WARNING: weak or already-exposed password.');
  if (BURNED.has(password.toLowerCase())) {
    console.warn('   This one already exists in this repo’s git history, so anyone who');
    console.warn('   reads the commit log can sign in. It also means one leaked string');
    console.warn('   opens BOTH the admin and the support portal.');
  }
  console.warn('   This account can read customer names, emails and phone numbers.');
  console.warn('   Rotate it when you can:');
  console.warn('     SUPPORT_PASSWORD="$(openssl rand -base64 18)" node scripts/create-support.mjs\n');
}

const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // Ensure the email is in the allow-list (drives is_support() in RLS).
  const { error: sErr } = await db.from('support_staff').upsert({ email });
  if (sErr) throw new Error(`support_staff upsert: ${sErr.message} (did you run supabase/support.sql?)`);

  // Create the auth user, or reset its password if it already exists.
  const { data: list, error: lErr } = await db.auth.admin.listUsers({ perPage: 200 });
  if (lErr) throw new Error(`listUsers: ${lErr.message}`);
  const existing = list.users.find((u) => (u.email || '').toLowerCase() === email);

  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw new Error(`updateUser: ${error.message}`);
    console.log(`✓ Support account already existed — password reset for ${email}`);
  } else {
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    console.log(`✓ Support account created: ${email}`);
  }
  console.log('  Sign in at  /#support');
  console.log('  Remember: set VITE_SUPPORT_EMAIL in client/.env.local and in Vercel.');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
