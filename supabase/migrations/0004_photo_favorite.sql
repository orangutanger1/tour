-- supabase/migrations/0004_photo_favorite.sql
-- Bookmark/highlight flag, independent of the album cover (sort_order).
alter table public.trip_photos
  add column if not exists is_favorite boolean not null default false;
