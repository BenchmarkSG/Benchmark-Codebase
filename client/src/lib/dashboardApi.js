// Supabase data access for the user & advisor dashboards. All reads/writes go
// through RLS (see supabase/dashboards.sql), so each call only ever touches rows
// the signed-in user is allowed to see.
import { supabase, isSupabaseConfigured } from './supabase.js';
import { safeHttpUrl } from './safeUrl.js';

const ensure = () => {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured yet.');
};

// Reject javascript:/data: etc. in URL columns before they are stored (they'd be
// rendered into href/src and would XSS whoever views the advisor directory).
function sanitizeUrlFields(patch) {
  const out = { ...patch };
  for (const key of ['calendly_url', 'photo_url']) {
    if (out[key] == null || out[key] === '') continue;
    const safe = safeHttpUrl(out[key]);
    if (!safe) throw new Error(`Please enter a valid https link for ${key.replace('_url', '')}.`);
    out[key] = safe;
  }
  return out;
}

async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

// ---- Saved benchmarks (user dashboard core) --------------------------------
export async function listBenchmarks() {
  ensure();
  const { data, error } = await supabase
    .from('saved_benchmarks').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveBenchmark(row) {
  ensure();
  const user = await currentUser();
  if (!user) throw new Error('Please sign in to save a benchmark.');
  const { data, error } = await supabase
    .from('saved_benchmarks').insert({ ...row, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function updateBenchmark(id, patch) {
  ensure();
  const { data, error } = await supabase
    .from('saved_benchmarks').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBenchmark(id) {
  ensure();
  const { error } = await supabase.from('saved_benchmarks').delete().eq('id', id);
  if (error) throw error;
}

// ---- Advisor directory (public, approved advisors only) --------------------
export async function listAdvisorDirectory() {
  ensure();
  const { data, error } = await supabase.from('advisor_directory').select('*');
  if (error) throw error;
  return data || [];
}

// ---- Leads -----------------------------------------------------------------
export async function createLead(row) {
  ensure();
  const user = await currentUser();
  if (!user) throw new Error('Please sign in to request an expert.');
  const { data, error } = await supabase
    .from('leads').insert({ ...row, user_id: user.id }).select().single();
  if (error) throw error;
  return data;
}

export async function listMyLeads() {
  ensure();
  const user = await currentUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('leads').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listAssignedLeads(advisorId) {
  ensure();
  if (!advisorId) return [];
  const { data, error } = await supabase
    .from('leads').select('*').eq('advisor_id', advisorId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateLead(id, patch) {
  ensure();
  const { data, error } = await supabase
    .from('leads').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ---- Advisor self-service --------------------------------------------------
export async function getMyAdvisor(email) {
  ensure();
  if (!email) return null;
  const { data, error } = await supabase
    .from('advisors').select('*').ilike('email', email)
    .order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function updateMyAdvisor(id, patch) {
  ensure();
  const { data, error } = await supabase
    .from('advisors').update(sanitizeUrlFields(patch)).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ---- Account / profile self-service ----------------------------------------
// Everything here is RLS-scoped to the signed-in user's own row (see
// supabase/account_settings.sql).

export async function getMyProfile() {
  ensure();
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('user_profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  // No row yet (pre-trigger signups) — fall back to what auth already knows.
  return data || {
    id: user.id, email: user.email,
    full_name: user.user_metadata?.full_name || '',
    phone: user.user_metadata?.phone || '',
  };
}

// upsert so this works whether or not the on_auth_user_created trigger ran.
export async function updateMyProfile(patch) {
  ensure();
  const user = await currentUser();
  if (!user) throw new Error('Please sign in to update your profile.');
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ id: user.id, email: user.email, ...patch })
    .select().single();
  if (error) throw error;
  return data;
}

// Upload an avatar into the caller's own folder (avatars/<uid>/…) and return its
// public URL. Storage RLS rejects any path outside that folder.
export async function uploadAvatar(file) {
  ensure();
  const user = await currentUser();
  if (!user) throw new Error('Please sign in to upload a photo.');
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${user.id}/avatar-${Date.now()}.${ext || 'jpg'}`;
  const { error } = await supabase.storage
    .from('avatars').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

// Best-effort cleanup of the previous avatar file (never blocks the save).
export async function removeAvatarFile(url) {
  if (!isSupabaseConfigured || !url) return;
  const marker = '/avatars/';
  const i = url.indexOf(marker);
  if (i === -1) return;
  const path = decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  try { await supabase.storage.from('avatars').remove([path]); } catch { /* ignore */ }
}

export async function requestAccountDeletion(reason) {
  ensure();
  const user = await currentUser();
  if (!user) throw new Error('Please sign in first.');
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .insert({ user_id: user.id, email: user.email, reason: reason || null })
    .select().single();
  if (error) throw error;
  return data;
}

export async function getMyDeletionRequest() {
  ensure();
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('*').eq('user_id', user.id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

export async function cancelAccountDeletion(id) {
  ensure();
  const { error } = await supabase
    .from('account_deletion_requests').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

// ---- Advisor blackouts (unavailability windows) ----------------------------
// RLS restricts these to admins and the advisor themselves; `reason` never
// leaves that circle. See supabase/advisor_blackouts.sql.

export async function listAdvisorBlackouts(advisorId) {
  ensure();
  let q = supabase
    .from('advisor_blackouts')
    .select('*')
    .order('block_date', { ascending: true })
    .order('start_time', { ascending: true, nullsFirst: true });
  if (advisorId) q = q.eq('advisor_id', advisorId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createAdvisorBlackout(row) {
  ensure();
  const user = await currentUser();
  const { data, error } = await supabase
    .from('advisor_blackouts')
    .insert({ ...row, created_by: user?.id ?? null })
    .select().single();
  // 23505 = unique violation: this exact window is already blocked.
  if (error?.code === '23505') throw new Error('That window is already blocked for this advisor.');
  if (error) throw error;
  return data;
}

export async function deleteAdvisorBlackout(id) {
  ensure();
  const { error } = await supabase.from('advisor_blackouts').delete().eq('id', id);
  if (error) throw error;
}

// Public, PII-free view used by the booking flow: upcoming windows only, no
// reason text. Returns [] rather than throwing — unavailability notes are a
// nicety, and a failure here must never block someone from booking.
export async function listAdvisorAvailability() {
  ensure();
  const { data, error } = await supabase
    .from('advisor_availability')
    .select('*')
    .order('block_date', { ascending: true });
  if (error) return [];
  return data || [];
}

// ---- Feedback (star rating + optional comment) -----------------------------
// Written right after a booking; RLS ties every row to its author.
// See supabase/feedback.sql.
export async function submitFeedback({ rating, comment, source, benchmarkId }) {
  ensure();
  const user = await currentUser();
  if (!user) throw new Error('Please sign in to leave feedback.');
  const score = Number(rating);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Pick a rating from 1 to 5.');
  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    benchmark_id: benchmarkId || null,
    source: source || 'booking',
    rating: score,
    comment: (comment || '').trim().slice(0, 1000) || null,
  });
  // 23505 = the one-per-benchmark unique index. Treat a second submission as a
  // no-op rather than an error — they've already been heard.
  if (error && error.code !== '23505') throw error;
}
