# Edit / Add Locations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a generated itinerary editable in place — remove, reorder, move-across-days, replace, and add stops — with instant client re-timing and a lazy accurate backend re-route.

**Architecture:** Pure ops (`editItinerary.ts`) transform an `Itinerary`; `scheduleClient.ts` re-times a day instantly (haversine travel, ported `buildDaySchedule`); `updateTripItinerary` persists; a new `edit-itinerary` edge fn re-routes a day via Google Routes and returns accurate times/polyline that the UI merges in. Every trip already has a DB row and `flow.data.tripId`, so saved and just-generated trips are both editable.

**Tech Stack:** Expo RN + NativeWind, `react-native-sortables` (already a dep), `@tanstack/react-query`, Deno edge fns, deno test + jest.

## Global Constraints

- Only attraction stops are user-editable; meal / meal-gap stops are re-derived by the scheduler, never dragged or removed directly.
- Client re-time is provisional; backend re-route is source of truth once it returns.
- No data loss: persist the edit (client-scheduled) BEFORE firing the backend re-route; if the re-route fails, the client estimate stands.
- Client travel estimate: `MIN_PER_KM = 2`, `CLIENT_SUNSET_MIN = 19*60` (backend fixes both).
- Reuse `buildDaySchedule` invariants (lunch anchored at target, dinner at sunset, attractions spread) — the client port must match them.
- Backend tests `deno test <path>`; mobile tests `cd mobile && npm test`.
- `flow.data` is `{ tripId, itinerary }`; saved-trip screens pass `tripId` param. Both yield a trip id — do NOT add tripFlow plumbing.

---

## File Structure

- `mobile/lib/editItinerary.ts` — CREATE: pure `Itinerary → Itinerary` ops.
- `mobile/lib/editItinerary.test.ts` — CREATE.
- `mobile/lib/scheduleClient.ts` — CREATE: `scheduleDayClient`, ported timing + haversine.
- `mobile/lib/scheduleClient.test.ts` — CREATE.
- `mobile/lib/trips.ts` — MODIFY: add `updateTripItinerary`.
- `mobile/lib/editClient.ts` — CREATE: `requestDayReroute` (calls edge fn).
- `supabase/functions/edit-itinerary/handler.ts` — CREATE.
- `supabase/functions/edit-itinerary/handler_test.ts` — CREATE.
- `supabase/functions/edit-itinerary/index.ts` — CREATE.
- `mobile/app/(app)/itinerary.tsx` — MODIFY: edit mode + all four ops.
- `mobile/app/(app)/edit.tsx` — DELETE (stub; edit lives inside itinerary).

---

### Task 1: Pure itinerary ops

**Files:**
- Create: `mobile/lib/editItinerary.ts`
- Test: `mobile/lib/editItinerary.test.ts`

**Interfaces:**
- Consumes: `Itinerary`, `ItineraryDay`, `Stop` from `./types`.
- Produces: `isAttraction(s: Stop): boolean`; and pure fns, each returning a NEW `Itinerary` (inputs unmutated):
  `removeStop(itin, day, attrIndex)`, `reorderStops(itin, day, from, to)`, `replaceStop(itin, day, attrIndex, newStop)`, `addStop(itin, day, attrIndex, newStop)`, `moveStopToDay(itin, fromDay, attrIndex, toDay)`.
- `attrIndex` indexes only attraction stops within the day (meals skipped).

- [ ] **Step 1: Write failing tests**

```ts
import { removeStop, reorderStops, replaceStop, addStop, moveStopToDay, isAttraction } from "./editItinerary";
import type { Itinerary, Stop } from "./types";

const attr = (name: string, placeId = name): Stop => ({ placeId, name, blurb: "", kind: "attraction" });
const meal: Stop = { placeId: "r", name: "Lunch", blurb: "", kind: "meal", mealSlot: "lunch" };

const itin = (): Itinerary => ({
  days: [
    { day: 1, lodgingPlaceId: null, stops: [attr("A"), meal, attr("B"), attr("C")] },
    { day: 2, lodgingPlaceId: null, stops: [attr("D")] },
  ],
});

test("isAttraction excludes meals and gaps", () => {
  expect(isAttraction(attr("A"))).toBe(true);
  expect(isAttraction(meal)).toBe(false);
  expect(isAttraction({ ...meal, kind: "meal-gap" })).toBe(false);
});

test("removeStop drops the Nth attraction, keeps meals", () => {
  const out = removeStop(itin(), 1, 1); // attraction index 1 = "B"
  const names = out.days[0].stops.map((s) => s.name);
  expect(names).toEqual(["A", "Lunch", "C"]);
});

test("reorderStops moves within attractions only", () => {
  const out = reorderStops(itin(), 1, 0, 2); // A -> after C
  expect(out.days[0].stops.filter(isAttraction).map((s) => s.name)).toEqual(["B", "C", "A"]);
});

test("replaceStop swaps the Nth attraction", () => {
  const out = replaceStop(itin(), 1, 0, attr("Z"));
  expect(out.days[0].stops.filter(isAttraction).map((s) => s.name)).toEqual(["Z", "B", "C"]);
});

test("addStop inserts at attraction index", () => {
  const out = addStop(itin(), 2, 0, attr("New"));
  expect(out.days[1].stops.map((s) => s.name)).toEqual(["New", "D"]);
});

test("moveStopToDay removes from source, appends to target", () => {
  const out = moveStopToDay(itin(), 1, 2, 2); // move "C" to day 2
  expect(out.days[0].stops.filter(isAttraction).map((s) => s.name)).toEqual(["A", "B"]);
  expect(out.days[1].stops.map((s) => s.name)).toEqual(["D", "C"]);
});

test("ops do not mutate the input", () => {
  const a = itin();
  removeStop(a, 1, 0);
  expect(a.days[0].stops.map((s) => s.name)).toEqual(["A", "Lunch", "B", "C"]);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- editItinerary`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `editItinerary.ts`**

```ts
// mobile/lib/editItinerary.ts
import type { Itinerary, ItineraryDay, Stop } from "./types";

export function isAttraction(s: Stop): boolean {
  return s.kind !== "meal" && s.kind !== "meal-gap";
}

// Map an attraction index (Nth attraction) to its position in the full stops array.
function attrPos(stops: Stop[], attrIndex: number): number {
  let seen = -1;
  for (let i = 0; i < stops.length; i++) {
    if (isAttraction(stops[i]) && ++seen === attrIndex) return i;
  }
  return -1;
}

function mapDay(itin: Itinerary, day: number, fn: (d: ItineraryDay) => ItineraryDay): Itinerary {
  return { ...itin, days: itin.days.map((d) => (d.day === day ? fn(d) : d)) };
}

export function removeStop(itin: Itinerary, day: number, attrIndex: number): Itinerary {
  return mapDay(itin, day, (d) => {
    const pos = attrPos(d.stops, attrIndex);
    if (pos < 0) return d;
    return { ...d, stops: d.stops.filter((_, i) => i !== pos) };
  });
}

export function replaceStop(itin: Itinerary, day: number, attrIndex: number, newStop: Stop): Itinerary {
  return mapDay(itin, day, (d) => {
    const pos = attrPos(d.stops, attrIndex);
    if (pos < 0) return d;
    return { ...d, stops: d.stops.map((s, i) => (i === pos ? newStop : s)) };
  });
}

export function addStop(itin: Itinerary, day: number, attrIndex: number, newStop: Stop): Itinerary {
  return mapDay(itin, day, (d) => {
    const pos = attrPos(d.stops, attrIndex);
    const stops = [...d.stops];
    stops.splice(pos < 0 ? stops.length : pos, 0, newStop);
    return { ...d, stops };
  });
}

export function reorderStops(itin: Itinerary, day: number, from: number, to: number): Itinerary {
  return mapDay(itin, day, (d) => {
    const attractions = d.stops.filter(isAttraction);
    if (from < 0 || from >= attractions.length || to < 0 || to >= attractions.length) return d;
    const [moved] = attractions.splice(from, 1);
    attractions.splice(to, 0, moved);
    // Rebuild: attractions in new order, meals dropped (scheduler re-inserts them).
    return { ...d, stops: attractions };
  });
}

export function moveStopToDay(itin: Itinerary, fromDay: number, attrIndex: number, toDay: number): Itinerary {
  const src = itin.days.find((d) => d.day === fromDay);
  if (!src) return itin;
  const pos = attrPos(src.stops, attrIndex);
  if (pos < 0) return itin;
  const moved = src.stops[pos];
  const removed = removeStop(itin, fromDay, attrIndex);
  return mapDay(removed, toDay, (d) => ({ ...d, stops: [...d.stops, moved] }));
}
```

Note: `reorderStops` intentionally returns attractions only — `scheduleDayClient` (Task 2) re-inserts meals. The other ops keep meals in place; the scheduler still normalizes them.

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- editItinerary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/editItinerary.ts mobile/lib/editItinerary.test.ts
git commit -m "feat(edit): pure itinerary edit ops"
```

---

### Task 2: Client-side day scheduler

**Files:**
- Create: `mobile/lib/scheduleClient.ts`
- Test: `mobile/lib/scheduleClient.test.ts`

**Interfaces:**
- Consumes: `ItineraryDay`, `Stop` from `./types`; a `coords: Record<string, {lat:number;lng:number}>` map (from `getStopCoords`).
- Produces: `scheduleDayClient(day: ItineraryDay, coords: Record<string,{lat:number;lng:number}>): ItineraryDay` — returns the day with attractions re-timed (`travelMinutesFromPrev`, `startTime`) and meals re-placed (lunch/dinner), mirroring backend `buildDaySchedule`.

- [ ] **Step 1: Write failing tests**

```ts
import { scheduleDayClient } from "./scheduleClient";
import type { ItineraryDay } from "./types";

const coords = {
  A: { lat: 0, lng: 0 },
  B: { lat: 0, lng: 0.2 }, // ~22 km east
  C: { lat: 0, lng: 0.4 },
};

const day: ItineraryDay = {
  day: 1, lodgingPlaceId: null,
  stops: [
    { placeId: "A", name: "A", blurb: "", kind: "attraction", dwellMinutes: 60 },
    { placeId: "", name: "Lunch", blurb: "", kind: "meal-gap", mealSlot: "lunch", dwellMinutes: 60 },
    { placeId: "B", name: "B", blurb: "", kind: "attraction", dwellMinutes: 60 },
    { placeId: "C", name: "C", blurb: "", kind: "attraction", dwellMinutes: 60 },
    { placeId: "", name: "Dinner", blurb: "", kind: "meal-gap", mealSlot: "dinner", dwellMinutes: 60 },
  ],
};

test("every stop gets a startTime", () => {
  const out = scheduleDayClient(day, coords);
  expect(out.stops.every((s) => !!s.startTime)).toBe(true);
});

test("lunch and dinner remain present exactly once", () => {
  const out = scheduleDayClient(day, coords);
  expect(out.stops.filter((s) => s.mealSlot === "lunch").length).toBe(1);
  expect(out.stops.filter((s) => s.mealSlot === "dinner").length).toBe(1);
});

test("attraction after another has a travel estimate > 0", () => {
  const out = scheduleDayClient(day, coords);
  const b = out.stops.find((s) => s.placeId === "B");
  expect((b?.travelMinutesFromPrev ?? 0)).toBeGreaterThan(0);
});

test("missing meal-gap is synthesized", () => {
  const noMeals: ItineraryDay = { ...day, stops: day.stops.filter((s) => s.kind === "attraction") };
  const out = scheduleDayClient(noMeals, coords);
  expect(out.stops.some((s) => s.mealSlot === "lunch")).toBe(true);
  expect(out.stops.some((s) => s.mealSlot === "dinner")).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- scheduleClient`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `scheduleClient.ts`**

Port of `supabase/_shared/schedule.ts` + `formatClock`/haversine, using estimated travel:

```ts
// mobile/lib/scheduleClient.ts
import type { ItineraryDay, Stop } from "./types";
import { isAttraction } from "./editItinerary";

const DAY_START_MIN = 9 * 60;
const TRAVEL_BUFFER = 1.2;
const MEAL_TRAVEL_MIN = 10;
const LUNCH_TARGET_MIN = 12 * 60 + 30;
const CLIENT_SUNSET_MIN = 19 * 60;
const MIN_PER_KM = 2;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function estimateTravel(stops: Stop[], coords: Record<string, { lat: number; lng: number }>): Stop[] {
  return stops.map((s, i) => {
    if (i === 0) return { ...s, travelMinutesFromPrev: 0 };
    const prev = coords[stops[i - 1].placeId];
    const cur = coords[s.placeId];
    const min = prev && cur ? Math.round(haversineKm(prev, cur) * MIN_PER_KM) : (s.travelMinutesFromPrev ?? 0);
    return { ...s, travelMinutesFromPrev: min };
  });
}

export function scheduleDayClient(
  day: ItineraryDay,
  coords: Record<string, { lat: number; lng: number }>,
): ItineraryDay {
  const attractions = estimateTravel(day.stops.filter(isAttraction), coords);
  const lunch = day.stops.find((s) => s.mealSlot === "lunch")
    ?? { placeId: "", name: "Lunch — your pick", blurb: "Free time to grab a local bite.", kind: "meal-gap", dwellMinutes: 60 } as Stop;
  const dinner = day.stops.find((s) => s.mealSlot === "dinner")
    ?? { placeId: "", name: "Dinner — your pick", blurb: "Free time for dinner near sunset.", kind: "meal-gap", dwellMinutes: 60 } as Stop;

  const lunchDwell = lunch.dwellMinutes ?? 60;
  const lunchStart = LUNCH_TARGET_MIN;
  const lunchEnd = lunchStart + MEAL_TRAVEL_MIN + lunchDwell;
  const dinnerStart = Math.max(CLIENT_SUNSET_MIN, lunchEnd);

  const morningLen = Math.max(0, lunchStart - DAY_START_MIN);
  const afternoonLen = Math.max(0, dinnerStart - lunchEnd);
  const total = morningLen + afternoonLen;
  const n = attractions.length;
  const morningCount = total <= 0 || n <= 1 ? n : Math.max(1, Math.min(n - 1, Math.round((n * morningLen) / total)));
  const morning = attractions.slice(0, morningCount);
  const afternoon = attractions.slice(morningCount);

  const out: Stop[] = [];
  const spread = (list: Stop[], start: number, end: number) => {
    if (list.length === 0) return;
    let dwellSum = 0, travelSum = 0;
    list.forEach((s, i) => {
      dwellSum += s.dwellMinutes ?? 0;
      if (i > 0) travelSum += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
    });
    const slack = Math.max(0, end - start - dwellSum - travelSum);
    const gap = list.length > 1 ? slack / (list.length - 1) : 0;
    let clock = start;
    list.forEach((s, i) => {
      if (i > 0) { clock += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER); clock += Math.round(gap); }
      out.push({ ...s, startTime: formatClock(clock) });
      clock += s.dwellMinutes ?? 0;
    });
  };
  const placeMeal = (meal: Stop, slot: "lunch" | "dinner", at: number) =>
    out.push({ ...meal, startTime: formatClock(at), mealSlot: slot, dwellMinutes: meal.dwellMinutes ?? 60 });

  spread(morning, DAY_START_MIN, lunchStart);
  placeMeal(lunch, "lunch", lunchStart);
  spread(afternoon, lunchEnd, dinnerStart);
  placeMeal(dinner, "dinner", dinnerStart);

  return { ...day, stops: out };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- scheduleClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/scheduleClient.ts mobile/lib/scheduleClient.test.ts
git commit -m "feat(edit): client-side day reschedule with haversine travel estimate"
```

---

### Task 3: Persist edited itinerary

**Files:**
- Modify: `mobile/lib/trips.ts`
- Test: `mobile/lib/trips.test.ts` (create if absent)

**Interfaces:**
- Produces: `updateTripItinerary(client: SupabaseClient, id: string, itinerary: Itinerary): Promise<void>`.

- [ ] **Step 1: Write failing test** (mock the supabase update chain)

```ts
import { updateTripItinerary } from "./trips";

test("updateTripItinerary issues scoped update", async () => {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ update });
  const client = { from } as never;
  await updateTripItinerary(client, "t1", { days: [] });
  expect(from).toHaveBeenCalledWith("trips");
  expect(update).toHaveBeenCalledWith({ itinerary: { days: [] } });
  expect(eq).toHaveBeenCalledWith("id", "t1");
});

test("updateTripItinerary throws on error", async () => {
  const eq = jest.fn().mockResolvedValue({ error: new Error("nope") });
  const client = { from: () => ({ update: () => ({ eq }) }) } as never;
  await expect(updateTripItinerary(client, "t1", { days: [] })).rejects.toThrow("nope");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- trips`
Expected: FAIL — `updateTripItinerary` missing.

- [ ] **Step 3: Implement in `trips.ts`**

```ts
export async function updateTripItinerary(
  client: SupabaseClient,
  id: string,
  itinerary: Itinerary,
): Promise<void> {
  const { error } = await client.from("trips").update({ itinerary }).eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- trips`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/trips.ts mobile/lib/trips.test.ts
git commit -m "feat(edit): updateTripItinerary write path"
```

---

### Task 4: `edit-itinerary` edge function (backend re-route)

**Files:**
- Create: `supabase/functions/edit-itinerary/handler.ts`
- Test: `supabase/functions/edit-itinerary/handler_test.ts`
- Create: `supabase/functions/edit-itinerary/index.ts`

**Interfaces:**
- Consumes: `orderStops` (`../../_shared/routes.ts`), `buildDaySchedule` (`../../_shared/schedule.ts`), `sunsetLocalMinutes` (`../../_shared/solar.ts`), types.
- Produces: `handleEditItinerary(body, deps): Promise<{status, body}>` where
  `body = { tripId?: string; day?: number }` and
  `EditItineraryDeps = { loadItinerary(tripId): Promise<Itinerary | null>; coordsFor(placeIds): Promise<Record<string,{lat:number;lng:number}>>; orderDay(opts): Promise<{ordered:{placeId:string;travelMinutesFromPrev:number}[]; polyline?:string}>; saveItinerary(tripId, itin): Promise<void>; }`.
  Response `body = { day: ItineraryDay }`.

- [ ] **Step 1: Write failing tests**

```ts
import { assertEquals } from "jsr:@std/assert";
import { handleEditItinerary, type EditItineraryDeps } from "./handler.ts";
import type { Itinerary } from "../../_shared/types.ts";

const itin: Itinerary = {
  days: [{
    day: 1, lodgingPlaceId: null,
    stops: [
      { placeId: "A", name: "A", blurb: "", kind: "attraction", dwellMinutes: 60 },
      { placeId: "B", name: "B", blurb: "", kind: "attraction", dwellMinutes: 60 },
      { placeId: "", name: "Lunch", blurb: "", kind: "meal-gap", mealSlot: "lunch", dwellMinutes: 60 },
    ],
  }],
};

const deps: EditItineraryDeps = {
  loadItinerary: () => Promise.resolve(itin),
  coordsFor: () => Promise.resolve({ A: { lat: 0, lng: 0 }, B: { lat: 0, lng: 0.2 } }),
  orderDay: () => Promise.resolve({ ordered: [
    { placeId: "B", travelMinutesFromPrev: 0 },
    { placeId: "A", travelMinutesFromPrev: 15 },
  ], polyline: "xyz" }),
  saveItinerary: () => Promise.resolve(),
};

Deno.test("400 when tripId or day missing", async () => {
  assertEquals((await handleEditItinerary({}, deps)).status, 400);
  assertEquals((await handleEditItinerary({ tripId: "t" }, deps)).status, 400);
});

Deno.test("404 when itinerary or day not found", async () => {
  const r = await handleEditItinerary({ tripId: "t", day: 9 }, deps);
  assertEquals(r.status, 404);
});

Deno.test("200 re-routes: attractions reordered, times + polyline set, meal kept", async () => {
  const r = await handleEditItinerary({ tripId: "t", day: 1 }, deps);
  assertEquals(r.status, 200);
  const day = (r.body as { day: Itinerary["days"][number] }).day;
  const attrs = day.stops.filter((s) => s.kind === "attraction");
  assertEquals(attrs.map((s) => s.placeId), ["B", "A"]); // orderDay order
  assertEquals(attrs.every((s) => !!s.startTime), true);
  assertEquals(day.routePolyline, "xyz");
  assertEquals(day.stops.some((s) => s.mealSlot === "lunch"), true);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `deno test supabase/functions/edit-itinerary/handler_test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `handler.ts`**

```ts
// supabase/functions/edit-itinerary/handler.ts
import type { Itinerary, ItineraryDay, Poi, Stop } from "../../_shared/types.ts";
import { buildDaySchedule } from "../../_shared/schedule.ts";
import { sunsetLocalMinutes } from "../../_shared/solar.ts";

export interface EditItineraryDeps {
  loadItinerary(tripId: string): Promise<Itinerary | null>;
  coordsFor(placeIds: string[]): Promise<Record<string, { lat: number; lng: number }>>;
  orderDay(opts: { stops: Poi[]; anchor: { lat: number; lng: number } }): Promise<{ ordered: { placeId: string; travelMinutesFromPrev: number }[]; polyline?: string }>;
  saveItinerary(tripId: string, itin: Itinerary): Promise<void>;
}

const isAttraction = (s: Stop) => s.kind !== "meal" && s.kind !== "meal-gap";

export async function handleEditItinerary(
  body: { tripId?: string; day?: number },
  deps: EditItineraryDeps,
): Promise<{ status: number; body: unknown }> {
  if (!body.tripId || typeof body.day !== "number") {
    return { status: 400, body: { error: "tripId and day required" } };
  }
  const itin = await deps.loadItinerary(body.tripId);
  const target = itin?.days.find((d) => d.day === body.day);
  if (!itin || !target) return { status: 404, body: { error: "day not found" } };

  const attractions = target.stops.filter(isAttraction);
  const coords = await deps.coordsFor(attractions.map((s) => s.placeId).filter(Boolean));
  const dayPois: Poi[] = attractions
    .filter((s) => coords[s.placeId])
    .map((s) => ({ placeId: s.placeId, name: s.name, kind: "attraction", lat: coords[s.placeId].lat, lng: coords[s.placeId].lng }));

  let orderedStops = attractions;
  let polyline: string | undefined;
  if (dayPois.length > 0) {
    const centroid = {
      lat: dayPois.reduce((a, p) => a + p.lat, 0) / dayPois.length,
      lng: dayPois.reduce((a, p) => a + p.lng, 0) / dayPois.length,
    };
    const { ordered, polyline: pl } = await deps.orderDay({ stops: dayPois, anchor: centroid });
    polyline = pl;
    const travelById = new Map(ordered.map((o) => [o.placeId, o.travelMinutesFromPrev]));
    orderedStops = ordered
      .map((o) => attractions.find((s) => s.placeId === o.placeId))
      .filter((s): s is Stop => !!s)
      .map((s) => ({ ...s, travelMinutesFromPrev: travelById.get(s.placeId) }));
  }

  const lunch = target.stops.find((s) => s.mealSlot === "lunch")
    ?? { placeId: "", name: "Lunch — your pick", blurb: "Free time to grab a local bite.", kind: "meal-gap", dwellMinutes: 60 } as Stop;
  const dinner = target.stops.find((s) => s.mealSlot === "dinner")
    ?? { placeId: "", name: "Dinner — your pick", blurb: "Free time for dinner near sunset.", kind: "meal-gap", dwellMinutes: 60 } as Stop;

  const centLat = dayPois[0]?.lat ?? 0;
  const centLng = dayPois[0]?.lng ?? 0;
  const sunset = dayPois.length ? sunsetLocalMinutes(centLat, centLng, new Date()) : 19 * 60;

  const scheduled = buildDaySchedule({ attractions: orderedStops, sunsetMinutes: sunset, lunch, dinner });
  const newDay: ItineraryDay = { ...target, stops: scheduled, routePolyline: polyline };
  const newItin: Itinerary = { ...itin, days: itin.days.map((d) => (d.day === body.day ? newDay : d)) };
  await deps.saveItinerary(body.tripId, newItin);
  return { status: 200, body: { day: newDay } };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `deno test supabase/functions/edit-itinerary/handler_test.ts`
Expected: PASS.

- [ ] **Step 5: Write `index.ts`** (mirror `generate-itinerary/index.ts` wiring; auth-gated, admin client, RLS bypass via service key but scoped by loading the user's own trip)

```ts
// supabase/functions/edit-itinerary/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleEditItinerary, type EditItineraryDeps } from "./handler.ts";
import { orderStops } from "../../_shared/routes.ts";
import type { Itinerary } from "../../_shared/types.ts";

const ROUTES_KEY = Deno.env.get("GOOGLE_ROUTES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const userId = userData.user.id;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json() as { tripId?: string; day?: number };

  const deps: EditItineraryDeps = {
    loadItinerary: async (tripId) => {
      const { data } = await admin.from("trips").select("itinerary").eq("id", tripId).eq("user_id", userId).maybeSingle();
      return data ? (data.itinerary as Itinerary) : null;
    },
    coordsFor: async (placeIds) => {
      if (!placeIds.length) return {};
      const { data } = await admin.from("cached_pois").select("place_id, payload").in("place_id", placeIds);
      const out: Record<string, { lat: number; lng: number }> = {};
      for (const r of (data ?? []) as { place_id: string; payload: { lat: number; lng: number } }[]) {
        out[r.place_id] = { lat: r.payload.lat, lng: r.payload.lng };
      }
      return out;
    },
    orderDay: (o) => orderStops({ ...o, httpFetch: fetch, apiKey: ROUTES_KEY }),
    saveItinerary: async (tripId, itin) => {
      const { error } = await admin.from("trips").update({ itinerary: itin }).eq("id", tripId).eq("user_id", userId);
      if (error) throw error;
    },
  };

  try {
    const r = await handleEditItinerary(body, deps);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("edit-itinerary failed:", e instanceof Error ? e.stack ?? e.message : e);
    return new Response(JSON.stringify({ error: "edit failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/edit-itinerary/
git commit -m "feat(edit): edit-itinerary edge fn re-routes a day"
```

---

### Task 5: Client wrapper for the re-route call

**Files:**
- Create: `mobile/lib/editClient.ts`
- Test: `mobile/lib/editClient.test.ts`

**Interfaces:**
- Consumes: `ItineraryDay` from `./types`.
- Produces: `requestDayReroute(opts: { tripId: string; day: number; accessToken: string; baseUrl: string; fetchImpl?: typeof fetch }): Promise<ItineraryDay | null>` — returns the corrected day, or `null` on any failure (caller keeps the client estimate).

- [ ] **Step 1: Write failing test**

```ts
import { requestDayReroute } from "./editClient";

test("returns the day on 200", async () => {
  const day = { day: 1, lodgingPlaceId: null, stops: [] };
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ day }) }) as never;
  const out = await requestDayReroute({ tripId: "t", day: 1, accessToken: "a", baseUrl: "http://x", fetchImpl });
  expect(out).toEqual(day);
});

test("returns null on failure", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
  const out = await requestDayReroute({ tripId: "t", day: 1, accessToken: "a", baseUrl: "http://x", fetchImpl });
  expect(out).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- editClient`
Expected: FAIL.

- [ ] **Step 3: Implement `editClient.ts`**

```ts
// mobile/lib/editClient.ts
import type { ItineraryDay } from "./types";

export async function requestDayReroute(opts: {
  tripId: string; day: number; accessToken: string; baseUrl: string; fetchImpl?: typeof fetch;
}): Promise<ItineraryDay | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${opts.baseUrl}/functions/v1/edit-itinerary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.accessToken}` },
      body: JSON.stringify({ tripId: opts.tripId, day: opts.day }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { day?: ItineraryDay };
    return data.day ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- editClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/editClient.ts mobile/lib/editClient.test.ts
git commit -m "feat(edit): requestDayReroute client wrapper"
```

---

### Task 6: Edit mode + remove + persist + lazy merge (UI core)

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`
- Delete: `mobile/app/(app)/edit.tsx`

**Interfaces:**
- Consumes: `removeStop` (Task 1), `scheduleDayClient` (Task 2), `updateTripItinerary` (Task 3), `requestDayReroute` (Task 5), existing `coords` state + `getStopCoords`, `useAuth` for the access token, `getTrip`/`flow.data` for the current itinerary + `tripId`.
- Produces: local `edited` itinerary state + an `applyEdit(next, changedDay)` helper used by all ops.

- [ ] **Step 1: Introduce editable local state + `applyEdit`**

At the top of the component, derive a working itinerary and the trip id:

```ts
const resolvedTripId = (tripId as string | undefined) ?? flow.data?.tripId;
const [edited, setEdited] = useState<Itinerary | null>(null);
const [editing, setEditing] = useState(false);
const [approx, setApprox] = useState(false);
const { session } = useAuth();
const working = edited ?? data?.itinerary ?? { days: [] };
```

Replace `const days = data?.itinerary.days ?? []` usages with `working.days`. (Keep `data` for dates/lodging metadata.)

Add the shared apply routine:

```ts
async function applyEdit(next: Itinerary, changedDay: number) {
  const rescheduled: Itinerary = {
    ...next,
    days: next.days.map((d) => (d.day === changedDay ? scheduleDayClient(d, plainCoords) : d)),
  };
  setEdited(rescheduled);              // optimistic
  setApprox(true);
  if (!resolvedTripId) return;
  try {
    await updateTripItinerary(supabase, resolvedTripId, rescheduled);
  } catch {
    // revert on persist failure
    setEdited(edited);
    return;
  }
  const token = session?.access_token;
  if (!token) return;
  const fresh = await requestDayReroute({ tripId: resolvedTripId, day: changedDay, accessToken: token, baseUrl: extra.supabaseUrl });
  if (fresh) {
    setEdited((cur) => (cur ? { ...cur, days: cur.days.map((d) => (d.day === changedDay ? fresh : d)) } : cur));
    setApprox(false);
    await updateTripItinerary(supabase, resolvedTripId, { ...rescheduled, days: rescheduled.days.map((d) => (d.day === changedDay ? fresh : d)) }).catch(() => {});
  }
}
```

where `plainCoords` is `Record<string,{lat:number;lng:number}>` built from the existing `coords` state:

```ts
const plainCoords = useMemo(
  () => Object.fromEntries(Object.entries(coords).map(([k, v]) => [k, { lat: v.lat, lng: v.lng }])),
  [coords],
);
```

Add imports: `useState` already imported; add
`import { removeStop } from "../../lib/editItinerary";`
`import { scheduleDayClient } from "../../lib/scheduleClient";`
`import { updateTripItinerary } from "../../lib/trips";` (extend existing import),
`import { requestDayReroute } from "../../lib/editClient";`
`import { useAuth } from "../../lib/auth";`
`import type { Itinerary } from "../../lib/types";`

- [ ] **Step 2: Add an Edit toggle + "times approximate" note**

In the header row (next to "New trip"), add:

```tsx
<Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
  <Text variant="label" className="text-accent">{editing ? "Done" : "Edit"}</Text>
</Pressable>
```

Above the list, when `approx`:

```tsx
{approx ? <Text variant="caption" className="text-center text-ink-muted mb-1">Updating times…</Text> : null}
```

- [ ] **Step 3: Add a remove control on attraction cards (edit mode only)**

In the non-meal `renderItem` branch, when `editing`, add a remove button that maps the item to its attraction index within its day. Since `numberStops` assigns `num` to attractions (1-based), attraction index = `item.num - 1`:

```tsx
{editing && item.num != null ? (
  <Pressable onPress={() => applyEdit(removeStop(working, dayNumOf(section), item.num! - 1), dayNumOf(section))} hitSlop={8} className="absolute right-3 top-3">
    <Icon name="close" size={18} color="#6B5560" />
  </Pressable>
) : null}
```

Add a helper to recover a day number from a section. Extend the `sections` map to carry `day`:

```ts
const sections = working.days.map((d) => ({
  title: /* unchanged */,
  lodging: d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined,
  day: d.day,
  data: numberStops(d.stops),
}));
```

and `const dayNumOf = (section: { day: number }) => section.day;` (or inline `section.day`). Pass `section` into `renderItem` via the `section` arg it already receives.

- [ ] **Step 4: Typecheck + manual verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.
Manual (run skill/device): toggle Edit, remove an attraction → it disappears instantly, times shift, "Updating times…" flashes, reload the trip → change persisted.

- [ ] **Step 5: Commit**

```bash
git rm "mobile/app/(app)/edit.tsx"
git add "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(edit): edit mode with remove, client reschedule, persist + lazy re-route"
```

---

### Task 7: Reorder (drag) + move to day

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: `reorderStops`, `moveStopToDay` (Task 1), `applyEdit` (Task 6), `react-native-sortables`.

- [ ] **Step 1: Add a draggable attraction list per day in edit mode**

When `editing`, render each day's attractions with `react-native-sortables` (the passport screen already uses it — mirror that import/usage). On reorder end, call:

```tsx
onDragEnd={({ from, to }) => applyEdit(reorderStops(working, day, from, to), day)}
```

Use the same `Sortable` component/API the passport screen uses (check `mobile/app/(app)/(tabs)/passport.tsx` for the exact import — do not invent an API). Only attraction stops feed the sortable list; meals render as static rows between (or below) it.

- [ ] **Step 2: Add "Move to day N" action**

On each attraction card in edit mode, add a small overflow control opening an action list of the other day numbers:

```tsx
{editing && item.num != null ? (
  <View className="flex-row gap-2">
    {working.days.filter((d) => d.day !== section.day).map((d) => (
      <Pressable key={d.day} onPress={() => applyEdit(moveStopToDay(working, section.day, item.num! - 1, d.day), d.day)} className="px-2 py-1 rounded-pill bg-surface-2">
        <Text variant="label" className="text-ink-muted text-[12px]">→ Day {d.day}</Text>
      </Pressable>
    ))}
  </View>
) : null}
```

(After a cross-day move, both days change; `applyEdit` reschedules the destination day and persists — also reschedule the source day: call `applyEdit` once per affected day, or extend `applyEdit` to accept an array of changed days. Prefer extending: `applyEdit(next, [fromDay, toDay])` scheduling each.)

- [ ] **Step 2b: Extend `applyEdit` to accept one or more changed days**

Change the signature to `changedDays: number | number[]`, normalize to an array, reschedule each locally, and fire `requestDayReroute` per day (await all). Update Task 6 call sites to pass a single number (still valid).

- [ ] **Step 3: Typecheck + manual verify**

Run: `cd mobile && npx tsc --noEmit`
Manual: drag reorders within a day (times update); "→ Day 2" moves a stop and both days re-time; persists across reload.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(edit): drag-reorder and move-to-day"
```

---

### Task 8: Replace + add via search

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`
- Create: `mobile/lib/nearbyPicker.ts` (fetch alternative attractions for a day)

**Interfaces:**
- Consumes: `autocompletePlaces` (`./placesClient`), `replaceStop`/`addStop` (Task 1), `applyEdit`.
- Produces: `alternativesForDay(day, working, coords)` returning candidate `Stop`s — sourced from `autocompletePlaces` restricted to attraction types, plus a `fetchPlaceDetails`-equivalent for coords. To avoid a new details endpoint, reuse autocomplete `placeId` + name and let the lazy backend re-route fill coords (the client estimate falls back to `travelMinutesFromPrev` when coords are missing — acceptable, backend corrects).

- [ ] **Step 1: Add an "Add" row per day (edit mode)**

Under each day's stops when `editing`:

```tsx
{editing ? (
  <Pressable onPress={() => openAddSheet(section.day)} className="px-4 py-3 rounded-xl border border-dashed border-accent/50 items-center">
    <Text variant="label" className="text-accent">+ Add a place to Day {section.day}</Text>
  </Pressable>
) : null}
```

- [ ] **Step 2: Add the search sheet**

A modal/sheet with an `Input` bound to a debounced query (`useDebouncedValue`, already used in onboarding) → `autocompletePlaces({ query, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })`. Render results as rows; tapping a result:

```ts
function pickAdd(day: number, r: { placeId: string; text: string }) {
  const stop = { placeId: r.placeId, name: r.text, blurb: "Added by you.", kind: "attraction" as const, dwellMinutes: 60 };
  applyEdit(addStop(working, day, working.days.find((d) => d.day === day)!.stops.filter(isAttraction).length, stop), day);
  closeAddSheet();
}
```

(Insert at the end of the day's attractions.)

- [ ] **Step 3: Add "Replace" on attraction cards**

In edit mode, a "↻ Replace" control opens the same search sheet in replace mode (tracks the target attraction index):

```ts
function pickReplace(day: number, attrIndex: number, r: { placeId: string; text: string }) {
  const stop = { placeId: r.placeId, name: r.text, blurb: "Swapped by you.", kind: "attraction" as const, dwellMinutes: 60 };
  applyEdit(replaceStop(working, day, attrIndex, stop), day);
  closeAddSheet();
}
```

Import `isAttraction` from `../../lib/editItinerary`.

- [ ] **Step 4: Typecheck + manual verify**

Run: `cd mobile && npx tsc --noEmit`
Manual: "+ Add" searches, a pick inserts the stop and re-times; the backend re-route then supplies real travel + coords (marker appears on the map once cached). "Replace" swaps a stop in place.

Note: a freshly added/replaced place has no `cached_pois` row until the backend re-route routes it; until then its map marker and precise travel are absent. This is expected v1 behavior — the list still shows it with an approximate time.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(app)/itinerary.tsx" mobile/lib/nearbyPicker.ts
git commit -m "feat(edit): replace and add-via-search"
```

---

## Deploy (after all tasks green)

- [ ] Deploy the edge fn: `supabase functions deploy edit-itinerary`
- [ ] Full suites: `deno test supabase/` and `cd mobile && npm test && npx tsc --noEmit`
- [ ] Device smoke on the current EAS build (no new native dep here — `react-native-sortables` already shipped).

---

## Self-Review

- **Spec coverage:** remove/reorder/move (Tasks 1,6,7), replace/add (Tasks 1,8), client-instant reschedule (Task 2,6), lazy backend re-route (Tasks 4,5,6), persistence for saved + just-generated (Task 3 + `resolvedTripId`), error handling — persist-before-reroute, revert on persist failure, "times approximate" (Task 6). ✓
- **Placeholder scan:** the one deliberate open item is the exact `react-native-sortables` API in Task 7 — flagged to copy from `passport.tsx` rather than invented (avoids guessing a wrong signature). No TODO/TBD code.
- **Type consistency:** `applyEdit(next, changedDays)` unified in Task 7 step 2b; `Stop`/`Itinerary`/`ItineraryDay` used consistently; `isAttraction` shared from `editItinerary.ts` across client + reused pattern in backend. `requestDayReroute` returns `ItineraryDay | null` matching Task 6 merge. ✓
- **Known v1 limitation (documented):** added/replaced places lack `cached_pois` coords until the backend re-route runs; map marker + exact travel appear after that round-trip.
