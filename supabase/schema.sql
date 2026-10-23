-- Initial persistence schema for future Supabase integration.
-- Review these policies before applying to a production Supabase project.
create extension if not exists pgcrypto;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  currency char(3) not null default 'INR',
  budget numeric(12,2) not null check (budget > 0),
  itinerary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_dates_valid check (end_date >= start_date)
);
create index if not exists trips_user_created_idx on public.trips (user_id, created_at desc);
alter table public.trips enable row level security;
create policy "Users can read their own trips" on public.trips for select to authenticated using (auth.uid() = user_id);
create policy "Users can create their own trips" on public.trips for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own trips" on public.trips for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own trips" on public.trips for delete to authenticated using (auth.uid() = user_id);
