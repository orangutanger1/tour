-- supabase/migrations/0002_itinerary_v2.sql
create table if not exists public.region_suggestions (
  country_place_id text primary key,
  payload jsonb not null,            -- [{label, hook}], may be []
  updated_at timestamptz not null default now()
);

create table if not exists public.place_dwell (
  place_id text primary key,
  minutes int not null,
  updated_at timestamptz not null default now()
);

alter table public.region_suggestions enable row level security;
alter table public.place_dwell enable row level security;

create policy "read region suggestions" on public.region_suggestions
  for select using (auth.role() = 'authenticated');
create policy "read place dwell" on public.place_dwell
  for select using (auth.role() = 'authenticated');
-- writes are service-role only (bypasses RLS), matching cached_pois.
