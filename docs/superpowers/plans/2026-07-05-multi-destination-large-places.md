# Multi-destination trips for large places — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For large places (countries, big admin regions), let the user pick which real cities to visit so a week-long trip gets a week of grounded content instead of collapsing to 1–4 days.

**Architecture:** Reuse the existing `suggestRegions` machinery (LLM → up to 5 real geocoded sub-cities, cached). A new onboarding step lets the user multi-select cities. `buildItinerary` gains a multi-city path: geocode each picked city, fetch a dense city-scale POI pool per city, split the trip's days across cities (each a leg), concatenate. Backward-compatible optional `subDestinations` field; absent → current single-center path untouched. An itinerary-screen "Add a destination" affordance regenerates with an extra city when days fall short.

**Tech Stack:** React Native / Expo (mobile), Deno edge functions (Supabase), TypeScript throughout. Tests: jest (mobile), `deno test` (backend).

## Global Constraints

- `subDestinations` field is **optional and backward-compatible** on both `GenerateRequest` interfaces (mobile `lib/api.ts`, backend `handler.ts`). Absent/empty → existing single-center behavior, byte-for-byte unchanged.
- `location` stays the **parent** label; `destinationPlaceId` stays the **parent** placeId. `subDestinations` is additive.
- The new `"subDestinations"` STEPS entry goes **immediately after `"destination"`**. All step targets derive by name via `STEPS.indexOf(...)` — insertion must not break them.
- Region gate is the existing one: `suggestRegions` returns non-empty only when the place's radius ≥ `REGION_MIN_RADIUS_KM` (60 km). No new gate.
- Backend deploys independently (optional field). Mobile needs a new EAS build (new native? no — but new screen/logic) — device smoke is a separate gated task.
- Accent color `#E11D48`, existing `ui/` component set, NativeWind classNames — match surrounding onboarding code exactly.

---

### Task 1: `allocateDays` — split trip days across N cities

**Files:**
- Modify: `supabase/_shared/legs.ts`
- Test: `supabase/_shared/legs_test.ts` (add cases; create if absent)

**Interfaces:**
- Consumes: nothing new.
- Produces: `allocateDays(tripDays: number, n: number): number[]` — length `n`, sums to `tripDays`, sizes differ by ≤1, earlier cities get the remainder. `n < 1` → `[]`.

- [ ] **Step 1: Write the failing test**

Add to `supabase/_shared/legs_test.ts`:

```ts
import { allocateDays } from "./legs.ts";
import { assertEquals } from "https://deno.land/std/assert/mod.ts";

Deno.test("allocateDays: even split", () => {
  assertEquals(allocateDays(6, 3), [2, 2, 2]);
});
Deno.test("allocateDays: remainder goes to earlier cities", () => {
  assertEquals(allocateDays(7, 3), [3, 2, 2]);
});
Deno.test("allocateDays: single city gets all days", () => {
  assertEquals(allocateDays(7, 1), [7]);
});
Deno.test("allocateDays: more cities than days still gives each >=1 where possible", () => {
  // 2 days across 3 cities: [1,1,0] — a 0-day city is dropped upstream.
  assertEquals(allocateDays(2, 3), [1, 1, 0]);
});
Deno.test("allocateDays: n<1 returns empty", () => {
  assertEquals(allocateDays(5, 0), []);
});
```

Match the existing import style in `legs_test.ts` if it differs (check the top of the file first).

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/_shared/legs_test.ts`
Expected: FAIL — `allocateDays` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `supabase/_shared/legs.ts` (near `planLegs`, same balanced-split shape):

```ts
// Split tripDays across exactly n cities: base each, earlier cities take the
// remainder. n<1 → []. A city allotted 0 (more cities than days) is dropped by
// the caller before curation.
export function allocateDays(tripDays: number, n: number): number[] {
  if (n < 1) return [];
  const base = Math.floor(tripDays / n);
  const rem = tripDays % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/_shared/legs_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/legs.ts supabase/_shared/legs_test.ts
git commit -m "feat(legs): allocateDays splits trip days across N picked cities"
```

---

### Task 2: `buildItinerary` multi-city path + backend `subDestinations` field

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts` (`GenerateRequest` interface + `buildItinerary`)
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Consumes: `allocateDays` (Task 1); existing `deps.resolveDestination`, `deps.fetchPois`, `areaRadiusKm`, `effectiveTripDays`.
- Produces: `buildItinerary` honoring `body.subDestinations?: { placeId: string; label: string }[]`. Present → one leg per geocoded city, city-scale POI pool per city, `allocateDays` day split, per-city `effectiveTripDays` cap, days concatenated & renumbered. Absent/empty → unchanged path.

- [ ] **Step 1: Write the failing test**

Add to `handler_test.ts` (reuse the file's existing `baseDeps`/`prefs` helpers — read the top of the file to match them):

```ts
Deno.test("multi-city: fetches a pool per picked city center and concatenates days", async () => {
  const centersSeen: { lat: number; lng: number }[] = [];
  const deps = baseDeps({
    // Geocode: city A at (1,1), city B at (2,2).
    resolveDestination: ({ placeId }: any) =>
      Promise.resolve(
        placeId === "A" ? { center: { lat: 1, lng: 1 }, viewport: { low: { lat: 0.9, lng: 0.9 }, high: { lat: 1.1, lng: 1.1 } } }
        : placeId === "B" ? { center: { lat: 2, lng: 2 }, viewport: { low: { lat: 1.9, lng: 1.9 }, high: { lat: 2.1, lng: 2.1 } } }
        : { center: { lat: 0, lng: 0 }, viewport: null },
      ),
    fetchPois: (o: any) => {
      if (o.kind === "attraction" && o.locationBias) centersSeen.push(o.locationBias.center);
      if (o.kind === "lodging") return Promise.resolve([]);
      // 4 attractions clustered at whichever city center we were biased to.
      const c = o.locationBias?.center ?? { lat: 0, lng: 0 };
      return Promise.resolve(Array.from({ length: 4 }, (_, i) => ({
        placeId: `${c.lat}-${i}`, name: `P${i}`, kind: "attraction", lat: c.lat, lng: c.lng,
      })));
    },
  });
  const itin = await buildItinerary(
    { location: "Japan", tripDays: 4, prefs,
      destinationPlaceId: "JP",
      subDestinations: [{ placeId: "A", label: "Tokyo" }, { placeId: "B", label: "Kyoto" }] },
    deps,
  );
  // Both city centers were used to bias attraction fetches.
  const lats = centersSeen.map((c) => c.lat).sort();
  assertEquals(lats, [1, 2]);
  // 4 days requested, 2 cities → 2 days each, concatenated & renumbered 1..4.
  assertEquals(itin.days.map((d) => d.day), [1, 2, 3, 4]);
});

Deno.test("multi-city: empty subDestinations uses the single-center path", async () => {
  let biasedCenters = 0;
  const deps = baseDeps({
    resolveDestination: () => Promise.resolve({ center: { lat: 5, lng: 5 }, viewport: null }),
    fetchPois: (o: any) => { if (o.locationBias) biasedCenters++; return Promise.resolve(
      o.kind === "lodging" ? [] : [{ placeId: "X", name: "X", kind: o.kind, lat: 5, lng: 5 }]); },
  });
  const itin = await buildItinerary(
    { location: "Paris", tripDays: 1, prefs, destinationPlaceId: "P", subDestinations: [] }, deps);
  assertEquals(itin.days.length, 1); // unchanged single-dest behavior
});

Deno.test("multi-city: a city returning no POIs is dropped, trip still builds shorter", async () => {
  const deps = baseDeps({
    resolveDestination: ({ placeId }: any) => Promise.resolve(
      placeId === "A" ? { center: { lat: 1, lng: 1 }, viewport: null }
      : { center: { lat: 2, lng: 2 }, viewport: null }),
    fetchPois: (o: any) => {
      if (o.kind === "lodging") return Promise.resolve([]);
      const c = o.locationBias?.center;
      // City A (lat 1) has POIs; city B (lat 2) is barren.
      if (c?.lat === 2) return Promise.resolve([]);
      return Promise.resolve(Array.from({ length: 4 }, (_, i) => ({
        placeId: `A-${i}`, name: `A${i}`, kind: "attraction", lat: 1, lng: 1 })));
    },
  });
  const itin = await buildItinerary(
    { location: "Japan", tripDays: 4, prefs, destinationPlaceId: "JP",
      subDestinations: [{ placeId: "A", label: "Tokyo" }, { placeId: "B", label: "Nowhere" }] }, deps);
  // Only city A survives → fewer than 4 days, but no crash.
  assertEquals(itin.days.length >= 1 && itin.days.length < 4, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: FAIL — `subDestinations` unknown / single-center path used for all.

- [ ] **Step 3: Add the field to `GenerateRequest`**

In `handler.ts`, extend the interface (around line 22):

```ts
export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
  subDestinations?: { placeId: string; label: string }[];
  startLocation?: string;
  startPlaceId?: string;
  startDate?: string;   // ISO YYYY-MM-DD
  endDate?: string;
  tripType?: TripType;  // default "round"
}
```

Update the import on line 6 to include `allocateDays`:

```ts
import { planLegs, legCenters, partitionByNearest, splitRoundRobin, effectiveTripDays, allocateDays } from "../../_shared/legs.ts";
```

- [ ] **Step 4: Branch `buildItinerary` on `subDestinations`**

In `buildItinerary`, the current code (lines ~66–121) does: one `Promise.all` fetching `attractionPools`+`food`+`lodging`, then dedupe → `pois`, then replan → `finalLegSizes`/`finalCenters`/`finalMultiLeg`/`legPools`. Restructure so food/lodging fetch always runs, and attraction pools + leg plan come from a branch.

Replace the block from the `wantsFood` fetch (line ~66) through the `legPools = [pois]` reassignment (line ~121) with:

```ts
  const wantsFood = body.prefs.interests.includes("food");
  // Food and lodging are region-wide enrichments (parent bias), fetched in
  // parallel with the attraction work below. A flaky call degrades to [].
  const foodP = wantsFood
    ? deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs, locationBias }).catch(() => [] as Poi[])
    : Promise.resolve([] as Poi[]);
  const lodgingP = deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs, locationBias }).catch(() => [] as Poi[]);

  // Start location is optional; a bad placeId shouldn't sink the trip.
  const start = (body.startPlaceId || body.startLocation)
    ? await deps.resolveDestination({ placeId: body.startPlaceId, location: body.startLocation ?? "" }).catch(() => null)
    : null;
  const startCenter = start && (start.center.lat !== 0 || start.center.lng !== 0) ? start.center : null;

  // --- Attraction pools + leg plan ---
  let pois: Poi[];
  let finalLegSizes: number[];
  let legPools: Poi[][];
  let finalMultiLeg: boolean;

  const picks = body.subDestinations ?? [];
  if (picks.length > 0) {
    // Multi-city: the user chose the cities. Each is one leg — geocode its
    // center, fetch a dense city-scale pool, split the days across the cities.
    const geos = await Promise.all(picks.map((p) =>
      deps.resolveDestination({ placeId: p.placeId, location: p.label }).catch(() => null)));
    const cities = picks
      .map((p, i) => ({ p, geo: geos[i] }))
      .filter((c): c is { p: { placeId: string; label: string }; geo: { center: { lat: number; lng: number }; viewport: Viewport } } =>
        !!c.geo && (c.geo.center.lat !== 0 || c.geo.center.lng !== 0));
    const allotted = allocateDays(body.tripDays, cities.length || 1);
    const rawPools = await Promise.all(cities.map((c) =>
      deps.fetchPois({
        location: c.p.label, kind: "attraction", prefs: body.prefs,
        locationBias: { center: c.geo.center, radiusKm: areaRadiusKm({ viewport: c.geo.viewport, transport: body.prefs.transport }) },
      }).catch(() => [] as Poi[])));
    // Dedupe globally, keeping each city's pool disjoint (first city keeps a shared place).
    const seen = new Set<string>();
    const disjoint = rawPools.map((pool) => {
      const out: Poi[] = [];
      for (const p of pool) if (!seen.has(p.placeId)) { seen.add(p.placeId); out.push(p); }
      return out;
    });
    // Drop cities that returned nothing; cap each survivor's days to its pool.
    const kept = disjoint
      .map((pool, i) => ({ pool, days: effectiveTripDays(pool.length, allotted[i]) }))
      .filter((k) => k.pool.length > 0);
    legPools = kept.map((k) => k.pool);
    finalLegSizes = kept.map((k) => k.days);
    finalMultiLeg = legPools.length > 1;
    pois = legPools.flat();
    // Every picked city came back empty (all Places calls failed) → fall back to
    // the parent single-center pool so the trip still builds rather than 500-ing.
    if (legPools.length === 0) {
      const pool = await deps.fetchPois({ location: body.location, kind: "attraction", prefs: body.prefs, locationBias });
      pois = pool;
      finalLegSizes = [effectiveTripDays(pool.length, body.tripDays)];
      legPools = [pool];
      finalMultiLeg = false;
    }
  } else {
    // Single-destination path (unchanged): fetch around the destination centroid,
    // then re-plan geometric legs from the pool we actually got.
    const legSizes = planLegs(body.tripDays);
    const centers = legCenters({ center: dest.center, viewport: dest.viewport, legs: legSizes.length, tripType });
    const multiLeg = legSizes.length > 1;
    // ponytail: leg bias radius = region radius / legs, floor 10km.
    const legRadiusKm = Math.max(radiusKm / legSizes.length, 10);
    const attractionPools = await Promise.all(centers.map((c) =>
      deps.fetchPois({
        location: body.location, kind: "attraction", prefs: body.prefs,
        locationBias: hasCenter ? { center: c, radiusKm: multiLeg ? legRadiusKm : radiusKm } : undefined,
      })));
    const seenIds = new Set<string>();
    pois = [];
    for (const pool of attractionPools) {
      for (const p of pool) if (!seenIds.has(p.placeId)) { seenIds.add(p.placeId); pois.push(p); }
    }
    const plannedDays = effectiveTripDays(pois.length, body.tripDays);
    finalLegSizes = planLegs(plannedDays);
    if (pois.length < 8 * finalLegSizes.length) finalLegSizes = [plannedDays];
    const finalCenters = legCenters({ center: dest.center, viewport: dest.viewport, legs: finalLegSizes.length, tripType });
    finalMultiLeg = finalLegSizes.length > 1;
    legPools = finalMultiLeg
      ? (hasCenter ? partitionByNearest(pois, finalCenters) : splitRoundRobin(pois, finalLegSizes.length))
      : [pois];
    if (finalMultiLeg && legPools.some((p, i) => p.length < finalLegSizes[i])) {
      finalLegSizes = [plannedDays];
      finalMultiLeg = false;
      legPools = [pois];
    }
  }

  const [food, lodging] = await Promise.all([foodP, lodgingP]);
```

Delete the now-superseded lines: the old `const legSizes`/`multiLeg`/`centers`/`legRadiusKm` at ~60–64, the old combined `Promise.all([...])` fetch, the old `start`/`startCenter`, the old dedupe loop, and the old replan block. The downstream (`anchorPoi`, per-leg curation `legItins`, `assignDays` loop, routing, dwell, meals) is unchanged — it already reads `pois`, `legPools`, `finalLegSizes`, `finalMultiLeg`, `startCenter`.

> Note: the single-dest `else` branch above declares `finalCenters` locally (only used to build `legPools`); the multi-city branch doesn't need it. Verify no downstream code references `finalCenters` (it doesn't — the `assignDays` loop uses `coordsById`/`startCenter`, not leg centers).

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts supabase/_shared/legs_test.ts`
Expected: PASS — new multi-city tests green, all existing single-dest tests still green.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(generate): multi-city itinerary path for user-picked sub-destinations"
```

---

### Task 3: Mobile contract — `subDestinations` in state, request, steps, skip logic

**Files:**
- Modify: `mobile/lib/api.ts` (`GenerateRequest`)
- Modify: `mobile/lib/onboarding.ts` (`OnboardingState`, `STEPS`, `canContinue`, `buildRequest`, `stateFromRequest`, new `resolveStep`)
- Test: `mobile/lib/onboarding.test.ts`

**Interfaces:**
- Produces:
  - `GenerateRequest.subDestinations?: { placeId: string; label: string }[]` (mobile).
  - `OnboardingState.subDestinations: { placeId: string; label: string }[]` (default `[]`).
  - `STEPS` includes `"subDestinations"` immediately after `"destination"`.
  - `canContinue(step, s)` for `subDestinations` → `s.subDestinations.length >= 1`.
  - `buildRequest` includes `subDestinations` only when non-empty (backward-compat).
  - `stateFromRequest` rehydrates `subDestinations` (default `[]`).
  - `resolveStep(target: number, hasRegions: boolean, dir: 1 | -1): number` — if `STEPS[target] === "subDestinations"` and `!hasRegions`, returns `target + dir`, else `target`. Screen uses it to skip the conditional step in both directions.

- [ ] **Step 1: Write the failing test**

Add to `mobile/lib/onboarding.test.ts` (match its existing import/test style):

```ts
import {
  STEPS, canContinue, buildRequest, stateFromRequest, resolveStep, stateFromProfile,
} from "./onboarding";

const baseState = () => ({ ...stateFromProfile(null), location: "Japan", destinationPlaceId: "JP", startDate: "2026-08-01", endDate: "2026-08-07" });

test("subDestinations step sits immediately after destination", () => {
  expect(STEPS[STEPS.indexOf("destination") + 1]).toBe("subDestinations");
});

test("canContinue(subDestinations) requires at least one pick", () => {
  const step = STEPS.indexOf("subDestinations");
  expect(canContinue(step, { ...baseState(), subDestinations: [] })).toBe(false);
  expect(canContinue(step, { ...baseState(), subDestinations: [{ placeId: "A", label: "Tokyo" }] })).toBe(true);
});

test("buildRequest omits subDestinations when empty, includes when set", () => {
  expect(buildRequest({ ...baseState(), subDestinations: [] }).subDestinations).toBeUndefined();
  const picks = [{ placeId: "A", label: "Tokyo" }];
  expect(buildRequest({ ...baseState(), subDestinations: picks }).subDestinations).toEqual(picks);
});

test("stateFromRequest round-trips subDestinations (default [])", () => {
  const picks = [{ placeId: "A", label: "Tokyo" }];
  const req = buildRequest({ ...baseState(), subDestinations: picks });
  expect(stateFromRequest(req).subDestinations).toEqual(picks);
  const bare = buildRequest({ ...baseState(), subDestinations: [] });
  expect(stateFromRequest(bare).subDestinations).toEqual([]);
});

test("resolveStep skips subDestinations when no regions, keeps it when regions exist", () => {
  const sd = STEPS.indexOf("subDestinations");
  expect(resolveStep(sd, false, 1)).toBe(sd + 1); // forward skip past it
  expect(resolveStep(sd, false, -1)).toBe(sd - 1); // backward skip past it
  expect(resolveStep(sd, true, 1)).toBe(sd);       // land on it when regions exist
  expect(resolveStep(STEPS.indexOf("dates"), false, 1)).toBe(STEPS.indexOf("dates")); // non-target untouched
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL — `resolveStep` undefined, `subDestinations` not on state/request, step missing.

- [ ] **Step 3: Implement**

In `mobile/lib/api.ts`, add to `GenerateRequest` (after `destinationPlaceId`):

```ts
  subDestinations?: { placeId: string; label: string }[];
```

In `mobile/lib/onboarding.ts`:

Insert `"subDestinations"` into `STEPS` right after `"destination"`:

```ts
  "destination", "subDestinations", "dates", "classics", "interests", "travelParty",
```

Add to `OnboardingState`:

```ts
  subDestinations: { placeId: string; label: string }[];
```

Add `subDestinations: []` to the object returned by `stateFromProfile`.

Rehydrate in `stateFromRequest` (inside the returned object):

```ts
    subDestinations: req.subDestinations ?? [],
```

Add the `canContinue` case (before `default`):

```ts
    case "subDestinations": return s.subDestinations.length >= 1;
```

Include in `buildRequest` (only when non-empty):

```ts
    subDestinations: s.subDestinations.length ? s.subDestinations : undefined,
```

Add the pure step-skip helper (near `canContinue`):

```ts
// The subDestinations step is conditional on the picked place resolving regions.
// When it doesn't, skip past it in whichever direction we're moving.
export function resolveStep(target: number, hasRegions: boolean, dir: 1 | -1): number {
  return STEPS[target] === "subDestinations" && !hasRegions ? target + dir : target;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS (screen wiring in Task 5 may reference the new state — if tsc flags `onboarding.tsx`, that's fixed in Task 5; run this again there).

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/api.ts mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts
git commit -m "feat(onboarding): subDestinations in state/request/steps + resolveStep skip"
```

---

### Task 4: `SubDestinationStep` component (multi-select list)

**Files:**
- Create: `mobile/components/onboarding/SubDestinationStep.tsx`
- Test: `mobile/components/onboarding/SubDestinationStep.test.tsx`

**Interfaces:**
- Consumes: `Region` from `../../lib/placesClient` (`{ label: string; hook: string; placeId: string }`).
- Produces:
  ```ts
  export function SubDestinationStep(props: {
    regions: Region[];
    selected: { placeId: string; label: string }[];
    onToggle: (r: { placeId: string; label: string }) => void;
  }): JSX.Element
  ```
  Pure presentational — renders one `PressableScale` per region, selected ones visually marked, tapping calls `onToggle`.

- [ ] **Step 1: Write the failing test**

`mobile/components/onboarding/SubDestinationStep.test.tsx` (match the test setup other component tests use — `@testing-library/react-native`):

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import { SubDestinationStep } from "./SubDestinationStep";

const regions = [
  { placeId: "A", label: "Tokyo", hook: "Neon and temples" },
  { placeId: "B", label: "Kyoto", hook: "Old capital" },
];

test("renders every region and toggles on tap", () => {
  const onToggle = jest.fn();
  const { getByText } = render(
    <SubDestinationStep regions={regions} selected={[]} onToggle={onToggle} />,
  );
  getByText("Tokyo");
  getByText("Kyoto");
  fireEvent.press(getByText("Kyoto"));
  expect(onToggle).toHaveBeenCalledWith({ placeId: "B", label: "Kyoto" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest components/onboarding/SubDestinationStep.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`mobile/components/onboarding/SubDestinationStep.tsx` (mirror the styling of the existing inline region block in `onboarding.tsx` lines 396–419 — same `PressableScale`, `Text` variants, accent `#E11D48`):

```tsx
import { View } from "react-native";
import { Text } from "../ui";
import { PressableScale } from "../ui/PressableScale";
import { Icon } from "../ui/Icon";
import type { Region } from "../../lib/placesClient";

export function SubDestinationStep(props: {
  regions: Region[];
  selected: { placeId: string; label: string }[];
  onToggle: (r: { placeId: string; label: string }) => void;
}) {
  const isSelected = (id: string) => props.selected.some((s) => s.placeId === id);
  return (
    <View className="gap-2">
      {props.regions.map((r) => {
        const on = isSelected(r.placeId);
        return (
          <PressableScale
            key={r.placeId}
            onPress={() => props.onToggle({ placeId: r.placeId, label: r.label })}
            className={`flex-row items-center gap-3 p-4 rounded-lg border ${on ? "bg-accent/10 border-accent" : "bg-surface border-border"}`}
          >
            <Icon name={on ? "checkmark-circle" : "ellipse-outline"} size={20} color={on ? "#E11D48" : "#9CA3AF"} />
            <View className="flex-1 gap-0.5">
              <Text variant="body">{r.label}</Text>
              <Text variant="caption">{r.hook}</Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
```

Verify the exact import paths for `PressableScale`, `Icon`, and `Text` against how `onboarding.tsx` imports them (it may barrel-export from `../ui`); adjust to match the codebase so tsc passes.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest components/onboarding/SubDestinationStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/onboarding/SubDestinationStep.tsx mobile/components/onboarding/SubDestinationStep.test.tsx
git commit -m "feat(onboarding): SubDestinationStep multi-select city list"
```

---

### Task 5: Wire the step into `onboarding.tsx`; remove inline narrowing

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `SubDestinationStep` (Task 4), `resolveStep`/`canContinue`/`STEPS` (Task 3), existing `regions` state + `suggestRegions` fetch.

No new unit test — this is screen wiring over already-tested pure functions/components. Verified by tsc + the manual smoke in Task 7.

- [ ] **Step 1: Import the new pieces**

Add `resolveStep` to the `../../lib/onboarding` import; add `import { SubDestinationStep } from "../../components/onboarding/SubDestinationStep";`.

- [ ] **Step 2: Add a PROMPTS entry for the step**

In the `PROMPTS` map (near line 106) add:

```ts
  subDestinations: { title: "Where in there?", sub: "Pick the cities you want to visit — we'll build days around each." },
```

(The `{place}` in the spec's "Where in {place}?" is nice-to-have; a static title keeps it lazy. If interpolation is trivial with the existing prompt rendering, use `` `Where in ${state.location}?` `` at render instead.)

- [ ] **Step 3: Remove the inline "Big place — narrow it down?" block**

Delete the `{regions.length > 0 ? ( ... ) : null}` block on the destination page (lines ~396–419). Keep the `regions` state, the `setRegions([])` resets, and the `suggestRegions(...).then(setRegions)` fetch on suggestion tap (lines ~382–386) — the fetch now feeds the new step, not the inline block.

Also keep `setRegions([])` in the destination `Input`'s `onChangeText` (line ~371) so editing the destination clears stale regions.

- [ ] **Step 4: Render the new step**

Add, alongside the other `page === "..."` blocks:

```tsx
        {page === "subDestinations" ? (
          <SubDestinationStep
            regions={regions}
            selected={state.subDestinations}
            onToggle={(r) =>
              setState((s) => ({
                ...s,
                subDestinations: s.subDestinations.some((x) => x.placeId === r.placeId)
                  ? s.subDestinations.filter((x) => x.placeId !== r.placeId)
                  : [...s.subDestinations, r],
              }))
            }
          />
        ) : null}
```

- [ ] **Step 5: Skip logic in Continue and Back**

Continue button `onPress` (line ~610-613) — route through `resolveStep`:

```tsx
            onPress={() => {
              if (page === "attribution") saveFunnelAnswers(supabase, funnelPrefs(funnel)).catch(() => {});
              setStep((s) => resolveStep(s + 1, regions.length > 0, 1));
            }}
```

Back button `onPress` (line ~319-324) — skip the step going backward too:

```tsx
          onPress={() => {
            const floor = startStep;
            if (step > floor) setStep((s) => resolveStep(s - 1, regions.length > 0, -1));
            else if (router.canGoBack()) router.back();
            else router.replace("/");
          }}
```

> Edge case handled by `resolveStep`: landing directly on `subDestinations` with no regions loaded auto-skips in the current direction. Entering it forward from `destination` with regions present advances by 1 into it; with none, by 2 past it. Back from `dates` mirrors this.

- [ ] **Step 6: Typecheck + full mobile test suite**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS — tsc clean, all existing + new tests green.

- [ ] **Step 7: Commit**

```bash
git add mobile/app/\(app\)/onboarding.tsx
git commit -m "feat(onboarding): sub-destination step wired, inline narrowing removed"
```

---

### Task 6: Itinerary "Add a destination" affordance

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: `flow.lastRequest` (`GenerateRequest` with `destinationPlaceId`, `subDestinations`), `suggestRegions` from `../../lib/placesClient`, `flow.generate`, existing `requestedDays > days.length` note.

The existing note (lines ~134–138) already fires when days fall short. This task adds the unpicked-city chips beneath it and regenerates on tap. Scope: chips appear only on the **just-generated** flow path (`flow.lastRequest` present) — saved trips (`tripId`) show the note without chips. `// ponytail: chips need the live request; saved-trip rows don't carry subDestinations. Persist req on the trip row if saved-trip chips are wanted.`

No unit test — network + navigation glue over tested primitives; verified in Task 7 smoke.

- [ ] **Step 1: Fetch the region list when short and on the flow path**

Near the other hooks in `Itinerary`, add:

```tsx
  const [addable, setAddable] = useState<{ placeId: string; label: string }[]>([]);
  const req = flow.lastRequest;
  const short = requestedDays != null && requestedDays > days.length;
  useEffect(() => {
    if (!short || !req?.destinationPlaceId) { setAddable([]); return; }
    let active = true;
    suggestRegions({ placeId: req.destinationPlaceId, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
      .then((regions) => {
        if (!active) return;
        const picked = new Set((req.subDestinations ?? []).map((s) => s.placeId));
        setAddable(regions.filter((r) => !picked.has(r.placeId)).map((r) => ({ placeId: r.placeId, label: r.label })));
      })
      .catch(() => { if (active) setAddable([]); });
    return () => { active = false; };
  }, [short, req?.destinationPlaceId]);
```

Add imports: `suggestRegions` from `../../lib/placesClient`, and the `extra` config the screen already uses elsewhere for `supabaseUrl`/`supabaseAnonKey` (match how `onboarding.tsx` obtains `extra` — likely `Constants.expoConfig?.extra`). `requestedDays` is already computed at line 104; move the `short`/`req` derivation below it if ordering requires.

- [ ] **Step 2: Render chips under the short-days note**

Replace the existing note block (lines ~134–138) with:

```tsx
      {short ? (
        <View className="mb-2 gap-2">
          <Text variant="caption" className="text-center">
            We built {days.length} {days.length === 1 ? "day" : "days"} of great content — not enough nearby for {requestedDays}.
          </Text>
          {addable.length > 0 ? (
            <View className="flex-row flex-wrap justify-center gap-2">
              {addable.map((r) => (
                <Pressable
                  key={r.placeId}
                  onPress={() => {
                    if (!req) return;
                    flow.generate({ ...req, subDestinations: [...(req.subDestinations ?? []), r] });
                    router.push("/generating");
                  }}
                  className="px-4 py-2 rounded-pill border border-accent bg-accent/10"
                >
                  <Text variant="label" className="text-accent">+ {r.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
```

Confirm `flow.generate` is the same call `onboarding.tsx` uses (`tripFlow.generate(buildRequest(...))`) and that `useTripFlow()` exposes it as `flow.generate`. Adjust to the real API if it's `flow.generate` vs a different name.

- [ ] **Step 3: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/itinerary.tsx
git commit -m "feat(itinerary): add-a-destination chips regenerate short trips"
```

---

### Task 7: Deploy backend + device smoke (gated, manual)

**Files:** none (ops).

Backward-compatible backend deploys independently of the app.

- [ ] **Step 1: Deploy the edge function**

Run: `supabase functions deploy generate-itinerary`
Expected: deploy succeeds. (No new migration — `region_suggestions` cache already exists from itinerary-v2.)

- [ ] **Step 2: New EAS build**

New screen + onboarding logic ship in the app bundle. No new native dependency, so an OTA `eas update` *may* suffice — but per repo history OTA has repeatedly broken on native-dep drift; prefer a fresh build. Combine with any other pending EAS-build-gated work (see `app-store-submission-state`).

Run: `cd mobile && eas build --profile preview --platform ios` (or the profile the repo uses).

- [ ] **Step 3: Device smoke checklist**

- Japan / 7 days → destination resolves regions → sub-destination step appears → multi-select 2–3 cities → Continue → dates → generate → itinerary spans ~a week across the picked cities.
- Small city (e.g. Lisbon) → regions empty → sub-destination step is **skipped** forward and backward (Continue from destination lands on dates; Back from dates lands on destination).
- Pick a single sparse city → itinerary comes back short → "Add a destination" chip(s) show the unpicked cities → tapping one regenerates a longer trip.
- Back-navigation integrity through the whole funnel (26→27 steps now).
- `compact` transport with multiple cities still visits all picked cities, tight radius each.

- [ ] **Step 4: Update memory** with the shipped state once smoke passes.

---

## Self-Review

**Spec coverage:**
- Problem (few days for large places) → Task 2 multi-city dense per-city pools. ✓
- User flow: destination → conditional sub-dest step → multi-select ≥1 → rest unchanged → Task 3 (steps/skip/canContinue) + Task 5 (wiring). ✓
- Inline narrowing removed → Task 5 Step 3. ✓
- Can't-fill affordance (note + unpicked chips + regenerate) → Task 6. ✓
- `GenerateRequest.subDestinations` (mobile + backend), backward-compat → Tasks 2 & 3. ✓
- `OnboardingState` + buildRequest/stateFromRequest round-trip → Task 3. ✓
- Step skip logic (advance by 1/2, back mirror, direct-entry auto-skip) → `resolveStep`, Task 3 + wired Task 5. ✓
- Backend multi-city: geocode centers, allocateDays split, per-city city-scale pool, global dedupe, per-city effectiveTripDays cap, concatenate & renumber, single-dest long-trip geometric path preserved → Tasks 1 & 2. ✓
- `SubDestinationStep` component → Task 4. ✓
- Testing (legs split, per-city fetch/concat/cap, onboarding round-trip + step integrity, component toggle, manual smoke) → covered across tasks. ✓
- Rollout (independent backend deploy, new build) → Task 7. ✓

**Open risks / ceilings** (from spec, carried as ponytail comments in code):
- Flat even day split, not interest/pool-weighted — `allocateDays` is deliberately simple.
- Leg order = pick order, not geo-optimized — accepted.
- `suggestRegions` adds ~1 LLM call on Continue for large places (cached after first) — accepted, already used today.
- Food/lodging stay region-wide (parent bias) for multi-city → meals degrade to gaps in sparse countries — accepted per spec.
- Saved-trip itinerary chips need the live request; only wired on the flow path (ponytail comment in Task 6).
