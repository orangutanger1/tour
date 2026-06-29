# Itinerary Meals + Absolute Clock Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make meals deterministic add-ons (real restaurants when food is selected, free-range gaps otherwise) that never count against the attraction stop budget, and give every stop a real absolute start time on a cumulative clock with soft-anchored meals.

**Architecture:** A new pure module `schedule.ts` lays an absolute clock over a day's already-ordered attractions and inserts lunch/dinner at the natural boundary nearest their target window (lunch ~12:30, dinner ~sunset). The generate-itinerary handler stops feeding food POIs into LLM curation; attractions are curated/clustered/routed alone, then each day gets exactly two meal slots filled either with the nearest-highest-rated restaurant (food on) or a free-range gap (food off). Mobile renders the clock and meal labels.

**Tech Stack:** Deno + TypeScript (Supabase edge functions), Deno std assert tests; React Native + Expo (mobile), Jest.

## Global Constraints

- Edge function tests run with `deno test` from repo root; mobile tests with `npm test` (jest) from `mobile/`.
- Expo SDK 56 — read https://docs.expo.dev/versions/v56.0.0/ before touching native/Expo APIs.
- Meals are add-ons: the pace stop budget (compact 2-3 / balanced 4-5 / packed 6-8) applies to **attractions only**. Food never inflates it.
- Every day gets exactly one lunch + one dinner slot.
- Clock knobs (exact values): day start `9*60`, travel buffer `1.2`, meal travel `10`, lunch target `12*60+30`.
- Stop `kind`: `"meal"` = real restaurant (has placeId, routes/maps); `"meal-gap"` = free-range (placeId `""`).
- End commit messages with the Co-Authored-By trailer the repo uses.

---

### Task 1: Clock builder module + Stop type fields

**Files:**
- Modify: `supabase/_shared/types.ts` (Stop interface)
- Create: `supabase/_shared/schedule.ts`
- Test: `supabase/_shared/schedule_test.ts`

**Interfaces:**
- Consumes: `formatClock` from `supabase/_shared/solar.ts`; `Stop` from `types.ts`.
- Produces: `buildDaySchedule(opts: { attractions: Stop[]; sunsetMinutes: number; lunch: Stop; dinner: Stop }): Stop[]` and exported consts `DAY_START_MIN`, `TRAVEL_BUFFER`, `MEAL_TRAVEL_MIN`, `LUNCH_TARGET_MIN`. Stop gains `startTime?: string` and `mealSlot?: "lunch" | "dinner"`; `suggestedTime` removed.

- [ ] **Step 1: Update the Stop type**

In `supabase/_shared/types.ts`, replace the `Stop` interface with:

```ts
export interface Stop {
  placeId: string;                 // "" for meal-gap pseudo-stops
  name: string;
  blurb: string;                       // "why a local picks this"
  travelMinutesFromPrev?: number;
  dwellMinutes?: number;               // realistic visit length
  kind?: "attraction" | "meal" | "meal-gap";
  startTime?: string;                  // absolute clock, e.g. "9:00 AM"
  mealSlot?: "lunch" | "dinner";       // meal + meal-gap stops only
}
```

- [ ] **Step 2: Write the failing test**

Create `supabase/_shared/schedule_test.ts`:

```ts
import { assertEquals, assert } from "jsr:@std/assert";
import { buildDaySchedule } from "./schedule.ts";
import type { Stop } from "./types.ts";

const att = (placeId: string, dwell: number, travel?: number): Stop =>
  ({ placeId, name: placeId, blurb: "x", kind: "attraction", dwellMinutes: dwell, travelMinutesFromPrev: travel });
const lunch: Stop = { placeId: "", name: "Lunch — your pick", blurb: "l", kind: "meal-gap", dwellMinutes: 60 };
const dinner: Stop = { placeId: "", name: "Dinner — your pick", blurb: "d", kind: "meal-gap", dwellMinutes: 60 };

// "9:06 AM" -> 546
function toMin(clock: string): number {
  const [, h, m, ap] = clock.match(/(\d+):(\d+) (AM|PM)/)!;
  let hh = Number(h) % 12;
  if (ap === "PM") hh += 12;
  return hh * 60 + Number(m);
}

Deno.test("first attraction starts at 9:00 AM and times are strictly increasing", () => {
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  assertEquals(out[0].startTime, "9:00 AM");
  const mins = out.map((s) => toMin(s.startTime!));
  for (let i = 1; i < mins.length; i++) assert(mins[i] > mins[i - 1], `not increasing at ${i}: ${mins.join(",")}`);
});

Deno.test("travel time is inflated by the 1.2 buffer", () => {
  // A dwell 90 -> ends 10:30 (630). B travel 20 -> +round(24) -> 654 = 10:54.
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const b = out.find((s) => s.placeId === "B")!;
  assertEquals(b.startTime, "10:54 AM");
});

Deno.test("lunch is inserted at the boundary once the clock reaches noon", () => {
  // A 9:00 dwell90 ->10:30(630). B travel20 ->654 dwell60 ->714. C travel10 ->726 >=720 -> lunch before C at 12:06.
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  assertEquals(l.kind, "meal-gap");
  assertEquals(l.startTime, "12:06 PM");
  // lunch comes before C
  assert(out.indexOf(l) < out.findIndex((s) => s.placeId === "C"));
});

Deno.test("dinner lands at or after sunset", () => {
  const out = buildDaySchedule({ attractions: [att("A", 120), att("B", 120, 30), att("C", 120, 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assert(toMin(d.startTime!) >= 1110, `dinner ${d.startTime} before sunset`);
});

Deno.test("short day still appends both meals at their target times", () => {
  const out = buildDaySchedule({ attractions: [att("A", 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assertEquals(l.startTime, "12:30 PM");          // appended at LUNCH_TARGET_MIN
  assertEquals(d.startTime, "6:30 PM");            // appended at sunset (1110)
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `deno test supabase/_shared/schedule_test.ts`
Expected: FAIL — module `./schedule.ts` not found.

- [ ] **Step 4: Write the implementation**

Create `supabase/_shared/schedule.ts`:

```ts
// supabase/_shared/schedule.ts
// Lays an absolute clock over a day's already-ordered attractions and inserts
// lunch/dinner at the natural stop boundary nearest their target window.
// Pure, deterministic, no network. Meals do NOT participate in routing — they
// get a flat MEAL_TRAVEL_MIN "find a nearby spot" leg.
import type { Stop } from "./types.ts";
import { formatClock } from "./solar.ts";

export const DAY_START_MIN = 9 * 60;          // 9:00 AM. calibration knob.
export const TRAVEL_BUFFER = 1.2;             // +20% on transit (operator rule). knob.
export const MEAL_TRAVEL_MIN = 10;            // flat hop to a nearby eatery. knob.
export const LUNCH_TARGET_MIN = 12 * 60 + 30; // 12:30 PM. knob.
const LUNCH_WINDOW_OPEN = LUNCH_TARGET_MIN - 30; // start slotting lunch at ~noon

export function buildDaySchedule(opts: {
  attractions: Stop[];
  sunsetMinutes: number;
  lunch: Stop;
  dinner: Stop;
}): Stop[] {
  const { attractions, sunsetMinutes, lunch, dinner } = opts;
  const out: Stop[] = [];
  let clock = DAY_START_MIN;
  let lunchDone = false;
  let dinnerDone = false;

  const placeMeal = (meal: Stop, slot: "lunch" | "dinner") => {
    meal.startTime = formatClock(clock);
    meal.mealSlot = slot;
    const dwell = meal.dwellMinutes ?? 60;
    meal.dwellMinutes = dwell;
    out.push(meal);
    clock += MEAL_TRAVEL_MIN + dwell;
  };

  attractions.forEach((stop, i) => {
    if (i > 0) clock += Math.round((stop.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
    if (!lunchDone && clock >= LUNCH_WINDOW_OPEN) { placeMeal(lunch, "lunch"); lunchDone = true; }
    if (!dinnerDone && clock >= sunsetMinutes) { placeMeal(dinner, "dinner"); dinnerDone = true; }
    stop.startTime = formatClock(clock);
    out.push(stop);
    clock += stop.dwellMinutes ?? 0;
  });

  // Day too short to reach a meal window → append at the target time.
  if (!lunchDone) { clock = Math.max(clock, LUNCH_TARGET_MIN); placeMeal(lunch, "lunch"); }
  if (!dinnerDone) { clock = Math.max(clock, sunsetMinutes); placeMeal(dinner, "dinner"); }

  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test supabase/_shared/schedule_test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/_shared/types.ts supabase/_shared/schedule.ts supabase/_shared/schedule_test.ts
git commit -m "feat(schedule): absolute clock timeline with soft-anchored meals

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Stop feeding food to the LLM

**Files:**
- Modify: `supabase/_shared/llm.ts`
- Test: `supabase/_shared/llm_test.ts` (create)

**Interfaces:**
- Consumes: `buildPrompt(pois, prefs, tripDays)` (unchanged signature).
- Produces: prompt no longer instructs the LLM to include food/meal stops.

- [ ] **Step 1: Write the failing test**

Create `supabase/_shared/llm_test.ts`:

```ts
import { assert } from "jsr:@std/assert";
import { buildPrompt } from "./llm.ts";
import type { Poi, Prefs } from "./types.ts";

const pois: Poi[] = [{ placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 }];

Deno.test("prompt never asks the LLM to pick food stops, even with food interest", () => {
  const prefs: Prefs = { interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced" };
  const prompt = buildPrompt(pois, prefs, 2);
  assert(!/food stops/i.test(prompt), "prompt should not mention food stops");
  assert(!/"kind":"meal"/.test(prompt), "prompt should not tell the LLM to mark meals");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: FAIL — prompt still contains the "Include up to 2 food stops" line.

- [ ] **Step 3: Remove the food instruction**

In `supabase/_shared/llm.ts`, delete the `wantsFood` constant and the `if (wantsFood) { ... }` block. The function body becomes:

```ts
export function buildPrompt(pois: Poi[], prefs: Prefs, tripDays: number): string {
  const poiList = pois.map((p) => ({
    placeId: p.placeId,
    name: p.name,
    kind: p.kind,
    priceLevel: p.priceLevel ?? null,
    rating: p.rating ?? null,
  }));
  const prefLine =
    `interests=${prefs.interests.join(", ") || "any"}; budget=${prefs.budget}; pace=${prefs.pace};` +
    (prefs.diet?.length ? ` diet=${prefs.diet.join(", ")};` : "") +
    (prefs.accessibility?.length ? ` accessibility=${prefs.accessibility.join(", ")};` : "");
  const PACE_STOPS: Record<Prefs["pace"], string> = { relaxed: "2-3", balanced: "4-5", packed: "6-8" };
  const lines = [
    `You are a local guide planning a ${tripDays}-day trip.`,
    `Traveler preferences: ${prefLine}`,
    `Choose from ONLY these places. Use the exact placeId values. Do not invent places:`,
    JSON.stringify(poiList),
    `Prioritize attractions that match the traveler's interests: scenic -> viewpoints/landmarks, outdoors -> parks/nature/trails, nightlife -> night markets/bars/late venues, history -> historic sites/museums, art -> galleries/installations, shopping -> markets/districts. Lead each day with the strongest interest matches.`,
    `Group nearby places into the same day. For each stop write a one-sentence "why a local picks this" blurb.`,
    `For each stop include "dwellMinutes": a realistic visit length (quick viewpoint ~30, museum ~120, large park ~150). Vary it; do not make every stop the same.`,
    `Aim for about ${PACE_STOPS[prefs.pace]} attraction stops per day (pace=${prefs.pace}).`,
    `Respond with ONLY valid JSON (no markdown fences), matching exactly this shape:`,
    `{"days":[{"day":1,"lodgingPlaceId":null,"stops":[{"placeId":"...","name":"...","blurb":"...","dwellMinutes":90,"kind":"attraction"}]}]}`,
  ];
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/llm.ts supabase/_shared/llm_test.ts
git commit -m "refactor(llm): drop food-stop instruction; LLM curates attractions only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Rewire the handler — food out of curation, deterministic meals, clock

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts`
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Consumes: `buildDaySchedule` (Task 1); `haversineKm` from `supabase/_shared/area.ts`; `sunsetLocalMinutes` from `solar.ts`.
- Produces: itinerary where attraction stops carry `startTime`, each day has exactly one lunch + one dinner (`kind:"meal"` real restaurant when food on and available, else `kind:"meal-gap"`), food POIs never reach `curate`.

- [ ] **Step 1: Write the failing tests**

In `supabase/functions/generate-itinerary/handler_test.ts`, **replace** the three existing meal tests (`"inserts lunch + dinner meal gaps when food not selected"`, `"no meal gaps when the day already has a meal stop"`, `"injects meal gaps even when food selected if the day has no meal stop"`) with:

```ts
Deno.test("food off: each day gets lunch + dinner gaps with absolute times", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps());
  const stops = (r.body as { itinerary: Itinerary }).itinerary.days[0].stops;
  const gaps = stops.filter((s) => s.kind === "meal-gap");
  assertEquals(gaps.length, 2);
  assert(gaps.every((g) => g.placeId === "" && g.dwellMinutes === 60 && !!g.startTime && !!g.mealSlot));
  assertEquals(gaps.map((g) => g.mealSlot).sort(), ["dinner", "lunch"]);
});

Deno.test("every stop gets an absolute startTime", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps());
  const stops = (r.body as { itinerary: Itinerary }).itinerary.days[0].stops;
  assert(stops.every((s) => typeof s.startTime === "string" && s.startTime.length > 0));
  assertEquals(stops[0].startTime, "9:00 AM");
});

Deno.test("food on: meal slots are real restaurants (highest-rated first), deduped, not counted as attractions", async () => {
  const foodPois: Poi[] = [
    { placeId: "F1", name: "Joe", kind: "food", lat: 0, lng: 0, rating: 4.8 },
    { placeId: "F2", name: "Mae", kind: "food", lat: 0, lng: 0, rating: 4.5 },
  ];
  const deps = baseDeps({
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : kind === "food" ? foodPois : attractions),
  });
  const r = await handleGenerate({ location: "X", tripDays: 1, destinationPlaceId: "D", prefs: { ...prefs, interests: ["food"] } }, "u1", deps);
  const stops = (r.body as { itinerary: Itinerary }).itinerary.days[0].stops;
  const meals = stops.filter((s) => s.kind === "meal");
  assertEquals(meals.length, 2);
  assert(meals.every((m) => m.placeId !== "" && !!m.mealSlot && !!m.startTime));
  assertEquals(stops.filter((s) => s.kind === "meal-gap").length, 0);
  assertEquals(meals.find((m) => m.mealSlot === "lunch")!.placeId, "F1"); // highest rated first
  // deduped: the two meals are different places
  assert(meals[0].placeId !== meals[1].placeId);
});

Deno.test("food on but no food places found: falls back to gaps", async () => {
  const deps = baseDeps({
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : kind === "food" ? [] : attractions),
  });
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, "u1", deps);
  const stops = (r.body as { itinerary: Itinerary }).itinerary.days[0].stops;
  assertEquals(stops.filter((s) => s.kind === "meal-gap").length, 2);
});

Deno.test("food POIs are never sent to the curation pool", async () => {
  let curatedKinds: string[] = [];
  const foodPois: Poi[] = [{ placeId: "F1", name: "Joe", kind: "food", lat: 0, lng: 0, rating: 4.8 }];
  const deps = baseDeps({
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : kind === "food" ? foodPois : attractions),
    curate: ({ pois }) => { curatedKinds = pois.map((p) => p.kind); return Promise.resolve(itinerary); },
  });
  await handleGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, "u1", deps);
  assert(!curatedKinds.includes("food"), `curation pool leaked food: ${curatedKinds.join(",")}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: FAIL — `curate` still receives food, no `startTime`, food still routed through LLM.

- [ ] **Step 3: Update the handler imports**

In `supabase/functions/generate-itinerary/handler.ts`, change the solar import (line 6) and add two imports below it:

```ts
import { sunsetLocalMinutes } from "../../_shared/solar.ts";
import { areaRadiusKm, haversineKm, type Viewport } from "../../_shared/area.ts";
import { buildDaySchedule } from "../../_shared/schedule.ts";
```

(Remove the standalone `import { areaRadiusKm, type Viewport } from "../../_shared/area.ts";` line — it's merged above. Remove `formatClock` from the solar import.)

- [ ] **Step 4: Keep food out of the curation pool**

Replace the pool construction (currently `const pois = [...attractions, ...food];`) with:

```ts
  // Food is no longer curated by the LLM. Attractions alone form the pool, so the
  // pace stop budget applies to attractions only; food fills meal slots below.
  const pois = attractions;
  const anchorPoi = lodging[0] ?? null;
```

- [ ] **Step 5: Replace the meal-gap injection block with the meal+clock step**

Delete the existing block (handler.ts:148-161, the `// Every day should show food time...` comment through the `day.stops = [...]` line) and replace with:

```ts
  // Meals are deterministic add-ons, layered on after routing so they never
  // affect the attraction order/polyline or the pace stop budget. Food on →
  // each slot gets the nearest-highest-rated restaurant (deduped across days);
  // food off, or none left → a free-range gap. buildDaySchedule then lays the
  // absolute clock over the day and slots the meals at lunch/sunset.
  // `wantsFood` is already declared above (gates the food fetch); reuse it.
  const usedFood = new Set<string>();
  const pickFood = (centroid: { lat: number; lng: number }): Stop | null => {
    let best: Poi | null = null;
    let bestScore = -Infinity;
    for (const f of food) {
      if (usedFood.has(f.placeId)) continue;
      const score = (f.rating ?? 0) - haversineKm(centroid, { lat: f.lat, lng: f.lng }) * 0.05;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (!best) return null;
    usedFood.add(best.placeId);
    return { placeId: best.placeId, name: best.name, blurb: "A local spot for a meal.", kind: "meal", dwellMinutes: 60 };
  };
  const gap = (slot: "lunch" | "dinner"): Stop => ({
    placeId: "",
    name: slot === "lunch" ? "Lunch — your pick" : "Dinner — your pick",
    blurb: slot === "lunch" ? "Free time to grab a local bite." : "Free time for dinner near sunset.",
    kind: "meal-gap",
    dwellMinutes: 60,
  });

  const sunLat = anchorPoi?.lat ?? dest.center.lat;
  const sunLng = anchorPoi?.lng ?? dest.center.lng;
  itinerary.days.forEach((day, i) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + i);
    const sunsetMin = (anchorPoi || hasCenter) ? sunsetLocalMinutes(sunLat, sunLng, date) : 19 * 60;
    const pts = day.stops.map((s) => byId.get(s.placeId)).filter((p): p is Poi => !!p);
    const centroid = pts.length
      ? { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length }
      : dest.center;
    const lunch = (wantsFood && pickFood(centroid)) || gap("lunch");
    const dinner = (wantsFood && pickFood(centroid)) || gap("dinner");
    day.stops = buildDaySchedule({ attractions: day.stops, sunsetMinutes: sunsetMin, lunch, dinner });
  });
```

Note: `Stop` is already imported via `types.ts` at the top of the file (`import type { Itinerary, Poi, Prefs } from "../../_shared/types.ts";`). Add `Stop` to that import: `import type { Itinerary, Poi, Prefs, Stop } from "../../_shared/types.ts";`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: PASS (all, including the unchanged routing/dwell/anchor tests).

- [ ] **Step 7: Run the full backend suite for regressions**

Run: `deno test supabase/`
Expected: PASS (no regressions in suggest-regions, curate, schema, etc.).

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(generate-itinerary): deterministic meals + absolute clock per day

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Mobile — meals aren't numbered attractions

**Files:**
- Modify: `mobile/lib/poi.ts` (`numberStops`)
- Test: `mobile/lib/poi.test.ts`

**Interfaces:**
- Consumes/Produces: `numberStops` now assigns `num: null` to both `meal-gap` and `meal` stops.

- [ ] **Step 1: Update the failing test**

In `mobile/lib/poi.test.ts`, replace the `numberStops` test (lines 61-69) with:

```ts
test("numberStops numbers real attractions, skips meals and meal-gaps", () => {
  const out = numberStops([
    { placeId: "A", kind: "attraction" },
    { placeId: "", kind: "meal-gap" },
    { placeId: "F1", kind: "meal" },
    { placeId: "B", kind: "attraction" },
  ]);
  expect(out.map((s) => s.num)).toEqual([1, null, null, 2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `mobile/`): `npm test -- poi`
Expected: FAIL — the `meal` stop currently gets number 2.

- [ ] **Step 3: Update numberStops**

In `mobile/lib/poi.ts`, change the skip predicate:

```ts
// Assigns sequential 1..N display numbers to real attractions, skipping meals (num = null).
export function numberStops<T extends { kind?: string }>(stops: T[]): (T & { num: number | null })[] {
  let n = 0;
  return stops.map((s) => ({ ...s, num: (s.kind === "meal-gap" || s.kind === "meal") ? null : ++n }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `mobile/`): `npm test -- poi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/poi.ts mobile/lib/poi.test.ts
git commit -m "fix(mobile): don't number meal stops as attractions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Mobile — clock-led cards, meal labels, meal markers

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: `Stop` now carries `startTime` + `mealSlot`; `numberStops` skips meals (Task 4). No automated test — RN view; verify by reading and a type check.

- [ ] **Step 1: Render the clock + meal labels in the list**

In `mobile/app/(app)/itinerary.tsx`, replace the `renderItem` body (lines 123-140) with one that leads with `startTime` and labels meals from `mealSlot`. Both real meals and gaps share a card; attractions show their number:

```tsx
          renderItem={({ item }) => {
            const isMeal = item.kind === "meal" || item.kind === "meal-gap";
            const mealLabel = item.mealSlot === "lunch" ? "Lunch" : item.mealSlot === "dinner" ? "Dinner" : "Meal";
            return isMeal ? (
              <Card className={`gap-1 ${item.kind === "meal-gap" ? "border-dashed" : ""}`}>
                <View className="flex-row items-baseline gap-2">
                  {item.startTime ? <Text variant="label" className="text-accent">{item.startTime}</Text> : null}
                  <Text variant="heading">{mealLabel}{item.placeId ? ` · ${item.name}` : ""}</Text>
                </View>
                <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
                {formatDwell(item.dwellMinutes) ? <Text variant="caption">{formatDwell(item.dwellMinutes)}</Text> : null}
              </Card>
            ) : (
              <Card className="gap-1">
                <View className="flex-row items-baseline gap-2">
                  {item.startTime ? <Text variant="label" className="text-accent">{item.startTime}</Text> : null}
                  <Text variant="heading">{item.num}. {item.name}</Text>
                </View>
                <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
                <View className="flex-row gap-3">
                  {formatDwell(item.dwellMinutes) ? <Text variant="caption">{formatDwell(item.dwellMinutes)} here</Text> : null}
                  {item.travelMinutesFromPrev != null ? <Text variant="caption">{item.travelMinutesFromPrev} min from previous</Text> : null}
                </View>
              </Card>
            );
          }}
```

- [ ] **Step 2: Add map markers for real meal stops**

In `mobile/app/(app)/itinerary.tsx`, after the `dayMarkers` definition (currently lines 50-55), add meal markers built independently of `numberStops` so they show without consuming an attraction number:

```tsx
  // Real meal stops (have a placeId) get their own marker, labeled by meal slot
  // rather than a number; meal-gaps have no placeId so they never map.
  const mealMarkers = (activeDay?.stops ?? []).flatMap((s) => {
    if (s.kind !== "meal" || !s.placeId) return [];
    const coord = coords[s.placeId];
    if (!coord) return [];
    const label = s.mealSlot === "lunch" ? "Lunch" : "Dinner";
    return [{ id: `meal-${s.placeId}`, coordinates: { latitude: coord.lat, longitude: coord.lng }, title: `${label} — ${s.name}` }];
  });
```

Then pass both marker sets to the map (update the `AppleMaps.View` `markers` prop, line 107):

```tsx
              markers={[...dayMarkers, ...mealMarkers]}
```

- [ ] **Step 3: Type-check**

Run (from `mobile/`): `npx tsc --noEmit`
Expected: no errors. (`suggestedTime` is gone from `Stop`; if any other file referenced it, tsc flags it here — fix by switching to `startTime`.)

- [ ] **Step 4: Run the mobile suite**

Run (from `mobile/`): `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(app\)/itinerary.tsx
git commit -m "feat(mobile): clock-led itinerary cards + meal labels and markers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run full backend suite: `deno test supabase/` → all pass.
- [ ] Run mobile suite + types: `cd mobile && npm test && npx tsc --noEmit` → all pass.
- [ ] Manual device/OTA smoke (no new EAS build needed — JS + edge-fn only): food on → restaurants at lunch/dinner; food off → "your pick" gaps; every stop shows a clock time starting 9:00 AM; meal count is independent of the pace stop count.
- [ ] Redeploy edge function: `supabase functions deploy generate-itinerary`.

## Notes for the implementer

- Tasks 1-3 are backend (Deno). Tasks 4-5 are mobile (Jest/RN). They're independent after Task 1's type change; do them in order so the `Stop` type exists before mobile consumes `startTime`/`mealSlot`.
- The `* 0.05` km penalty in `pickFood` keeps rating primary with proximity as a gentle tiebreak (a 0.5-rating gap is overcome by ~10 km of distance). It's a calibration knob — tune if restaurants come out too far from the day's cluster.
- Meals are appended after routing on purpose: the route optimizer and polyline stay attraction-only, so a restaurant can't be reordered out of its time slot.
