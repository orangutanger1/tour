# Edit / add locations in a generated itinerary — design

**Date:** 2026-07-09
**Status:** Approved, ready for plan
**Build order:** 2 of 3 (A → B → C). Depends on nothing hard; Spec A's diet
filter enriches the add/replace search but is not required.

## Purpose

Make a generated itinerary mutable. Today `edit.tsx` is a "Coming soon" stub and
`trips.ts` has read paths only. Users who dislike a stop, want to reorder a day,
or want to add somewhere else have no recourse but to regenerate. This adds
in-place editing with instant feedback and accurate times refreshed lazily.

## Operations (all four)

1. **Remove a stop** — drop an attraction or meal from a day.
2. **Reorder / move** — drag to reorder within a day; move a stop to another day.
3. **Replace / swap** — "not this one" → pick a different nearby attraction.
4. **Add via search** — search a place and insert it into a day.

Meal-gap pseudo-stops are not directly editable (they're derived); editing the
surrounding attractions re-derives them on reschedule.

## Recompute strategy — client instant + lazy backend

Every edit applies **optimistically** and is re-timed **client-side instantly**,
then a **background backend re-route** refreshes accurate travel + polyline and
its result is merged in when it returns.

- **Client instant**: `scheduleDayClient` — a JS port of `buildDaySchedule`
  (`supabase/_shared/schedule.ts`) that estimates each leg's
  `travelMinutesFromPrev` by haversine distance between cached stop coords (a
  simple km→min factor) instead of Google Routes. Deterministic, offline,
  no network. Produces provisional `startTime`s immediately.
- **Lazy backend**: `edit-itinerary` edge fn re-routes the changed day via
  Google Routes, re-runs the real `buildDaySchedule`, persists, and returns the
  corrected day (accurate `travelMinutesFromPrev`, `startTime`, `routePolyline`).

Client times are marked provisional until the backend response merges. If the
backend call fails, the client estimate stands and a subtle "times approximate"
note shows; the edit is never lost (it was already persisted client-side).

## Components

### 1. Pure ops layer — `mobile/lib/editItinerary.ts` (new)

Pure functions, `Itinerary → Itinerary`, no I/O, fully unit-tested:

- `removeStop(itin, day, index)`
- `reorderStops(itin, day, fromIndex, toIndex)`
- `moveStopToDay(itin, fromDay, index, toDay)`
- `replaceStop(itin, day, index, newStop)`
- `addStop(itin, day, index, newStop)`
- `scheduleDayClient(day, coords, sunsetMinutes)` → re-timed `ItineraryDay`
  (haversine travel + ported spread/meal logic).

Attraction-vs-meal ordering rules from `buildDaySchedule` are preserved: meals
are re-anchored (lunch target, dinner at sunset), attractions spread between.

### 2. Persistence — `mobile/lib/trips.ts` (extend)

`updateTripItinerary(client, id, itinerary): Promise<void>` — `UPDATE trips SET
itinerary = ... WHERE id = ...`. RLS "own trips" already scopes writes. Every
trip has a row (generate writes `status:ready`), so this covers both saved trips
and the just-generated flow.

**Trip id for the just-generated flow**: `tripFlow` must expose the row id
returned by generate so `itinerary.tsx` can persist edits even before the user
leaves for Home. If the flow does not currently retain the id, add it.

### 3. Backend re-route — `supabase/functions/edit-itinerary/index.ts` (new)

Auth-gated edge fn. Request: `{ tripId, day, dayStops, lodgingPlaceId,
startLocation? }`. Steps: fetch coords for the day's places → Google Routes to
get real leg times + polyline → `buildDaySchedule` → write the day back into the
trip's `itinerary` → return the corrected `ItineraryDay`. Reuses existing
routing + schedule shared code. Concurrency-safe: re-reads the row, replaces
only the target day, writes back.

### 4. Alternatives fetch (for Replace) — reuse `fetchPois`

Replace opens a sheet of candidate attractions near the day's centroid, sourced
from `fetchPois({kind:"attraction", locationBias:{center, radiusKm}})`, minus
place ids already in the itinerary. Picking one calls `replaceStop`.

### 5. Add search — reuse places autocomplete

Add opens a search sheet using the existing autocomplete path
(`placesClient` / `places-autocomplete`) restricted to attraction-ish types,
then `fetchPlaceDetails` for coords, then `addStop`. Diet-aware food add can
come later; v1 add targets attractions.

### 6. UI — `mobile/app/(app)/itinerary.tsx` (extend) + edit affordances

- An **Edit** toggle enters edit mode on the list view.
- In edit mode each stop card gets: drag handle (`react-native-sortables`,
  already a dep — passport uses it), remove (✕), replace ("↻ not this one").
- A per-day **+ Add** row opens the search sheet.
- Cross-day move: long-press → "move to day N" action (simplest reliable
  interaction across sections; full cross-section drag is out of scope v1).
- On each edit: apply pure op → `scheduleDayClient` → render → `updateTripItinerary`
  → fire `edit-itinerary` → merge corrected day on response.
- `edit.tsx` stub is removed or routed into this edit mode (no separate screen).

## Data flow

edit gesture → pure op (`editItinerary.ts`) → `scheduleDayClient` (instant
times) → optimistic render → `updateTripItinerary` (persist) → `edit-itinerary`
edge fn (accurate re-route) → merge day → final render. Reads still flow through
`getTrip` / `tripFlow` unchanged.

## Error handling

- Backend re-route failure → keep client estimate, show "times approximate",
  edit already persisted. No data loss.
- `updateTripItinerary` failure → revert optimistic UI, surface a retry toast.
- Empty day after removing the last stop → allowed; renders the existing
  "limited data" empty state for that day, still editable (can add back).
- Add/replace search failures → sheet shows an error + retry, itinerary
  untouched.

## Testing

- `editItinerary.test.ts` (mobile jest): each pure op returns correct new
  itinerary, immutability (inputs unmutated), `scheduleDayClient` timing/order
  matches `buildDaySchedule` invariants (meals anchored, attractions spread,
  monotonic clock).
- `edit-itinerary/handler_test.ts` (deno): re-route replaces only the target
  day, persists, returns corrected schedule; concurrency (re-read then write).
- `trips` test: `updateTripItinerary` issues the scoped update.
- UI smoke (device, after build): remove/reorder/replace/add all apply
  instantly and survive reload.

## Out of scope (v1)

Full free-form cross-section drag (use "move to day N" instead), editing dates
or trip type here, undo history / multi-step redo, collaborative/edit conflict
UI beyond last-write-wins, diet-aware food *add* (attractions only for add v1).
