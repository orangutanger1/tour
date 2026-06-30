-- supabase/migrations/0003_trip_photos.sql
create table if not exists public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  place_id text not null,
  place_name text not null,
  caption text,
  sort_order int not null default 0,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists trip_photos_album_idx
  on public.trip_photos (user_id, trip_id, sort_order);

alter table public.trip_photos enable row level security;

create policy "own photos" on public.trip_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket for user-taken photos.
insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false)
on conflict (id) do nothing;

-- Object key layout: {user_id}/{trip_id}/{uuid}.jpg — owner is the first path segment.
create policy "own photo objects read" on storage.objects
  for select using (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own photo objects insert" on storage.objects
  for insert with check (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own photo objects delete" on storage.objects
  for delete using (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
