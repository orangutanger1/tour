# Passport (Home Phase 2) — Design

**Date:** 2026-06-29
**Status:** Approved
**Parent spec:** `2026-06-29-home-screen-design.md` (this is its Phase 2)

## Goal

Turn the Passport tab from a stub into a travel scrapbook:

- A **clustered map** of visited landmarks at the top.
- Below it, a vertical scroll of **per-destination albums**, each shown as an
  interactive **fanned photo stack** that expands into a full gallery.
- Photos are **user-taken**, attached to a specific landmark (POI) within a
  saved trip, **captioned**, and **reorderable**.
- Stack aesthetic (`polaroid` vs `clean`) is a user setting.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Album grouping | **Per trip** (`trip_id`, labelled `trip.location`). Two trips to Tokyo → two albums. |
| Passport layout | Single screen: clustered map header + scroll of album sections (each a fanned stack). |
| Photo → place | Tied to a stop's `place_id` (a landmark), captured at add time. |
| Add-photo entry | The album gallery's `+` (trip known) and a top-level add when empty. No `poi-detail`. |
| Map coords | Resolved at render from `cached_pois` via existing `getStopCoords`. No lat/lng on the photo row. |
| Map clustering | **Client-side** pure helper (no native expo-maps clustering API). |
| Bucket access | **Private** bucket + **signed URLs**. Personal photos — not public-read. |
| Reorder | Drag within the gallery (gesture-handler + reanimated). Ceiling/fallback below. |
| Gallery style | `polaroid \| clean` in `profiles.default_prefs.galleryStyle`, default `polaroid`. |

### Album grouping — why per-trip, not geocoded city

Trips *are* destinations in this app ("Plan a trip to X"). Grouping by
`trip_id` is trivial (`group by`) and unambiguous. True merge-by-city (two Tokyo
trips → one album) needs per-POI geocoding — that's the upgrade path, **out of
scope**.

### Reorder — ceiling and fallback

Drag-reorder in a **grid** is fiddly. Plan target: long-press drag using
`react-native-gesture-handler` (present transitively) + `reanimated` (v4,
present). **Fallback if grid-drag proves too costly at build time:** up/down
move controls + "set as cover" in edit mode — zero new dependency, same data
model (`sort_order`). The migration and `reorderPhotos` API are identical either
way, so this choice can be made during implementation without reshaping the
schema.

## Data model

### Migration `supabase/migrations/0003_trip_photos.sql`

```sql
create table if not exists public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  place_id text not null,              -- POI the photo was taken at
  place_name text not null,            -- denormalized for captions/pins
  caption text,                        -- user caption, nullable
  sort_order int not null default 0,   -- manual order within an album
  storage_path text not null,          -- path within the trip-photos bucket
  created_at timestamptz not null default now()
);
create index if not exists trip_photos_album_idx
  on public.trip_photos (user_id, trip_id, sort_order);

alter table public.trip_photos enable row level security;
create policy "own photos" on public.trip_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Storage bucket `trip-photos`

- **Private** bucket. Object key: `{user_id}/{trip_id}/{uuid}.jpg`.
- RLS on `storage.objects`: a user may read/write/delete only objects whose
  first path segment equals their `auth.uid()`.
- Display via **signed URLs** (short-lived), batch-minted in `signedUrls`.
- Bucket + policies created in the same migration (or, if the project provisions
  storage via dashboard, documented in the plan).

### Gallery style

Stored in the existing `profiles.default_prefs` jsonb under `galleryStyle`. New
`getGalleryStyle` / `setGalleryStyle` in `lib/profile.ts` that read/write just
that key and **bypass the `interests`-array guard** in `getProfile` — a new user
with no trip prefs still gets a working toggle. Default `polaroid` when absent.

## Code structure

### `mobile/lib/photos.ts`

Client calls (RLS-scoped by the authed client):

- `listPhotos(client)` → `PhotoRow[]`, newest-first.
- `addPhoto(client, { tripId, placeId, placeName, caption, fileUri })` —
  **upload file to bucket, then insert row**. No row is written without a
  successful upload (no dangling references).
- `deletePhoto(client, photo)` — remove file + row.
- `updateCaption(client, id, caption)`.
- `reorderPhotos(client, tripId, orderedIds)` — write new `sort_order`s.
- `signedUrls(client, paths[])` → `Record<path, url>`.

Pure helpers (unit-tested, `lib/*.test.ts` pattern):

- `groupByAlbum(photos)` → albums keyed by `trip_id`, each sorted by `sort_order`.
- `distinctPlaceIds(photos)` — for map pins.
- `coverPhoto(album)` — lowest `sort_order`, else newest.
- `nextSortOrder(album)`.
- `clusterPins(pins, zoom)` → `{ center, count, ids }[]` — grid-bucket
  clustering; single-pin clusters render as normal markers.

### Components (`mobile/components/ui`)

- **`PhotoStack`** — fanned, slightly-rotated overlapping photos; `polaroid`
  (white frame + caption peek) vs `clean` variant; `onPress` opens the gallery.
- **`AlbumSection`** — destination label + photo count + `PhotoStack`.
- **`PhotoGallery`** — full grid; **edit mode**: reorder (per ceiling/fallback),
  edit caption, delete, set-cover; `+` add affordance.
- **`PhotoLightbox`** — fullscreen photo + caption, swipe within the album.
- **`AddPhotoSheet`** — trip picker (`listTrips`; pre-filled when launched from
  an album) → landmark picker (the trip's stops; `place_id`+`name` straight off
  `Stop`) → `expo-image-picker` (camera/library, `quality` compress) → optional
  caption → `addPhoto`.

Each component is render-from-props; non-render logic lives in `lib/` with tests.

### Screens (`mobile/app/(app)`)

- **`(tabs)/passport.tsx`** — `AppleMaps` header with clustered pins
  (`distinctPlaceIds` → `getStopCoords` → `clusterPins`) + scroll of
  `AlbumSection`s. Empty state until the first photo.
- **`gallery.tsx`** (route, param `tripId`) — `PhotoGallery` for that album.
- **`account.tsx`** — add a `galleryStyle` segmented toggle.

### Fold-in

`TripCard` cover uses `coverPhoto(album)` (first user photo) with the existing
gradient + destination fallback. Cheap now that photo data exists.

## Dependencies

- **`expo-image-picker`** — new. Covers `launchCameraAsync` +
  `launchImageLibraryAsync`. Pin to the Expo v56-compatible version (verify
  against `https://docs.expo.dev/versions/v56.0.0/` at plan time).
- **`react-native-gesture-handler`** — promote from transitive to an explicit
  dependency (used for drag-reorder). `reanimated` 4 + `worklets` already
  installed (fanned-stack animation, drag).

## Testing

- Pure helpers: `groupByAlbum`, `distinctPlaceIds`, `coverPhoto`,
  `nextSortOrder`, `clusterPins`.
- Client paths (`addPhoto` upload-then-insert ordering, `reorderPhotos`,
  `signedUrls`, `get/setGalleryStyle`) via a mock Supabase client, mirroring
  `lib/profile.test.ts` / `lib/trips.test.ts`.

## Error / edge cases

- Upload fails → surface retry; **never** insert a row without a successful
  upload (avoid dangling references).
- Photo's POI missing from `cached_pois` → its pin is skipped (matches how
  `itinerary.tsx` already handles absent coords); the photo still shows in its
  album.
- Signed-URL expiry → refetch on demand.
- Offline → react-query serves the cached photo list; upload errors clearly.
- Empty passport (no photos) and empty album states.

## Out of scope

- Merge-by-city albums (needs geocoding).
- Sharing trips/photos with other users.
- Video; Google Places photos (gallery is user-taken only).
