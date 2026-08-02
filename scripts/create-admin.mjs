/* -----------------------------------------------------------------------------
 * Creates (or resets) the admin account used by the admin portal.
 *
 * The password is stored HASHED by Supabase Auth — it is never committed to the
 * repo or shipped to the browser. Access to write rate data is enforced by RLS
 * (supabase/admin.sql), so only this account can modify values.
 *
 * Usage:
 *   1. Run supabase/rates_schema.sql and supabase/admin.sql first.
 *   2. export SUPABASE_URL="https://<ref>.supabase.co"
 *      export SUPABASE_SERVICE_ROLE_KEY="<service_role secret>"
 *   3. node scripts/create-admin.mjs
 *
 * Optional overrides: ADMIN_EMAIL, ADMIN_PASSWORD env vars.
 * --------------------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL || 'admin@benchmark.com';
const password = process.env.ADMIN_PASSWORD || 'rohitjamwal';

if (!url || !key) {
  console.error('✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role, not anon).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // Ensure the email is in the admins allow-list (drives is_admin() in RLS).
  const { error: aErr } = await db.from('admins').upsert({ email });
  if (aErr) throw new Error(`admins upsert: ${aErr.message} (did you run supabase/admin.sql?)`);

  // Create the auth user, or reset its password if it already exists.
  const { data: list, error: lErr } = await db.auth.admin.listUsers({ perPage: 200 });
  if (lErr) throw new Error(`listUsers: ${lErr.message}`);
  const existing = list.users.find((u) => u.email === email);

  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (error) throw new Error(`updateUser: ${error.message}`);
    console.log(`✓ Admin already existed — password reset for ${email}`);
  } else {
    const { error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    console.log(`✓ Admin created: ${email}`);
  }
  console.log('  Sign in at  /#admin');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
