# Itinerary: deterministic meals + absolute clock timeline

**Date:** 2026-06-29
**Branch:** feat/itinerary-v3-drive-budget-meals-fixes
**Status:** approved (model locked)

## Problem

Two defects in the generated itinerary, plus a UX gap:

1. **Food preference is leaky.** When the user selects "food", food POIs are merged
   into the same pool the LLM curates for attractions. The LLM marks *some* of them
   `kind:"meal"`, then geography re-clustering (`assignDays`) reshuffles stops, so meal
   coverage is random: some days get a real meal stop, some get free-range "your pick"
   gap slots, some get both. Result reported by user: food selected, still seeing
   free-range lunch/dinner gaps.

2. **Meals pollute the stop count.** Food stops chosen by the LLM count against the
   pace budget (compact 2-3 / balanced 4-5 / packed 6-8). The user wants meals to be
   *add-ons*: lunch + dinner sit on top of the schedule and never reduce the number of
   attraction stops.

3. **No real clock.** Stops carry `dwellMinutes` + `travelMinutesFromPrev` but no
   absolute time. The day "eyeballs" timing; meals get a hardcoded `suggestedTime`.

## Goal

- **Food ON** → each day's 2 meal slots are filled with real nearby restaurants
  (deterministic, no LLM), in place of the free-range gaps.
- **Food OFF** → each day's 2 meal slots are free-range gaps ("your pick"), as today.
- **Either way** → every day gets exactly lunch + dinner; meals never count against the
  attraction stop budget.
- **Absolute clock timeline** → every stop carries a real start time, computed
  cumulatively from a fixed day start with a travel-time buffer; meals soft-anchored to
  lunch (~12:30) and local sunset.

## Research basis

Tour-operator practice (Softrip, Mayflower, Xola) and digital planners (Wanderlog):
- 2-3 anchor activities/day; meals **punctuate** the day, not counted as activities.
- Buffer **+20% on transit**, ~15-30 min slack per activity, ≥1 flexible hour/day.
- "Don't make it rigid."
- Digital apps show **absolute start times** per stop with auto travel-time, fixed times
  only for reservations.

Conclusion → **cumulative clock + flowing stops + soft-anchored meals + 20% travel
buffer.** Not rigid-forced (operators say don't), not pure-loose (apps show real clock
near real meal times). Meals inserted at the natural stop-boundary nearest their target
window.

## Design

### Data model (`supabase/_shared/types.ts`)

`Stop` gains:
- `startTime?: string` — absolute clock, e.g. `"9:00 AM"`, on **every** stop.
- `mealSlot?: "lunch" | "dinner"` — drives the UI meal label, set on meal + meal-gap stops.

`suggestedTime` is removed (superseded by `startTime`).
`kind` stays `"attraction" | "meal" | "meal-gap"`:
- `"meal"` = real restaurant. Has a `placeId` → routes + maps.
- `"meal-gap"` = free-range. No `placeId`.

### Backend pipeline (`supabase/functions/generate-itinerary/handler.ts`)

Order of operations:

1. **Fetch POIs.** Unchanged, except food POIs are kept in a **separate** list and are
   NOT merged into the LLM pool. `pois` passed to `curate` = attractions only. (Food
   fetch still gated on `wantsFood`, still degrades to `[]` on failure.)
2. **Curate** attractions only → LLM picks attraction stops + blurbs + dwell. Pace
   budget now applies cleanly to attractions.
3. **Cluster** attractions into days (`assignDays`) — unchanged.
4. **Route** attractions per day (`orderStops`, attractions only) — unchanged. Meals do
   NOT participate in the optimized route (avoids the optimizer reordering a meal out of
   its time slot). Real meal stops still map via their own marker; they get a small flat
   travel estimate, not a routed leg.
5. **Dwell** caching — unchanged.
6. **Schedule** (new step, replaces the current meal-gap injection at handler.ts:152-161):
   for each day, call the new `buildDaySchedule` (below) with the day's ordered
   attractions, the day's sunset minutes, and a meal-filler resolver.

### Meal filler resolver (new, in handler)

For each day, given the day's stops' coordinates:
- Compute the day's centroid (mean lat/lng of its attractions; fallback to dest center).
- **Food ON:** pick the nearest-highest-rated food POI to the centroid for lunch, then
  for dinner, skipping any food `placeId` already used on a prior day (dedup via a Set).
  Score = rating primary, proximity (`haversineKm`) tiebreak; cheap and deterministic.
  Each becomes a `kind:"meal"` stop (real `placeId`, name = restaurant name, dwell 60).
- **Food OFF, or no food POI left for a slot:** free-range `kind:"meal-gap"` stop
  (`placeId:""`, name `"Lunch — your pick"` / `"Dinner — your pick"`, dwell 60). Same
  graceful fallback the handler does today.

### Clock builder (new pure module `supabase/_shared/schedule.ts`)

```
buildDaySchedule(opts: {
  attractions: Stop[];          // ordered, with dwellMinutes + travelMinutesFromPrev
  sunsetMinutes: number;        // local sunset, from solar.ts
  lunch: Stop;                  // resolved filler (meal or meal-gap), no time yet
  dinner: Stop;                 // resolved filler, no time yet
}): Stop[]                      // ordered stops, each with startTime, meals inserted
```

Algorithm (pure, deterministic, unit-tested):
- `DAY_START_MIN = 9 * 60` (540). Calibration knob.
- `TRAVEL_BUFFER = 1.2` (the +20% operator rule). Calibration knob.
- `MEAL_TRAVEL_MIN = 10` (flat "find a nearby spot" leg for meals). Calibration knob.
- `LUNCH_TARGET_MIN = 12 * 60 + 30` (750). Calibration knob.
- Walk attractions in order, accumulating `clock`:
  - `clock += travelMinutesFromPrev * TRAVEL_BUFFER` (skip for first stop of day).
  - Before placing the next attraction, if lunch not yet inserted **and**
    `clock >= LUNCH_TARGET_MIN - 30` (i.e. we've reached ~noon at a natural boundary),
    insert lunch here: `lunch.startTime = clock`, `clock += MEAL_TRAVEL_MIN + 60`.
  - Same rule for dinner against `sunsetMinutes`.
  - Place attraction: `stop.startTime = clock`, `clock += dwellMinutes`.
- After the loop, any meal not yet inserted (day too short to reach its window) is
  appended at the end with its target time (lunch at its target, dinner at sunset).
- Returns the merged ordered list. `formatClock` (existing in solar.ts) renders strings.

This keeps geography/routing for attractions untouched and layers time + meals on top.

### Prompt (`supabase/_shared/llm.ts`)

Remove the `wantsFood` block that tells the LLM to include 2 food stops marked
`kind:"meal"`. The LLM no longer sees or picks food. Pace line stays (attractions only).

### Mobile (`mobile/app/(app)/itinerary.tsx`, `mobile/lib/poi.ts`)

- Render `startTime` as the clock-led left element of each stop card (timeline feel).
- Meal cards (both `meal` and `meal-gap`): header label from `mealSlot`
  ("Lunch" / "Dinner"); real meals also show the restaurant name. Real meals (`meal`,
  have `placeId`) appear in the coord fetch; gaps don't.
- `numberStops` extends its skip to `kind === "meal"` as well as `meal-gap`, so meals
  aren't numbered in the attraction sequence.
- **Map markers:** attraction markers stay numbered (from `numberStops`). Real meal
  stops get their own marker built separately, labeled by `mealSlot` ("Lunch — Joe's")
  rather than a number — so they show on the map without consuming an attraction number.
  Meal markers are not part of the routed polyline (meals don't participate in routing).
- Replace `suggestedTime` reads with `startTime`.

## Testing

- `schedule_test.ts` (new, pure): start times monotonic; first stop at 9:00; travel
  buffer applied (×1.2); lunch lands in the noon window; dinner near sunset; short day
  appends unreached meals at target.
- `handler_test.ts` (extend):
  - Food ON → meal stops are real restaurants (`kind:"meal"`, non-empty placeId), not
    gaps; restaurants deduped across days; attraction count == pace budget (food does
    not inflate it).
  - Food OFF → `meal-gap` stops present; lunch + dinner every day.
  - Meal slots never counted in the attraction pool sent to `curate`.

## Out of scope

- **Home screen redesign** — separate brainstorm after this ships (user's sequencing).
- Travel-day modeling (partial first/last day arrival/departure) — every day treated as
  a full day. Add later if needed.
- Breakfast slot — only lunch + dinner per user spec.
- Per-restaurant reservation / fixed-time support — meals are soft-anchored only.
