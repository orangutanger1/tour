# Home Screen — Phase 3: Discover + Saved + Surprise — Design

**Date:** 2026-06-30
**Status:** Approved (brainstorm) → ready for writing-plans
**Parent spec:** `docs/superpowers/specs/2026-06-29-home-screen-design.md` (Phase 3 row)

## Problem

The Discover tab is a placeholder (`EmptyState` "coming soon"). The home-screen
vision calls for Discover to be the **forward-looking** surface: seed new trips
from destination ideas, and keep a wishlist of places the user wants to visit.
Two supporting gaps:

1. **`poi-detail.tsx` is a dead stub** (`"POI Detail — 2b"`, never navigated to).
   A "save this place" action needs a real place screen to hang off.
2. **No wishlist storage.** Nothing persists a place the user likes but hasn't
   planned a trip around.

This phase also adds a serendipity feature — **Surprise Me** — that drops the
user at a random real place anywhere on Earth to discover somewhere they'd never
have searched for.

## Scope

Three things, all sharing one `saved_pois` table + one save action:

1. **Discover tab** — curated destination ideas (seed onboarding) + a saved list.
2. **Real `poi-detail` screen** — map + name + blurb + save toggle; reachable
   from itinerary stops and the saved list.
3. **Surprise Me** — random-place edge function + a roll/save screen.

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Discover ideas seed | **Curated country list** (~10 hardcoded `{name, placeId}`), tap → `suggest-regions` → region list → onboarding pre-seeded. No new table. |
| User-rated/reviewed destinations | **Future, out of scope.** The curated const is the upgrade point. |
| Saved POIs scope | **Full:** real `poi-detail` + heart/save + `saved_pois` table + saved list in Discover. |
| poi-detail entry points | Itinerary stop rows **and** the saved list (save action needs ≥1 reachable source besides itself). |
| Discover region flow | **In-tab** (country → regions inline), not a pushed screen. Fewer files. |
| Surprise Me randomness | **Truly random** — weighted continent boxes + live Places Nearby lookup, not random-from-curated. Matches "random area on Earth." |
| Places key boundary | Surprise lookup is an **edge function**; the Google Places key stays server-side. |

## Architecture

### Data model — `saved_pois` (migration `0005_saved_pois.sql`)

```sql
create table if not exists public.saved_pois (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  place_name text not null,
  blurb text,
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);
alter table public.saved_pois enable row level security;
-- RLS: select/insert/delete where user_id = auth.uid()
create index if not exists saved_pois_user_created_idx
  on public.saved_pois (user_id, created_at desc);
```

The `unique (user_id, place_id)` makes save idempotent (one row per place per
user) and lets toggle off delete by `(user_id, place_id)`.

### Mobile data layer — `lib/savedPois.ts`

Mirrors `lib/trips.ts` (react-query, RLS-scoped reads):

- `listSavedPois(client)` → `SavedPoi[]` (`id, place_id, place_name, blurb, created_at`, newest first).
- `toggleSavedPoi(client, poi)` → inserts `{place_id, place_name, blurb}` for the
  current user, or deletes the existing row; returns the new saved-state boolean.
- `isSaved(client, placeId)` → boolean (or derive from the cached list).

Unit-tested with a mock client for the list mapping and toggle insert/delete branch.

### Discover seeds — `lib/discoverSeeds.ts`

```ts
// ponytail: curated const, not a table. User-rated/reviewed ideas replace this later.
export const DISCOVER_SEEDS: { name: string; placeId: string }[] = [ /* ~10 countries */ ];
```

Trivial const, no test.

## Components / screens

### Discover tab — `app/(app)/(tabs)/discover.tsx`

A scroll view with:

- **Surprise Me** button (header) → `router.push("/surprise")`.
- **Saved** section — `SavedPoiCard` list from `listSavedPois`. Tap a card →
  `/poi-detail?placeId=…&name=…&blurb=…`. Hidden when the list is empty.
- **Ideas** section — grid of `DISCOVER_SEEDS` country cards. Tap a country →
  `suggestRegions({ placeId })` (existing `lib/placesClient.ts` client) → render
  the returned regions inline. Tap a region → seed onboarding (below).

Loading/error via react-query. Empty saved list → ideas still show.

### Seeding onboarding from a region

Reuse the existing trip-edit seed path: `tripFlow.prepare(request)` sets
`pendingRequest`, and `onboarding.tsx` rehydrates it via `stateFromRequest`. On
region tap:

```
tripFlow.prepare(buildRequest({ ...defaults, location: region.label,
                                destinationPlaceId: region.placeId }))
router.push("/onboarding")
```

No new onboarding code; the region already carries a real `placeId`.

### poi-detail — `app/(app)/poi-detail.tsx` (replace stub)

Route params: `placeId`, `name`, `blurb`, `dwellMinutes?`. Renders:

- Name, blurb, dwell (`formatDwell` from `lib/poi.ts`).
- Mini-map (`AppleMaps`, already used in `itinerary.tsx`), centered via
  `getStopCoords(client, [placeId])` (existing `cached_pois` reader).
- **Heart toggle** → `toggleSavedPoi`; reflects `isSaved`.

New entry point: itinerary stop rows (`itinerary.tsx`) become pressable →
`/poi-detail?placeId=…&name=…&blurb=…&dwellMinutes=…`.

### Surprise Me — `app/(app)/surprise.tsx`

Calls the `surprise-place` edge function, then shows:

- `AppleMaps` pinned at the returned coord.
- Name + blurb.
- **Save** (reuses `toggleSavedPoi` with `{placeId, name, blurb}`).
- **Roll again** (re-invokes the function).
- Spinner while rolling; error state with retry if the function fails.

## Edge function — `surprise-place`

`supabase/functions/surprise-place/index.ts` + a pure `handler.ts` (mirrors the
`suggest-regions` index/handler split):

1. `randomLandCoord(rng)` (`_shared/randomCoord.ts`) — pick a weighted continent
   bounding box, then a uniform point inside it.
2. `searchNearby({ lat, lng, radiusM, apiKey, httpFetch })` (new helper in
   `_shared/places.ts`) — Google Places Nearby Search (New), rank by popularity,
   types `tourist_attraction`/`locality`, request `id, displayName, location,
   editorialSummary`.
3. Empty result → retry with a fresh coord, **max 5 attempts**; if all empty,
   return a clear error (client shows retry).
4. Return `{ placeId, name, lat, lng, blurb }` (blurb = `editorialSummary`, may
   be absent).

```
// ponytail: coarse continent boxes — some rolls hit empty land; Places retry covers it.
// Max 5 Places calls/tap bounds cost; tighten boxes or add a land mask if rolls feel empty.
```

`randomLandCoord` takes an injected `rng` so the unit test is deterministic:
assert N seeded samples each fall inside a defined continent box (the one
non-trivial pure bit). The Places call and retry loop are covered by a
handler-level test with mocked `searchNearby`/`rng`.

## Error / empty / edge states

- **No saved POIs:** Saved section hidden; ideas + Surprise still present.
- **`suggest-regions` fails for a country:** inline error on that country card; rest of tab unaffected.
- **Surprise exhausts 5 retries:** screen shows "couldn't find a spot — roll again".
- **Save toggle fails:** revert optimistic state, surface a retry; never leave UI lying about saved-state.
- **poi-detail with no cached coords:** show name/blurb without the map (map is enhancement, not required).
- **Offline:** react-query serves cached saved list; Surprise + region lookups error clearly.

## Testing (TDD per task)

- `lib/savedPois.ts` — unit tests (mock client): list mapping, toggle insert vs delete.
- `_shared/randomCoord.ts` — `randomLandCoord` samples land inside a box (seeded rng).
- `surprise-place` handler — Deno test: returns a place on first hit; retries on
  empty; errors after max attempts (mocked `searchNearby` + `rng`).
- `SavedPoiCard` + poi-detail save-state — render tests (saved / unsaved / empty / no-coords).
- Migration `0005` RLS — owner can CRUD own rows, others denied — verified before deploy.
- Follow red/green/commit per task; UI per the design system.

## Out of scope (YAGNI)

- User-rated / reviewed / LLM-ranked destination ideas (curated const is the seam).
- Editing saved POIs beyond add/delete.
- Sharing saved places or surprise results with other users.
- Photos on saved POIs (Passport already owns user photos).
- Caching/offline-queueing surprise results.

## Phasing within Phase 3

Independent, low-risk units; ship and commit each on green:

1. `0005_saved_pois.sql` + `lib/savedPois.ts` (+ tests).
2. Real `poi-detail` (map + save) + itinerary stop entry point.
3. Discover tab — Saved section + curated Ideas (country → regions → onboarding seed).
4. `surprise-place` edge fn (`randomCoord` + `searchNearby`) + `surprise.tsx`.
