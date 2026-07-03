-- supabase/migrations/0006_trip_status.sql
-- Async generation lifecycle. Existing rows were all created synchronously
-- complete, so the default 'ready' backfills them correctly. itinerary goes
-- nullable because a 'generating' row hasn't got one yet.
alter table public.trips
  add column if not exists status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed')),
  add column if not exists error_message text;
alter table public.trips alter column itinerary drop not null;
