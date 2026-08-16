// Turn raw backend / Supabase error text into a human, actionable message so we
// never surface things like "duplicate key value violates unique constraint…".
export function friendlyError(err, fallback = 'Something went wrong. Please try again.') {
  const msg = (err && (err.message || err.error_description || err.error)) || '';
  const m = String(msg).toLowerCase();

  if (!msg) return fallback;
  if (m.includes('duplicate key') || m.includes('already registered') || m.includes('already exists') || m.includes('unique constraint')) {
    return 'That email is already registered. Try signing in instead.';
  }
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('invalid email or password')) {
    return 'That email or password doesn’t look right. Please check and try again.';
  }
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox for the link.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts — please wait a moment and try again.';
  if (m.includes('network') || m.includes('failed to fetch')) return 'Network problem — check your connection and try again.';
  if (m.includes('row-level security') || m.includes('permission') || m.includes('not authorized') || m.includes('rls')) {
    return 'You don’t have permission to do that. Please sign in again.';
  }
  if (m.includes('password') && m.includes('6')) return 'Password must be at least 6 characters.';
  // Don't leak DB internals; if it looks like a raw SQL/constraint message, hide it.
  if (m.includes('violates') || m.includes('constraint') || m.includes('syntax') || m.includes('column')) return fallback;
  return msg;
}
