-- supabase/migrations/0005_trip_dates.sql
-- Real trip dates + trip type. Nullable: rows generated before this feature
-- have neither, and the mobile app falls back to "Day N" headers.
alter table public.trips
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists trip_type text;
