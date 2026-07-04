-- supabase/migrations/0007_username.sql
-- Public handle, Wanderlog-style: firstname + 4 digits. Generated client-side
-- on first account visit; unique constraint is the collision arbiter.
alter table public.profiles
  add column if not exists username text unique;
