// Client-side admin check — for UX only (which menu entry / view to show). Real
// enforcement is Postgres RLS via public.is_admin(); this cannot grant access.
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'admin@benchmark.com';

export const isAdminEmail = (user) =>
  Boolean(user?.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

/* Customer-support portal. Same shape as the admin check above and with the same
   caveat: this is UX only. Real enforcement is Postgres RLS via
   public.is_support() (supabase/support.sql), which decides what the callback
   queue will actually return. An admin is support too, so the owner can open the
   portal without being added to the allow-list twice. */
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'usersupport@feeoptima.com';

export const isSupportEmail = (user) =>
  Boolean(user?.email && user.email.toLowerCase() === SUPPORT_EMAIL.toLowerCase())
  || isAdminEmail(user);
