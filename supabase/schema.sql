-- BankBenchmark.sg — Supabase schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
--
-- Supabase already stores accounts in the managed `auth.users` table when people
-- sign up (email, Google, or Apple). This adds an app-owned `profiles` table for
-- the fields we care about, kept in sync automatically, and locked down with
-- Row Level Security so each user can only read/write their own row.

-- 1) Profiles table -----------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2) Row Level Security -------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by their owner" on public.profiles;
create policy "Profiles are viewable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 3) Auto-create a profile row whenever a new account is created --------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) (Optional) Saved benchmarks — an example of storing user data ------------
-- Uncomment to let signed-in users save their benchmark runs.
--
-- create table if not exists public.saved_benchmarks (
--   id          uuid primary key default gen_random_uuid(),
--   user_id     uuid not null references auth.users (id) on delete cascade,
--   segment     text,
--   product     text,
--   your_rate   numeric,
--   benchmark   numeric,
--   annual_saving numeric,
--   created_at  timestamptz not null default now()
-- );
-- alter table public.saved_benchmarks enable row level security;
-- create policy "Owners manage their benchmarks"
--   on public.saved_benchmarks for all
--   using (auth.uid() = user_id) with check (auth.uid() = user_id);
