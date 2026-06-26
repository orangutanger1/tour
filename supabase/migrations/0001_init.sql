-- supabase/migrations/0001_init.sql
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  default_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  location text not null,
  start_date date,
  end_date date,
  prefs jsonb not null,
  itinerary jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists trips_user_created_idx on public.trips (user_id, created_at);

create table if not exists public.cached_pois (
  place_id text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.cached_pois enable row level security;

-- Owner-only access for user data. The edge function uses the service-role key, which bypasses RLS.
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own trips" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cached_pois: no client policies (service-role only). Readable to authenticated for future detail lookups.
create policy "read cached pois" on public.cached_pois
  for select using (auth.role() = 'authenticated');
