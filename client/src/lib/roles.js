// Client-side admin check — for UX only (which menu entry / view to show). Real
// enforcement is Postgres RLS via public.is_admin(); this cannot grant access.
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'admin@benchmark.com';

export const isAdminEmail = (user) =>
  Boolean(user?.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
