-- ================================================================
-- MarketIntel Terminal — Supabase Database Setup
-- Run this entire file in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → paste this → Run
-- ================================================================

-- 1. USER PROFILES TABLE
-- Extends Supabase auth with approval status
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  status text not null default 'pending',
  -- status can be: 'pending', 'approved', 'rejected'
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id)
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Admins can read all profiles
create policy "Admins can read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Admins can update all profiles (for approving/rejecting)
create policy "Admins can update profiles"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- System can insert new profiles (via trigger)
create policy "System can insert profiles"
  on public.profiles for insert
  with check (true);


-- 2. SCAN RESULTS TABLE
-- Stores every scan result
create table if not exists public.scans (
  id uuid default gen_random_uuid() primary key,
  scan_time text,
  scan_date text,
  triggered_by text default 'manual',
  events jsonb default '[]'::jsonb,
  urgent_alerts jsonb default '[]'::jsonb,
  sentiment jsonb default '{}'::jsonb,
  setups jsonb default '[]'::jsonb,
  market_summary text,
  event_count integer default 0,
  created_at timestamptz not null default now()
);

alter table public.scans enable row level security;

-- Only approved users can read scans
create policy "Approved users can read scans"
  on public.scans for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and status = 'approved'
    )
  );

-- Service role can insert scans (GitHub Actions uses service role key)
create policy "Service role can insert scans"
  on public.scans for insert
  with check (true);


-- 3. AUTO-CREATE PROFILE ON SIGNUP TRIGGER
-- When a user signs up via Supabase auth, automatically create their profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'pending'
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 4. SET YOURSELF AS ADMIN
-- IMPORTANT: Run this AFTER you create your account in the app
-- Replace 'your@email.com' with the email you signed up with
-- update public.profiles set is_admin = true, status = 'approved' where email = 'your@email.com';


-- ================================================================
-- DONE. Your database is ready.
-- Remember to set yourself as admin after signing up (see step 4 above)
-- ================================================================
