# Home Screen Redesign — Design

**Date:** 2026-06-29
**Status:** Approved (brainstorm) → ready for Phase 1 plan

## Problem

The home screen (`mobile/app/(app)/index.tsx`) is a launchpad: a "Where to next?" hero and one "Plan a trip" button into onboarding. Two gaps:

1. **Trips are persisted server-side but never read back.** `generate-itinerary` writes a row to the `trips` table (`user_id, location, start_date, end_date, prefs, itinerary, created_at`) and returns a `tripId`, but the mobile app renders the itinerary only from in-memory `useTripFlow()` state. Restart the app and the itinerary disappears from the UI even though the row exists. A returning user can only start over.
2. **No reason to return.** Nothing accumulates between trips — no history, no memories, no inspiration.

## Vision

Turn home into a **three-tab hub** (bottom tab bar):

- **Trips** — dashboard of the user's saved trips as photo cards. Tap → open that trip's itinerary (loaded from DB).
- **Passport** — a record of landmarks the user has visited, grouped by city, each city drilling into a gallery of **the user's own photos** taken at those places, previewed as an interactive fanned photo stack.
- **Discover** — destination ideas (to seed new trips) plus saved/wishlist POIs.

Two backward-looking surfaces (Trips, Passport) and one forward-looking (Discover), all anchored by a persistent "Plan a trip" entry that keeps the core loop one tap away.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Layout | **Bottom tabs** (Trips / Passport / Discover), not scroll-feed or hub |
| Passport top-level | **List-first**: small map header + city rows with landmark counts |
| Gallery preview | **Fanned photo stack** — overlapping, slightly rotated photos; tap expands to full grid |
| Gallery photos | **User-taken**, tied to a POI within a trip (not Google Places photos) |
| Stack aesthetic | **Both polaroid and clean**, user-selectable in account settings (`galleryStyle`, default `polaroid`) |
| Trip-card cover | First user photo from the trip → fallback gradient + destination name |
| Discover ideas | Reuse the existing `suggest-regions` edge function |

## Architecture

### Navigation restructure

Today `mobile/app/(app)/_layout.tsx` is a `Stack` wrapping `TripFlowProvider`. Introduce a tab group nested under it:

```
app/(app)/_layout.tsx           Stack + TripFlowProvider (unchanged shape)
app/(app)/(tabs)/_layout.tsx    Tabs: Trips | Passport | Discover   [NEW]
app/(app)/(tabs)/index.tsx      Trips tab (was index.tsx launchpad)  [MOVED]
app/(app)/(tabs)/passport.tsx   Passport tab                          [Phase 2]
app/(app)/(tabs)/discover.tsx   Discover tab                          [Phase 3]
```

Flow + detail screens (`onboarding`, `generating`, `itinerary`, `poi-detail`, `edit`, `lodging`, `trip-create`, `account`) **stay at the `(app)` stack level** so they push *over* the tab bar full-screen. Tapping a trip card pushes `/itinerary?tripId=…` onto the stack. `saved.tsx` is removed/folded into Discover (Phase 3); the old launchpad `index.tsx` content (hero + CTA) becomes the empty-state of the Trips tab.

The tab bar uses the existing design system (crimson accent, Plus Jakarta Sans). Three tabs, icon + label.

### Data model

**Reads (Phase 1):** Add `lib/trips.ts` — `listTrips(client)` selects `id, location, start_date, end_date, itinerary, created_at` for the current user ordered by `created_at desc`; `getTrip(client, id)` selects one. RLS already scopes `trips` to `user_id`. Use react-query (already a dependency) for caching/loading/error.

**Itinerary by id (Phase 1):** `itinerary.tsx` currently reads `useTripFlow().data`. Extend it to accept a `tripId` route param: if present, load that trip from DB via `getTrip`; if absent, fall back to in-memory `useTripFlow()` (the just-generated path). This makes reopen-after-restart work and keeps the generate flow intact.

**Photos (Phase 2):** New migration `0003_trip_photos.sql`:

```sql
create table if not exists public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  place_id text not null,            -- POI the photo was taken at
  place_name text not null,          -- denormalized for gallery captions
  storage_path text not null,        -- path within the photos bucket
  caption text,
  created_at timestamptz not null default now()
);
-- RLS: user_id = auth.uid() for select/insert/delete; index on (user_id, trip_id), (user_id, place_id)
```

A private Supabase **Storage bucket** `trip-photos` holds the image files, keyed `{user_id}/{trip_id}/{uuid}.jpg`. RLS on the bucket restricts read/write to the owning user. Display uses signed URLs (or a public-read bucket if simpler — decide in Phase 2 plan).

**Settings (Phase 2):** `galleryStyle: "polaroid" | "clean"` stored in the existing `profiles.default_prefs` jsonb (no new column), default `polaroid`, edited on the account screen.

### Components

New shared UI (extend `components/ui`):

- `TripCard` — cover image (first photo / gradient fallback) + destination + date range + day count.
- `PhotoStack` — the fanned preview; renders polaroid or clean per `galleryStyle`; `onPress` opens the gallery.
- `PhotoGallery` — expanded grid + the `+` add-photo affordance.
- Passport `CityRow` — thumbnail + city + landmark count + chevron.

Each is independently testable: given props (trip, photos[], style), it renders a known structure. Logic that isn't pure render (numbering, grouping photos by city, choosing a cover) lives in `lib/` with unit tests, matching the existing `lib/*.test.ts` pattern.

### Photo capture (Phase 2)

Add `expo-image-picker` (one dep, covers both `launchCameraAsync` and `launchImageLibraryAsync`). Entry point: an "add photo" action on `poi-detail.tsx` (currently a stub) and the gallery `+`. Flow: pick/take → upload to `trip-photos` bucket → insert `trip_photos` row with `trip_id` + `place_id` + `place_name`. Compress before upload (picker `quality` option) to keep storage small.

## Per-tab behaviour

### Trips (Phase 1)
- List of `TripCard`s from `listTrips`, newest first.
- Persistent "Plan a trip" CTA (header or top of list) → onboarding.
- Empty state = the current hero ("Where to next?") + CTA.
- Loading + error states via react-query.

### Passport (Phase 2)
- Small map header (`AppleMaps`, already wired in `itinerary.tsx`) with pins for visited landmarks.
- Below: city rows (`CityRow`) grouped from `trip_photos` (group by city derived from place data), each showing landmark count.
- Tap city → drill-down screen: `PhotoStack` hero (per `galleryStyle`) → tap → `PhotoGallery` grid.
- Empty state until the user has uploaded photos.

### Discover (Phase 3)
- Destination ideas via `suggest-regions`; tap an idea → onboarding pre-seeded with that location.
- Saved/wishlist POIs (requires a save action added to `poi-detail.tsx`).

## Error / empty / edge states

- **No trips:** Trips tab shows hero + CTA (the old launchpad). Passport + Discover show friendly empty states.
- **Trip load fails (bad/stale tripId):** itinerary screen shows an error with a back action; does not crash.
- **Photo upload fails:** surface a retry; do not insert a `trip_photos` row without a successful upload (avoid dangling references).
- **Offline:** react-query serves cached trips; photo upload queues or errors clearly.
- **New user, brand-new trip (no photos):** trip card uses the gradient fallback; passport stays empty.

## Testing

- `lib/trips.ts` — unit tests for `listTrips`/`getTrip` mapping (mock client), mirroring `lib/profile.test.ts`.
- Cover-selection, photo-grouping, and gallery-style helpers — pure-function unit tests.
- Components — render tests asserting structure for populated + empty + fallback states.
- Migration `0003` — RLS verified (owner can CRUD own rows, others cannot) before deploy.
- Follow the repo's TDD-per-task workflow (red/green/commit).

## Phasing

| Phase | Scope | Notes |
|---|---|---|
| **1 · Tabs + Trips** | Tab nav restructure; `lib/trips.ts`; Trips tab + `TripCard`; itinerary loads by `tripId` from DB (reopen works); empty/loading/error states | Foundation. No new deps, no new tables. This is the phase we plan next. |
| **2 · Passport + photos** | `expo-image-picker`; `trip-photos` bucket + `0003_trip_photos.sql` + RLS; add-photo on poi-detail; Passport list-first + map header; city drill-down; `PhotoStack` (polaroid+clean) + `galleryStyle` setting; `PhotoGallery` | The large phase. Own spec/plan. |
| **3 · Discover + saved** | Discover tab via `suggest-regions`; saved/wishlist POIs + save action on poi-detail | Independent, lowest risk. Own spec/plan. |

Phases 2 and 3 each get their own plan when reached. **Phase 1 proceeds to writing-plans next.**

## Out of scope (YAGNI)

- Sharing trips/photos with other users.
- Editing/reordering photos beyond add/delete.
- Map clustering math (list-first avoids it; map header pins are simple markers).
- Personalized/LLM-ranked Discover beyond what `suggest-regions` already returns.
