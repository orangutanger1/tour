# Tour Guide — Mobile Saved Trips (Phase 2c-1) Design Spec

**Date:** 2026-06-27
**Status:** Design approved, ready for implementation planning
**Depends on:** Phase 2b ([[phase-2b-home-itinerary-state]]) — the itinerary screen, `TripFlow`,
`lib/poi.ts`, `lib/supabase.ts`. Backend: `trips` table with RLS owner-only (Phase 1); 2b's
edge function already persists every generated trip there.

## 0. Context: Phase 2c decomposition

Phase 2c (from the Phase 2a spec) is four independent subsystems, each its own spec → plan →
build cycle: **(1) saved trips** · (2) itinerary editing (reorder/add/remove/swap/regenerate-day) ·
(3) lodging picker · (4) offline cache. This spec covers **(1) saved trips** — the smallest,
independent, and the entry point the others hang off. Build order: 1 → 2 → 3 → 4.

## 1. Goal & Scope

Let a signed-in user revisit and manage trips they have already generated: a list of past
trips, open one to view its itinerary, and delete ones they no longer want. Trips are already
saved server-side (2b), so this slice is mostly a read/list/delete path plus making the
itinerary screen render a stored trip.

**In scope:**
- A "Saved trips" entry on home → a saved-trips list screen.
- List the user's trips (most recent first): location + created date + day count.
- Tap a trip → open it in the existing itinerary screen (list + map).
- Delete a trip (long-press → confirm) with list refresh.
- Loading / error / empty states.

**Out of scope (other 2c slices):** itinerary editing, lodging picker, offline cache.
**Also out:** pagination (per-user trip volume is tiny — daily cap is 10), trip date display
(2b's `saveTrip` does not populate `start_date`/`end_date`).

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Render a saved trip | Reuse `itinerary.tsx`, source-agnostic via optional `tripId` param | One renderer for fresh + saved; sets up editing-by-id later |
| Delete | In scope (long-press → confirm → delete) | Asked for; small write path on the RLS-owned table |
| Server data | TanStack Query (`useQuery` list + single; invalidate on delete) | Matches 2b; free loading/error/cache |
| Day count source | `itinerary.days.length`, computed client-side | No `tripDays` column; trip volume tiny |

## 3. Architecture

```
mobile/
  app/(app)/
    index.tsx       # MODIFY: add "Saved trips" -> /saved
    saved.tsx       # list + open + delete; loading/error/empty
    itinerary.tsx   # MODIFY: source-agnostic (tripId param -> getTrip; else TripFlow.data)
  lib/
    trips.ts        # listTrips / getTrip / deleteTrip (supabase-js, RLS-guarded; injectable client)
    trips.test.ts   # unit: row->summary mapping, order, getTrip, deleteTrip, errors
```

**Component contracts:**

- **`lib/trips.ts`** — depends on a supabase client + `Itinerary` from `./types`.
  - `interface TripSummary { id: string; location: string; createdAt: string; dayCount: number }`
  - `listTrips(client): Promise<TripSummary[]>` — `select("id, location, created_at, itinerary")`
    from `trips`, `order("created_at", { ascending: false })`; map each row to a summary with
    `dayCount = (itinerary.days?.length ?? 0)`. *(ponytail: selects full `itinerary` JSONB only to
    count days; if trip volume ever grows, add a `jsonb_array_length` view/column.)*
  - `getTrip(client, id): Promise<{ id: string; location: string; itinerary: Itinerary }>` —
    `select("id, location, itinerary").eq("id", id).single()`. RLS scopes to the owner.
  - `deleteTrip(client, id): Promise<void>` — `from("trips").delete().eq("id", id)`; throws on error.
- **`saved.tsx`** — `useQuery(["trips"], () => listTrips(supabase))`. Renders a `FlatList`:
  each row shows location, created date, and `{dayCount} days`; tap → `router.push("/itinerary?tripId=" + id)`;
  long-press → `Alert.alert` confirm → `deleteTrip` then `queryClient.invalidateQueries({ queryKey: ["trips"] })`.
  Spinner while loading, error text on failure, empty state ("No saved trips yet" + "Plan a trip" → onboarding).
- **`itinerary.tsx`** — reads `tripId` via `useLocalSearchParams`. If present:
  `useQuery(["trip", tripId], () => getTrip(supabase, tripId))` → render its `itinerary`; show
  spinner/error for that fetch. If absent: use `useTripFlow().data` (the fresh flow, unchanged).
  All existing rendering (coords via `getStopCoords`, list, map toggle, empty state) operates on
  the resolved itinerary regardless of source.

**Data flow:**
```
home "Saved trips" -> /saved
  saved: listTrips -> rows
  tap -> /itinerary?tripId=X -> getTrip(X) -> render (list + map)
  long-press -> confirm -> deleteTrip(X) -> invalidate ["trips"] -> list refreshes
```

## 4. Configuration / Secrets

None. Reuses the existing Supabase client (anon key, RLS). No new env, no new dependency.

## 5. Testing

- **`lib/trips.ts`** — unit-tested with an injected supabase stub: `listTrips` maps rows to
  summaries (incl. `dayCount` from `itinerary.days.length`) and requests `created_at` descending;
  `getTrip` returns the itinerary; `deleteTrip` issues a delete filtered by id; each surfaces errors.
- **Screens** — thin; no automated tests (no RNTL, per 2a/2b). Verified by `npx tsc --noEmit`
  and manual device smoke: list shows trips, tap opens the saved itinerary (list + map), delete
  removes a row, empty state renders for a fresh account.

## 6. Error & Edge-Case Handling

| Case | Handling |
|---|---|
| No trips yet | Empty state: "No saved trips yet" + "Plan a trip" → onboarding |
| `listTrips` fails | Error text + a Retry that refetches the query |
| `getTrip` fails / trip deleted elsewhere | Itinerary fetch error state + Back to saved |
| Saved itinerary has 0 days/stops | Existing itinerary empty state ("limited data here") |
| `/itinerary` opened with neither `tripId` nor a fresh `TripFlow.data` | Guard: show "No itinerary to show" + Back home (avoids a blank screen) |
| Delete fails | Alert the failure; leave the row in place (no optimistic removal) |

## 7. Deferred (YAGNI)

Itinerary editing · lodging picker · offline cache (other 2c slices) · pagination/infinite scroll ·
trip rename · trip date display · multi-select/bulk delete · pull-to-refresh (the delete path
already invalidates; add later if wanted).
