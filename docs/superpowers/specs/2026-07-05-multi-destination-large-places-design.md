# Multi-destination trips for large places

**Date:** 2026-07-05
**Status:** Design — approved pending spec review

## Problem

Entering a large place (a country like "Japan", or a big admin region like
"São Paulo, State of São Paulo, Brazil") produces far fewer days than the
requested trip length — "Japan / 7 days" returned **1 day**, São Paulo **4
days**.

Root cause is the POI pipeline, not the LLM. `buildItinerary` does a single
Places `searchText` biased to the destination's **geographic centroid** with a
transport-clamped radius (`areaRadiusKm`: compact 2–5 km, balanced 5–25 km, far
25–150 km). A country's centroid is rural/ocean, so the bias returns a sparse,
low-quality pool. `effectiveTripDays(poolSize, tripDays)` then caps days to
`floor(poolSize / 2)`. The LLM only receives that tiny pool, so it cannot fill a
week no matter what the prompt says.

The geometric multi-leg splitter (`legCenters`, used only for trips > 7 days)
walks the viewport **diagonal**, which for Japan lands in mountains/ocean — also
not where the cities are.

## Goal

For large places, plan across the **real cities** a traveler would actually
visit, chosen by the user, so a week-long trip gets a week of grounded content.
Respect the transport preference. Be honest when a place genuinely can't fill
the days, and give the user a one-tap way to add more.

Non-goal: auto-guessing cities invisibly, or LLM-only itineraries that abandon
real-POI grounding (live hours, ratings, geocoded routing).

## Approach

Reuse the existing `suggestRegions` machinery (LLM → up to 5 real, searchable
sub-cities with geocoded `placeId`s, cached in `region_suggestions`). The user
explicitly picks which sub-destinations to visit; generation fetches a dense POI
pool around each picked **city center** and spreads the trip's days across them.

This turns the existing multi-leg engine (`partitionByNearest`, parallel
per-leg curation, `assignDays`, concatenate) from geometric guesses into
user-chosen real cities.

## User flow

1. **Destination step** (existing) — user searches and picks a place.
2. On **Continue**, if the picked place resolves sub-destinations
   (`suggestRegions` non-empty — the existing radius ≥ `REGION_MIN_RADIUS_KM` =
   60 km gate), advance to the new **sub-destination step**. Otherwise skip it
   and continue to dates as today.
3. **Sub-destination step** ("Where in {place}?") — a **multi-select** list of
   the sub-cities, each with its one-line hook. At least one required to
   continue. Picks are ordered by selection.

Ranging across a region is now **user-driven** (pick multiple cities here, or
add more later via the can't-fill affordance) rather than an automatic
transport side effect. Transport preference only tunes each city's internal
radius (below).
4. Rest of onboarding unchanged. `Generate` sends the picks.

The current **inline single-select** "Big place — narrow it down?" block on the
destination step is **removed** — replaced entirely by this step. (`regions`
state, its fetch on placeId selection, and its render block move to the new
step.)

### Can't-fill affordance

If the generated trip's day count comes back **less than requested**, the
itinerary screen shows a short honest note ("We built N days of great content —
not enough nearby for M.") plus **"Add a destination"** chips listing the
sub-destinations the user did *not* pick (from the same cached region list).
Tapping one adds it to `subDestinations` and regenerates. If no unpicked
regions remain, show the note without chips.

## Data flow / contract changes

### `GenerateRequest` (mobile `lib/api.ts` + backend `handler.ts`)

Add optional field, backward-compatible:

```ts
subDestinations?: { placeId: string; label: string }[];
```

- Absent / empty → current single-center behavior, untouched.
- Present → multi-city path (below). `location` stays the parent label (for
  display / the trips row); `destinationPlaceId` stays the parent.

### `OnboardingState` (mobile `lib/onboarding.ts`)

- Add `subDestinations: { placeId: string; label: string }[]` (default `[]`).
- `buildRequest` includes it. `stateFromRequest` rehydrates it (edit-in-progress
  survives remount).
- New `STEPS` entry `"subDestinations"` inserted immediately after
  `"destination"`. All step targets already derive by name
  (`STEPS.indexOf(...)`), so insertion is safe.

### Step skip logic

The sub-destination step is conditional:
- Continuing **from** `destination`: if `regions.length === 0`, skip the
  sub-destination step (advance by 2). If regions exist, advance by 1 into it.
- Entering the sub-destination step directly (e.g. via back) with no regions
  loaded → auto-skip in the same direction.
- `canContinue("subDestinations")` → `subDestinations.length >= 1`.
- Back button from the step returns to `destination`.

Region fetch moves to fire when the user picks a large-place `placeId` on the
destination step (as it does today), storing `regions`; the new step renders
from that state.

## Backend: `buildItinerary` multi-city path

When `subDestinations` is present, every picked city is visited (the user chose
them). Transport preference only sizes each city's POI radius —
`compact` tight (walkable, ~2–5 km), `balanced`/`far` wider — via
`areaRadiusKm({ viewport: cityViewport, transport })`. It does **not** decide
whether to spread; the picks already did.

1. **Centers** — geocode each picked `placeId` via `fetchPlaceDetails` →
   `{ center, viewport }`. Each city is one leg, in pick order.
2. **Day allocation** — split `tripDays` across the picked cities with a
   balanced split (reuse `planLegs`' remainder logic: 7 days / 3 cities →
   `[3,2,2]`). A city allotted `d` days.
3. **POI pool per city** — `fetchPois` biased to the *city's* center with
   `areaRadiusKm({ viewport: cityViewport, transport })` (city-scale, dense),
   not the country centroid. Dedupe globally across cities (existing `seenIds`).
4. **Per-city curation** — curate each city's pool for its allotted days
   (existing parallel per-leg curation + validation).
5. **Sparse city** — `effectiveTripDays(cityPool, allottedDays)` caps that
   city's days (never fails the whole trip). Total may fall below `tripDays` →
   triggers the can't-fill affordance.
6. **Days assembled** — `assignDays` per city (city center as anchor; start
   location anchors day 1 of the first city only), concatenate in pick order,
   renumber sequentially. Routing/meals/schedule unchanged downstream.

`compact` with multiple picks still visits the picked cities (the user asked
for them) but keeps each city's internal radius tight and does not widen legs.

The geometric `legCenters` diagonal path remains for the **single-destination,
long-trip** case (no `subDestinations`, `tripDays > MAX_LEG_DAYS`) — unchanged.

## Components / boundaries

- **`mobile/components/onboarding/SubDestinationStep.tsx`** (new) — multi-select
  list; props: `regions: Region[]`, `selected: {placeId,label}[]`, `onToggle`.
  Pure presentational, testable without the screen.
- **`mobile/lib/onboarding.ts`** — state, `STEPS`, `canContinue`, `buildRequest`,
  `stateFromRequest` extended for `subDestinations`. Unit-tested.
- **`mobile/app/(app)/onboarding.tsx`** — wires the step, skip logic, removes
  inline narrowing.
- **`mobile/app/(app)/itinerary.tsx`** — can't-fill note + "Add a destination"
  chips + regenerate.
- **`supabase/functions/generate-itinerary/handler.ts`** + **`_shared`** —
  multi-city path in `buildItinerary`; day-allocation helper (extend `legs.ts`).
  Deno-tested.

## Testing

- `legs.ts`: day-allocation split across N cities (even, remainder, single city).
- `handler.ts` / `buildItinerary`: with `subDestinations` → per-city fetch called
  with each city center; days concatenated & renumbered; sparse city caps its
  own days without failing the trip; empty `subDestinations` → unchanged path.
- `onboarding.ts`: `canContinue("subDestinations")`, `buildRequest` /
  `stateFromRequest` round-trip, step-index integrity after insertion.
- `SubDestinationStep`: toggle select/deselect.
- Manual device smoke: Japan 7-day → sub-select → multi-city week; small city →
  step skipped; capped trip → add-destination chip regenerates.

## Rollout

- Backend change is backward-compatible (optional field) — deploy
  `generate-itinerary` independently.
- Mobile changes need a new EAS build (new screen, onboarding logic).

## Open risks / ceilings

- `suggestRegions` LLM latency adds ~1 call on Continue for large places
  (cached after first). Acceptable; already used inline today.
- Day allocation is a flat even split, not interest-weighted — ponytail: upgrade
  to weight days by each city's pool size / rating if trips feel lopsided.
- Leg order is pick order, not geographically optimized — acceptable; the user
  chose the cities.
