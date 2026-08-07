// Supabase data access for the user & advisor dashboards. All reads/writes go
// through RLS (see supabase/dashboards.sql), so each call only ever touches rows
// the signed-in user is allowed to see.
import { supabase, isSupabaseConfigured } from './supabase.js';

const ensure = () => {
  if (!isSupabaseConfigured) throw new Error('Supabase isn’t configured yet.');
};

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
    .from('advisors').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
