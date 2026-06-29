# Itinerary v2: region narrowing, per-place dwell, food separation, start location

Date: 2026-06-28
Status: Approved

## Problem

Five issues with the current generate → itinerary pipeline:

1. **Country/large-state destinations spawn junk itineraries.** Picking "China",
   "India", or "California" biases POI search over an enormous area, mixing
   unrelated cities. Users want to narrow to a region — but only when the place
   is actually big and attraction-dense (California yes, Wyoming no).
2. **Restaurants are treated as attractions.** `handler.ts` merges
   `[...attractions, ...food]` into one pool unconditionally, so restaurants show
   up as primary stops even when the traveler never selected "food". Stops should
   be driven by selected interests; food should be a separate, shorter meal stop.
3. **No per-stop time estimate.** Every stop is weighted equally. A viewpoint
   (~30 min) and a museum (~2 h) look identical, so routing and the day's shape
   are unrealistic.
4. **Routes spawn at a random point.** The route anchor is `lodging[0]` or the
   destination center, so day 1 starts from an arbitrary place instead of the
   traveler's actual origin (home/airport/hotel).
5. **List header overlaps content.** The `SectionList` sticky header ("Day N /
   Stay: …") is transparent, so stop cards scroll visibly under it.

## Goals

- Offer region narrowing when — and only when — the selected place is large and
  attraction-dense. The decision is data-driven (area + LLM judgment), not a
  hardcoded country list.
- Make stops interest-driven; separate food into meal stops with realistic dwell.
- Estimate and persist per-place dwell time, building a reusable dataset.
- Let the traveler set an optional start location that anchors day 1 and the
  final day (return to home/airport).
- Fix the list header overlap.

## Non-goals (deliberate simplifications)

- No full absolute-clock daily schedule. Stops carry dwell + travel minutes and
  meal stops carry a suggested time; we do not compute a minute-by-minute
  timeline for every stop. Add later if needed.
- Region narrowing triggers on `country` and `administrative_area_level_1` only,
  not arbitrary sub-localities.
- Popularity-ranked regions from real user trips — needs a user base. Deferred.
- Timezone for sunset is approximated from longitude (`lng / 15`), not a tz
  database. Ceiling acceptable for a meal-time hint.

## Design

### 1. Region narrowing

**Detection (client).** `searchAutocomplete` already receives a `types` array on
each `placePrediction` but drops it. Surface it:
`{ text, placeId, types }`. When the user selects a suggestion whose `types`
include `"country"` or `"administrative_area_level_1"`, the onboarding location
step calls the new `suggest-regions` edge function.

**Decision + generation (server).** New edge function `suggest-regions`:

- Input: `{ placeId, name }`.
- Cache table `region_suggestions` keyed by `country_place_id`. On hit, return
  cached payload (including an empty list — a cached "not worth narrowing").
- On miss: `fetchPlaceDetails(placeId)` → viewport. Compute area via existing
  `area.ts` haversine. If the area radius is below a threshold
  (`REGION_MIN_RADIUS_KM`, ~60 km), cache and return `[]`.
- Otherwise call the LLM: *"List up to 5 distinct travel regions of {name}, each
  with a one-line hook naming standout attractions. If {name} has few notable
  sub-areas, return an empty array."* The LLM naturally returns regions for
  California and `[]` for Wyoming because it knows attraction density.
- Parse to `{ label, hook }[]`, cache, return.

**Selection (client).** The panel renders only when the response is non-empty:

> This is a big place — narrow it down? *(or Skip)*
> - **Northern California** — Yosemite, San Francisco, redwood coast
> - **Southern California** — Los Angeles, Disneyland, desert parks
> - …

Tapping a region prefills the location input with `label`, clears
`destinationPlaceId`, and re-runs the existing autocomplete so the user picks a
concrete place (which resolves a real `placeId`). "Skip" keeps the whole
country/state. This reuses the existing resolve path; no new geocoding.

### 2. Per-place dwell time

- `Stop` gains `dwellMinutes?: number` and `kind?: "attraction" | "meal" | "meal-gap"`.
- The LLM prompt asks for a realistic `dwellMinutes` per stop (e.g. major museum
  ~120, viewpoint ~30, meal ~60).
- New cache table `place_dwell (place_id pk, minutes int, updated_at)`.
- After curation, for each real stop: `dwell = cached[placeId] ?? llmDwell`; the
  handler upserts any newly-seen estimate. The cache makes regenerations
  deterministic and accumulates a per-place dataset over time. Per-place, not a
  fixed category table — specific places legitimately differ.
- UI shows `~Nh` / `~N min` per stop next to the existing travel time.

### 3. Food separation, interest-driven stops

**Fetch gating (handler).** Food POIs are fetched only when `interests` includes
`"food"`. When food is not selected, the food pool is empty and never reaches the
LLM.

**Prompt.** Rewritten to be interest-priority-aware: prioritize and sequence
attractions matching the selected interests (scenic → scenic spots; scenic +
outdoors → nature/landscape; nightlife → night market / club / late venue;
art → galleries; etc.). When food is selected, ask for up to 2 curated local
meal stops per day (lunch + dinner), tagged `kind: "meal"`, with a short dwell.

**Meal gaps (handler, food NOT selected).** After routing, insert two synthetic
pseudo-stops per day, `kind: "meal-gap"`, no `placeId`, ~60 min dwell:

- **Lunch** — positioned mid-list, suggested time ~12:30 local.
- **Dinner** — positioned at end-of-day (before the return leg), suggested time =
  computed sunset (see §6).

Pseudo-stops have no `placeId`, so they are automatically excluded from routing
(the `byId` lookup filter) and from map markers (the coord filter). They appear
in the list only, reserving time for free-range meal choice.

**Schema.** `validateItinerary` runs on raw LLM output *before* meal-gaps are
inserted, so gaps never trip the `validPlaceIds` check. A meal-gap stop is
allowed to have an empty/absent `placeId`.

### 4. Start location

- `GenerateRequest` gains `startLocation?: string` and `startPlaceId?: string`.
- Onboarding location step adds an optional "Starting point" input
  (home / airport / hotel) using the same autocomplete component.
- The handler resolves start coordinates via `resolveDestination({ placeId:
  startPlaceId, location: startLocation })`.
- Routing anchor per day (`orderStops` already round-trips, origin == destination
  == anchor):
  - **Day 1** → start (if provided).
  - **Last day** → start (returns to home/airport).
  - **Middle days** → `lodging[0]` ?? center, as today.
  - **Single-day trip** → start (out-and-back to start).
  - Start not provided → current behavior unchanged.

### 5. List header overlap

`itinerary.tsx` `renderSectionHeader` gets an opaque screen-background and
vertical padding so stop cards no longer show through the sticky header. Sticky
behavior is retained.

### 6. Sunset timing (solar calculator)

New pure module `solar.ts` implementing the NOAA sunrise/sunset algorithm — no
dependency, no network. `sunsetLocalMinutes(lat, lng, date): number` returns
minutes-from-local-midnight of sunset.

- Input date: server `today + (dayIndex)` (sunset drifts ~1 min/day, so an exact
  trip start date is unnecessary; onboarding does not collect one).
- Timezone: approximated from longitude (`offsetHours = lng / 15`). Marked with a
  `ponytail:` comment naming the ceiling (swap for a tz lookup if precision
  matters).
- The dinner meal-gap's suggested time is set from this value and rendered as
  e.g. "Dinner — around 7:15 PM (sunset)". When food is selected, the LLM's
  dinner stop is left as-is (no sunset label) for v1.

## Data / schema changes

Migration `0002_itinerary_v2.sql`:

```sql
create table if not exists public.region_suggestions (
  country_place_id text primary key,
  payload jsonb not null,            -- [{label, hook}], may be []
  updated_at timestamptz not null default now()
);

create table if not exists public.place_dwell (
  place_id text primary key,
  minutes int not null,
  updated_at timestamptz not null default now()
);

alter table public.region_suggestions enable row level security;
alter table public.place_dwell enable row level security;

create policy "read region suggestions" on public.region_suggestions
  for select using (auth.role() = 'authenticated');
create policy "read place dwell" on public.place_dwell
  for select using (auth.role() = 'authenticated');
-- writes are service-role only (bypasses RLS), matching cached_pois.
```

Type changes (`_shared/types.ts`):

```ts
export interface Stop {
  placeId: string;                 // empty for meal-gap
  name: string;
  blurb: string;
  travelMinutesFromPrev?: number;
  dwellMinutes?: number;
  kind?: "attraction" | "meal" | "meal-gap";
  suggestedTime?: string;          // e.g. "12:30 PM" / sunset, meal stops only
}
```

`GenerateRequest` (`handler.ts` + mobile `api.ts`/`onboarding.ts`):
`+ startLocation?: string; + startPlaceId?: string`.

## Components / boundaries

- `solar.ts` — pure sunset math. In: lat/lng/date. Out: minutes. No deps.
- `suggest-regions/` edge fn + `regions.ts` shared (cache check → area gate →
  LLM → parse). In: placeId/name + deps (details, LLM, cache). Out: `{label,hook}[]`.
- `places.ts::searchAutocomplete` — add `types` to output.
- `llm.ts::buildPrompt` — interest-priority + dwell + meal guidance.
- `handler.ts` — food gating, dwell merge/cache, meal-gap insertion, start anchor.
- `itinerary.tsx` — dwell + meal-gap rendering, opaque header.
- `onboarding.tsx` — region panel, start-location input.

## Testing

- `handler_test.ts`: food fetched only when selected; meal-gaps inserted (2/day,
  no placeId, excluded from routing) when food off; start anchors day 1 + last
  day; dwell merged from cache then upserted.
- `schema_test.ts`: `dwellMinutes` preserved; meal-gap (empty placeId) survives
  insertion path; LLM-output validation still rejects unknown placeIds.
- `regions` unit test: cache hit returns cached; small area → `[]` without LLM;
  large area → LLM regions parsed; malformed LLM → `[]`.
- `solar_test.ts`: sunset for a known lat/lng/date within a few minutes of the
  published value (e.g. San Francisco).
- Mobile: onboarding renders region panel on country selection and start input;
  itinerary renders dwell + meal-gap rows; header opaque.

## Open follow-ups (not in scope)

- Popularity-ranked regions from completed trips.
- Real timezone lookup for sunset.
- Full absolute-clock daily schedule.
- Sunset label on LLM-selected dinner stops (food-selected path).
