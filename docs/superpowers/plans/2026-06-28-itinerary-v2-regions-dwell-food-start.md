# Itinerary v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add region narrowing for large destinations, per-place dwell-time estimates, interest-driven stops with food separated into meal stops (with sunset-timed dinner), and an optional start location that anchors day 1 and the final day.

**Architecture:** Backend is Deno edge functions over a thin `_shared/` library, fully dependency-injected and unit-tested with fakes (`handler.ts` pattern). The LLM curates an itinerary from Google Places POIs; routing is a round-trip per day. Mobile is Expo/React Native; all mobile logic lives in pure `lib/*.ts` with `lib/*.test.ts` (no render harness). We extend the existing pipeline rather than restructure it.

**Tech Stack:** Deno + TypeScript (`jsr:@std/assert`), Supabase (Postgres + edge functions), Google Places/Routes APIs, an OpenAI-compatible LLM via `makeLlmComplete`, Expo/React Native + NativeWind, Jest (`jest-expo`).

## Global Constraints

- Backend tests run from repo root: `deno test supabase/_shared/<file>` or `deno test supabase/functions/<fn>/<file>`. No deno config file; tests import `jsr:@std/assert` and relative `./x.ts`.
- Mobile tests run from `mobile/`: `npm test -- <pattern>`; typecheck `npx tsc --noEmit`. No React-Native render-testing library exists — **do not add one**. Test pure helpers in `lib/*.test.ts`; screen `.tsx` changes are verified by `tsc` + the helper tests.
- `mobile/lib/types.ts` is a hand-kept MIRROR of `supabase/_shared/types.ts`. When one changes, change both.
- Cache tables are service-role write / authenticated read, matching `cached_pois`. Edge functions use the service-role key (bypasses RLS).
- Meal-gap stops carry `placeId: ""` and are inserted by the handler AFTER routing, so they never reach routing (the `byId` filter drops them) or map markers (coord filter drops them) or LLM validation.
- Read the exact versioned Expo docs at https://docs.expo.dev/versions/v56.0.0/ before writing mobile code.

---

### Task 1: Solar module (sunset calculator)

Pure NOAA sunset math, no deps, no network. Used by the dinner meal-gap in Task 5.

**Files:**
- Create: `supabase/_shared/solar.ts`
- Test: `supabase/_shared/solar_test.ts`

**Interfaces:**
- Produces: `sunsetLocalMinutes(lat: number, lng: number, date: Date): number` — minutes from local midnight (0–1439) of sunset, using a longitude-based timezone approximation (so longitude cancels and the result is local *solar* time). `formatClock(minutes: number): string` — e.g. `"7:15 PM"`.

- [ ] **Step 1: Write the failing test**

Create `supabase/_shared/solar_test.ts`:

```ts
import { assert } from "jsr:@std/assert";
import { sunsetLocalMinutes, formatClock } from "./solar.ts";

Deno.test("SF summer sunset is ~19:00-20:00 local solar", () => {
  const m = sunsetLocalMinutes(37.77, -122.42, new Date(Date.UTC(2026, 5, 21)));
  assert(m > 19 * 60 && m < 20 * 60, `got ${m}`);
});

Deno.test("SF winter sunset is ~16:30-17:30 local solar", () => {
  const m = sunsetLocalMinutes(37.77, -122.42, new Date(Date.UTC(2026, 11, 21)));
  assert(m > 16 * 60 + 30 && m < 17 * 60 + 30, `got ${m}`);
});

Deno.test("equator sunset is near 18:00 year-round", () => {
  const m = sunsetLocalMinutes(0, 0, new Date(Date.UTC(2026, 2, 21)));
  assert(Math.abs(m - 18 * 60) < 20, `got ${m}`);
});

Deno.test("formatClock formats 12h clock", () => {
  assert(formatClock(19 * 60 + 15) === "7:15 PM", formatClock(19 * 60 + 15));
  assert(formatClock(0) === "12:00 AM", formatClock(0));
  assert(formatClock(12 * 60 + 30) === "12:30 PM", formatClock(12 * 60 + 30));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/_shared/solar_test.ts`
Expected: FAIL — `Module not found "./solar.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/_shared/solar.ts`:

```ts
// supabase/_shared/solar.ts
// NOAA sunset approximation. Pure, no deps, no network.
// ponytail: timezone approximated as lng/15 h, so longitude cancels and the
// result is local *solar* time. Swap for a real tz lookup if exact wall-clock
// time ever matters.

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - start) / 86_400_000);
}

// Minutes from local midnight (0-1439) of sunset at lat/lng on `date`.
export function sunsetLocalMinutes(lat: number, lng: number, date: Date): number {
  const rad = Math.PI / 180;
  const n = dayOfYear(date);
  const gamma = (2 * Math.PI / 365) * (n - 1 + 0.5);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const zenith = 90.833 * rad;
  const cosH = Math.cos(zenith) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosH < -1) return 1439; // polar day: sun stays up
  if (cosH > 1) return 0;     // polar night: sun stays down
  const ha = Math.acos(cosH) / rad; // hour angle, degrees
  const solarNoonUTC = 720 - 4 * lng - eqtime; // UTC minutes
  const sunsetUTC = solarNoonUTC + 4 * ha;
  const tzOffsetMin = (lng / 15) * 60; // approx tz; cancels the -4*lng above
  const minutes = sunsetUTC + tzOffsetMin;
  return Math.max(0, Math.min(1439, Math.round(minutes)));
}

export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/_shared/solar_test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/solar.ts supabase/_shared/solar_test.ts
git commit -m "feat(backend): NOAA sunset calculator for meal-gap timing"
```

---

### Task 2: Schema/type foundation + migration

Add the new optional `Stop` fields, the `startLocation`/`startPlaceId` request fields, and the two cache tables. Backend types are mirrored into mobile.

**Files:**
- Create: `supabase/migrations/0002_itinerary_v2.sql`
- Modify: `supabase/_shared/types.ts` (`Stop`)
- Modify: `supabase/functions/generate-itinerary/handler.ts:8-13` (`GenerateRequest`)
- Modify: `mobile/lib/types.ts` (`Stop`)
- Modify: `mobile/lib/api.ts:4-9` (`GenerateRequest`)
- Test: `supabase/_shared/schema_test.ts` (guard test)

**Interfaces:**
- Produces: `Stop` gains `dwellMinutes?: number`, `kind?: "attraction" | "meal" | "meal-gap"`, `suggestedTime?: string`. `GenerateRequest` gains `startLocation?: string`, `startPlaceId?: string`. Tables `region_suggestions(country_place_id pk, payload jsonb, updated_at)` and `place_dwell(place_id pk, minutes int, updated_at)`.

- [ ] **Step 1: Write the failing test**

Append to `supabase/_shared/schema_test.ts`:

```ts
Deno.test("sanitizeItinerary preserves dwellMinutes, kind, suggestedTime", () => {
  const it: Itinerary = {
    days: [{ day: 1, lodgingPlaceId: null, stops: [
      { placeId: "A", name: "A", blurb: "x", dwellMinutes: 90, kind: "attraction" },
      { placeId: "", name: "Lunch", blurb: "y", kind: "meal-gap", dwellMinutes: 60, suggestedTime: "12:30 PM" },
    ] }],
  };
  const out = sanitizeItinerary(it, new Set(["A"]));
  assertEquals(out.days[0].stops[0].dwellMinutes, 90);
  assertEquals(out.days[0].stops[0].kind, "attraction");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/_shared/schema_test.ts`
Expected: FAIL — type error: `'dwellMinutes' does not exist in type 'Stop'`.

- [ ] **Step 3: Write minimal implementation**

In `supabase/_shared/types.ts`, replace the `Stop` interface with:

```ts
export interface Stop {
  placeId: string;                 // "" for meal-gap pseudo-stops
  name: string;
  blurb: string;                       // "why a local picks this"
  travelMinutesFromPrev?: number;
  dwellMinutes?: number;               // realistic visit length
  kind?: "attraction" | "meal" | "meal-gap";
  suggestedTime?: string;              // e.g. "12:30 PM" — meal stops only
}
```

In `supabase/functions/generate-itinerary/handler.ts`, extend `GenerateRequest`:

```ts
export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
  startLocation?: string;
  startPlaceId?: string;
}
```

In `mobile/lib/types.ts`, mirror the `Stop` change exactly (same fields/comments).

In `mobile/lib/api.ts`, extend `GenerateRequest`:

```ts
export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
  startLocation?: string;
  startPlaceId?: string;
}
```

Create `supabase/migrations/0002_itinerary_v2.sql`:

```sql
-- supabase/migrations/0002_itinerary_v2.sql
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

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/_shared/schema_test.ts`
Expected: PASS.
Run: `cd mobile && npx tsc --noEmit` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/types.ts supabase/functions/generate-itinerary/handler.ts mobile/lib/types.ts mobile/lib/api.ts supabase/migrations/0002_itinerary_v2.sql supabase/_shared/schema_test.ts
git commit -m "feat: add dwell/meal/start fields and v2 cache tables"
```

---

### Task 3: Interest-priority + dwell + meal prompt

Rewrite `buildPrompt` so the LLM prioritizes interest-matched attractions, returns a per-stop `dwellMinutes`, and (only when `food` is selected) adds up to 2 meal stops/day.

**Files:**
- Modify: `supabase/_shared/llm.ts`
- Test: `supabase/_shared/llm_test.ts`

**Interfaces:**
- Consumes: `Poi`, `Prefs` (unchanged signature `buildPrompt(pois, prefs, tripDays): string`).

- [ ] **Step 1: Write the failing test**

Append to `supabase/_shared/llm_test.ts`:

```ts
Deno.test("prompt asks for dwellMinutes and interest prioritization", () => {
  const p = buildPrompt([], { interests: ["scenic"], budget: "mid", pace: "balanced", transport: "balanced" }, 2);
  assertStringIncludes(p, "dwellMinutes");
  assertStringIncludes(p, "Prioritize");
});

Deno.test("prompt adds meal guidance only when food is selected", () => {
  const base = { budget: "mid", pace: "balanced", transport: "balanced" } as const;
  const withFood = buildPrompt([], { ...base, interests: ["food"] }, 2);
  const noFood = buildPrompt([], { ...base, interests: ["scenic"] }, 2);
  assertStringIncludes(withFood, "food stops per day");
  assert(!noFood.includes("food stops per day"), "no-food prompt must omit meal guidance");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: FAIL — string assertions (`"Prioritize"`, `"dwellMinutes"`) not found.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `buildPrompt` in `supabase/_shared/llm.ts`:

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
  const wantsFood = prefs.interests.includes("food");
  const lines = [
    `You are a local guide planning a ${tripDays}-day trip.`,
    `Traveler preferences: ${prefLine}`,
    `Choose from ONLY these places. Use the exact placeId values. Do not invent places:`,
    JSON.stringify(poiList),
    `Prioritize attractions that match the traveler's interests: scenic -> viewpoints/landmarks, outdoors -> parks/nature/trails, nightlife -> night markets/bars/late venues, history -> historic sites/museums, art -> galleries/installations, shopping -> markets/districts. Lead each day with the strongest interest matches.`,
    `Group nearby places into the same day. For each stop write a one-sentence "why a local picks this" blurb.`,
    `For each stop include "dwellMinutes": a realistic visit length (quick viewpoint ~30, museum ~120, large park ~150, meal ~60). Vary it; do not make every stop the same.`,
    `Aim for about ${PACE_STOPS[prefs.pace]} attraction stops per day (pace=${prefs.pace}).`,
  ];
  if (wantsFood) {
    lines.push(`Include up to 2 food stops per day (a lunch and a dinner) chosen from the food places above. Mark each with "kind":"meal" and a shorter dwellMinutes (~60). Food stops are meals and rest, not main attractions.`);
  }
  lines.push(
    `Respond with ONLY valid JSON (no markdown fences), matching exactly this shape:`,
    `{"days":[{"day":1,"lodgingPlaceId":null,"stops":[{"placeId":"...","name":"...","blurb":"...","dwellMinutes":90,"kind":"attraction"}]}]}`,
  );
  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: PASS (existing tests + 2 new). If an existing test asserted exact prompt wording that changed, update it to match the new lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/llm.ts supabase/_shared/llm_test.ts
git commit -m "feat(backend): interest-priority + dwell + conditional meal prompt"
```

---

### Task 4: Handler — food gating + start-location anchor

Fetch food POIs only when `food` is selected. Resolve an optional start location and use it as the route anchor for day 1 and the final day.

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts`
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Consumes: `HandlerDeps.resolveDestination` (reused to resolve start), `GenerateRequest.startLocation/startPlaceId` (Task 2).
- Produces: no signature change; behavior — `fetchPois(kind:"food")` called iff `prefs.interests` includes `"food"`; day 1 and last day route anchor = resolved start when provided.

- [ ] **Step 1: Write the failing test**

Append to `supabase/functions/generate-itinerary/handler_test.ts`:

```ts
Deno.test("does not fetch food unless 'food' interest selected", async () => {
  const kinds: string[] = [];
  const deps = baseDeps({ fetchPois: ({ kind }) => { kinds.push(kind); return Promise.resolve(kind === "lodging" ? lodging : attractions); } });
  await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assert(!kinds.includes("food"), `food fetched: ${kinds.join(",")}`);
});

Deno.test("fetches food when 'food' interest selected", async () => {
  const kinds: string[] = [];
  const deps = baseDeps({ fetchPois: ({ kind }) => { kinds.push(kind); return Promise.resolve(kind === "lodging" ? lodging : attractions); } });
  await handleGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, "u1", deps);
  assert(kinds.includes("food"), `food not fetched: ${kinds.join(",")}`);
});

Deno.test("day 1 and last day anchor on the start location", async () => {
  const threeDay: Itinerary = { days: [
    { day: 1, lodgingPlaceId: null, stops: [{ placeId: "A1", name: "A1", blurb: "x" }] },
    { day: 2, lodgingPlaceId: null, stops: [{ placeId: "A2", name: "A2", blurb: "x" }] },
    { day: 3, lodgingPlaceId: null, stops: [{ placeId: "A3", name: "A3", blurb: "x" }] },
  ] };
  const anchors: { lat: number; lng: number }[] = [];
  const deps = baseDeps({
    resolveDestination: ({ placeId }) => Promise.resolve(
      placeId === "START" ? { center: { lat: 5, lng: 5 }, viewport: null } : { center: { lat: 1, lng: 1 }, viewport: null }),
    fetchPois: ({ kind }) => Promise.resolve(
      kind === "lodging" ? lodging : [
        { placeId: "A1", name: "A1", kind: "attraction", lat: 0, lng: 0 },
        { placeId: "A2", name: "A2", kind: "attraction", lat: 0, lng: 0 },
        { placeId: "A3", name: "A3", kind: "attraction", lat: 0, lng: 0 },
      ]),
    curate: () => Promise.resolve(threeDay),
    orderStops: ({ stops, anchor }) => { anchors.push(anchor); return Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 0 })), polyline: undefined }); },
  });
  await handleGenerate({ location: "X", tripDays: 3, destinationPlaceId: "DEST", startPlaceId: "START", prefs }, "u1", deps);
  assertEquals(anchors.length, 3);
  assertEquals(anchors[0], { lat: 5, lng: 5 }); // day 1 -> start
  assertEquals(anchors[2], { lat: 5, lng: 5 }); // last day -> start
  assertEquals(anchors[1], { lat: 9, lng: 9 }); // middle day -> lodging
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: FAIL — food still fetched unconditionally; anchors all `{9,9}` (lodging).

- [ ] **Step 3: Write minimal implementation**

In `supabase/functions/generate-itinerary/handler.ts`, replace the fetch block and routing loop. After computing `locationBias` and `travelMode`, use:

```ts
  const wantsFood = body.prefs.interests.includes("food");
  const [attractions, food, lodging] = await Promise.all([
    deps.fetchPois({ location: body.location, kind: "attraction", prefs: body.prefs, locationBias }),
    wantsFood
      ? deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs, locationBias })
      : Promise.resolve([] as Poi[]),
    deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs, locationBias }),
  ]);

  const start = (body.startPlaceId || body.startLocation)
    ? await deps.resolveDestination({ placeId: body.startPlaceId, location: body.startLocation ?? "" })
    : null;
  const startCenter = start && (start.center.lat !== 0 || start.center.lng !== 0) ? start.center : null;
```

(The `const pois = [...attractions, ...food];` and `anchorPoi` lines stay as-is.)

Then replace the per-day routing `Promise.all` with anchor selection:

```ts
  const lastDay = itinerary.days.length;
  await Promise.all(itinerary.days.map(async (day) => {
    day.lodgingPlaceId = anchorPoi?.placeId ?? null;
    // Day 1 and the final day anchor on the traveler's start location when set,
    // so the route begins/returns at home/airport instead of a random point.
    const startAnchor = startCenter && (day.day === 1 || day.day === lastDay) ? startCenter : null;
    if (!startAnchor && !anchorPoi && !hasCenter) {
      day.routePolyline = undefined;
      return;
    }
    const anchor = startAnchor ?? (anchorPoi ? { lat: anchorPoi.lat, lng: anchorPoi.lng } : dest.center);
    const dayPois = day.stops.map((s) => byId.get(s.placeId)).filter((p): p is Poi => !!p);
    const { ordered, polyline } = await deps.orderStops({ stops: dayPois, anchor, travelMode });
    const minutesById = new Map(ordered.map((o) => [o.placeId, o.travelMinutesFromPrev]));
    day.stops = ordered.map((o) => {
      const stop = day.stops.find((s) => s.placeId === o.placeId)!;
      return { ...stop, travelMinutesFromPrev: minutesById.get(o.placeId) };
    });
    day.routePolyline = polyline;
  }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(backend): gate food on interest; anchor day 1 + last day on start"
```

---

### Task 5: Handler — per-place dwell cache + meal gaps

After routing: merge dwell from cache (prefer cached, persist new estimates); and when food is NOT selected, insert lunch + sunset-timed dinner meal-gap pseudo-stops per day.

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts` (HandlerDeps + post-routing pass)
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Consumes: `sunsetLocalMinutes`, `formatClock` (Task 1); `wantsFood`, `dest.center`, `anchorPoi` (Task 4 scope).
- Produces: `HandlerDeps` gains `fetchDwell(placeIds: string[]): Promise<Record<string, number>>` and `saveDwell(entries: { placeId: string; minutes: number }[]): Promise<void>`. Real stops get `dwellMinutes` from cache when present; new estimates are upserted. Food-off days gain two `kind:"meal-gap"` stops (`placeId:""`, `dwellMinutes:60`, `suggestedTime` set; dinner = sunset).

- [ ] **Step 1: Write the failing test**

First extend the `baseDeps` helper in `handler_test.ts` to supply the new deps (add inside the returned object):

```ts
    fetchDwell: () => Promise.resolve({}),
    saveDwell: () => Promise.resolve(),
```

Then append tests:

```ts
Deno.test("prefers cached dwell and saves newly-seen estimates", async () => {
  const saved: { placeId: string; minutes: number }[] = [];
  const curated: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [
    { placeId: "A", name: "A", blurb: "x", dwellMinutes: 30 },
    { placeId: "B", name: "B", blurb: "x", dwellMinutes: 45 },
  ] }] };
  const deps = baseDeps({
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : [
      { placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 },
      { placeId: "B", name: "B", kind: "attraction", lat: 0, lng: 0 },
    ]),
    curate: () => Promise.resolve(curated),
    orderStops: ({ stops }) => Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 0 })), polyline: undefined }),
    fetchDwell: () => Promise.resolve({ A: 99 }),         // A cached, B not
    saveDwell: (e) => { saved.push(...e); return Promise.resolve(); },
  });
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  const days = (r.body as { itinerary: Itinerary }).itinerary.days;
  const byId = Object.fromEntries(days[0].stops.map((s) => [s.placeId, s]));
  assertEquals(byId["A"].dwellMinutes, 99);              // cache wins
  assertEquals(byId["B"].dwellMinutes, 45);              // llm value kept
  assertEquals(saved, [{ placeId: "B", minutes: 45 }]);  // only the new one saved
});

Deno.test("inserts lunch + dinner meal gaps when food not selected", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps());
  const stops = (r.body as { itinerary: Itinerary }).itinerary.days[0].stops;
  const gaps = stops.filter((s) => s.kind === "meal-gap");
  assertEquals(gaps.length, 2);
  assert(gaps.every((g) => g.placeId === "" && g.dwellMinutes === 60 && !!g.suggestedTime));
});

Deno.test("no meal gaps when food selected", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, "u1", baseDeps());
  const stops = (r.body as { itinerary: Itinerary }).itinerary.days[0].stops;
  assertEquals(stops.filter((s) => s.kind === "meal-gap").length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: FAIL — `fetchDwell`/`saveDwell` not in `HandlerDeps` (type error), and no meal-gaps inserted.

- [ ] **Step 3: Write minimal implementation**

In `handler.ts`, add the import at the top:

```ts
import { sunsetLocalMinutes, formatClock } from "../../_shared/solar.ts";
```

Add to the `HandlerDeps` interface:

```ts
  fetchDwell(placeIds: string[]): Promise<Record<string, number>>;
  saveDwell(entries: { placeId: string; minutes: number }[]): Promise<void>;
```

After the routing `Promise.all(...)` block and before `saveTrip`, insert:

```ts
  // Per-place dwell: prefer the cached value (deterministic across regens),
  // persist any newly-seen LLM estimate so the dataset grows over time.
  const stopIds = itinerary.days.flatMap((d) => d.stops.map((s) => s.placeId)).filter((id) => id);
  const cachedDwell = await deps.fetchDwell(stopIds);
  const newDwell: { placeId: string; minutes: number }[] = [];
  for (const day of itinerary.days) {
    for (const s of day.stops) {
      if (!s.placeId) continue;
      const cached = cachedDwell[s.placeId];
      if (cached != null) s.dwellMinutes = cached;
      else if (s.dwellMinutes != null) newDwell.push({ placeId: s.placeId, minutes: s.dwellMinutes });
    }
  }
  if (newDwell.length) await deps.saveDwell(newDwell);

  // Food not selected: reserve time for free-range meals. Lunch mid-day, dinner
  // at local sunset. Pseudo-stops have no placeId, so they never route or map.
  if (!wantsFood) {
    const sunLat = anchorPoi?.lat ?? dest.center.lat;
    const sunLng = anchorPoi?.lng ?? dest.center.lng;
    itinerary.days.forEach((day, i) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + i);
      const sunsetMin = (anchorPoi || hasCenter) ? sunsetLocalMinutes(sunLat, sunLng, date) : 19 * 60;
      const lunch = { placeId: "", name: "Lunch — your pick", blurb: "Free time to grab a local bite.", kind: "meal-gap" as const, dwellMinutes: 60, suggestedTime: "12:30 PM" };
      const dinner = { placeId: "", name: "Dinner — your pick", blurb: "Free time for dinner near sunset.", kind: "meal-gap" as const, dwellMinutes: 60, suggestedTime: formatClock(sunsetMin) };
      const mid = Math.ceil(day.stops.length / 2);
      day.stops = [...day.stops.slice(0, mid), lunch, ...day.stops.slice(mid), dinner];
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: PASS.

- [ ] **Step 5: Wire real deps in index.ts**

In `supabase/functions/generate-itinerary/index.ts`, add to the `deps` object:

```ts
    fetchDwell: async (placeIds) => {
      if (placeIds.length === 0) return {};
      const { data } = await admin.from("place_dwell").select("place_id, minutes").in("place_id", placeIds);
      return Object.fromEntries((data ?? []).map((r: { place_id: string; minutes: number }) => [r.place_id, r.minutes]));
    },
    saveDwell: async (entries) => {
      await admin.from("place_dwell").upsert(entries.map((e) => ({ place_id: e.placeId, minutes: e.minutes, updated_at: new Date().toISOString() })));
    },
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts supabase/functions/generate-itinerary/index.ts
git commit -m "feat(backend): per-place dwell cache + sunset-timed meal gaps"
```

---

### Task 6: Autocomplete surfaces place types

`searchAutocomplete` must return each suggestion's `types` so the client can detect countries/states. The Google response already carries them.

**Files:**
- Modify: `supabase/_shared/places.ts:88-110` (`searchAutocomplete`)
- Modify: `supabase/functions/places-autocomplete/handler.ts` (`AutocompleteDeps.search` return type)
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Produces: `searchAutocomplete(...)` resolves `{ text: string; placeId: string; types: string[] }[]`.

- [ ] **Step 1: Write the failing test**

Append to `supabase/_shared/places_test.ts` (match the file's existing fake-fetch style; this is the shape to assert):

```ts
Deno.test("searchAutocomplete surfaces prediction types", async () => {
  const httpFetch = ((_url: string, _init?: RequestInit) => Promise.resolve(new Response(JSON.stringify({
    suggestions: [{ placePrediction: { placeId: "c1", text: { text: "China" }, types: ["country"] } }],
  })))) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "china", httpFetch, apiKey: "k" });
  assertEquals(out[0].types, ["country"]);
});
```

(Ensure `searchAutocomplete` and `assertEquals` are imported at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/_shared/places_test.ts`
Expected: FAIL — `types` is `undefined` / not on the result type.

- [ ] **Step 3: Write minimal implementation**

In `supabase/_shared/places.ts`, update `searchAutocomplete`'s return type and mapping:

```ts
export async function searchAutocomplete(opts: {
  query: string;
  httpFetch: HttpFetch;
  apiKey: string;
}): Promise<{ text: string; placeId: string; types: string[] }[]> {
```

and the data type + map:

```ts
  const data = await res.json() as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; types?: string[] } }>;
  };
  return (data.suggestions ?? [])
    .map((s) => ({
      text: s.placePrediction?.text?.text ?? "",
      placeId: s.placePrediction?.placeId ?? "",
      types: s.placePrediction?.types ?? [],
    }))
    .filter((s) => s.text && s.placeId)
    .slice(0, 5);
```

In `supabase/functions/places-autocomplete/handler.ts`, update the deps type:

```ts
export interface AutocompleteDeps {
  search(query: string): Promise<{ text: string; placeId: string; types: string[] }[]>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/_shared/places_test.ts`
Then `deno test supabase/functions/places-autocomplete/handler_test.ts` — Expected: PASS. The `search` fixture at `handler_test.ts:7` must add `types`:

```ts
    search: () => Promise.resolve([{ text: "Lisbon, Portugal", placeId: "p1", types: [] }]),
```

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/functions/places-autocomplete/handler.ts supabase/_shared/places_test.ts
git commit -m "feat(backend): surface place types from autocomplete"
```

---

### Task 7: Region suggestions (module + edge function)

New `suggest-regions` function: cache-check → area gate → LLM (returns `[]` for sparse places) → cache.

**Files:**
- Create: `supabase/_shared/regions.ts`
- Test: `supabase/_shared/regions_test.ts`
- Create: `supabase/functions/suggest-regions/handler.ts`
- Test: `supabase/functions/suggest-regions/handler_test.ts`
- Create: `supabase/functions/suggest-regions/index.ts`

**Interfaces:**
- Consumes: `areaRadiusKm` + `Viewport` (`_shared/area.ts`), `LlmComplete` (`_shared/types.ts`), `fetchPlaceDetails` (`_shared/places.ts`), `makeLlmComplete` (`_shared/llm_adapter.ts`).
- Produces: `Region { label: string; hook: string }`; `suggestRegions(placeId, deps): Promise<Region[]>`; `SuggestRegionsDeps`; `handleSuggestRegions(body, deps): Promise<{status,body}>`.

- [ ] **Step 1: Write the failing test**

Create `supabase/_shared/regions_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { suggestRegions, type SuggestRegionsDeps, type Region } from "./regions.ts";

const bigVp = { low: { lat: 32, lng: -124 }, high: { lat: 42, lng: -114 } }; // ~California
const tinyVp = { low: { lat: 40.0, lng: -74.02 }, high: { lat: 40.05, lng: -73.98 } };

function deps(over: Partial<SuggestRegionsDeps> = {}): SuggestRegionsDeps {
  return {
    getCached: () => Promise.resolve(null),
    putCached: () => Promise.resolve(),
    getDetails: () => Promise.resolve({ viewport: bigVp, name: "California" }),
    llmComplete: () => Promise.resolve(JSON.stringify({ regions: [{ label: "NorCal", hook: "Yosemite, SF" }] })),
    ...over,
  };
}

Deno.test("returns cached regions without calling details/llm", async () => {
  let called = false;
  const out = await suggestRegions("p", deps({
    getCached: () => Promise.resolve([{ label: "X", hook: "y" }]),
    getDetails: () => { called = true; return Promise.resolve({ viewport: bigVp, name: "n" }); },
  }));
  assertEquals(out, [{ label: "X", hook: "y" }]);
  assertEquals(called, false);
});

Deno.test("small area returns [] without calling the llm", async () => {
  let llmCalled = false;
  const out = await suggestRegions("p", deps({
    getDetails: () => Promise.resolve({ viewport: tinyVp, name: "Brooklyn" }),
    llmComplete: () => { llmCalled = true; return Promise.resolve("{}"); },
  }));
  assertEquals(out, []);
  assertEquals(llmCalled, false);
});

Deno.test("large area returns parsed llm regions and caches them", async () => {
  const cached: Region[][] = [];
  const out = await suggestRegions("p", deps({ putCached: (_id, r) => { cached.push(r); return Promise.resolve(); } }));
  assertEquals(out, [{ label: "NorCal", hook: "Yosemite, SF" }]);
  assertEquals(cached[0], out);
});

Deno.test("malformed llm output yields []", async () => {
  const out = await suggestRegions("p", deps({ llmComplete: () => Promise.resolve("not json") }));
  assertEquals(out, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/_shared/regions_test.ts`
Expected: FAIL — `Module not found "./regions.ts"`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/_shared/regions.ts`:

```ts
// supabase/_shared/regions.ts
import type { LlmComplete } from "./types.ts";
import { areaRadiusKm, type Viewport } from "./area.ts";

export interface Region { label: string; hook: string; }

// Below this radius a place is a city/neighborhood — not worth narrowing.
export const REGION_MIN_RADIUS_KM = 60;

export interface SuggestRegionsDeps {
  getCached(placeId: string): Promise<Region[] | null>;
  putCached(placeId: string, regions: Region[]): Promise<void>;
  getDetails(placeId: string): Promise<{ viewport: Viewport; name: string }>;
  llmComplete: LlmComplete;
}

export async function suggestRegions(placeId: string, deps: SuggestRegionsDeps): Promise<Region[]> {
  const cached = await deps.getCached(placeId);
  if (cached) return cached;
  const { viewport, name } = await deps.getDetails(placeId);
  const radius = areaRadiusKm({ viewport, transport: "far" });
  const regions = radius >= REGION_MIN_RADIUS_KM ? await llmRegions(name, deps.llmComplete) : [];
  await deps.putCached(placeId, regions);
  return regions;
}

async function llmRegions(name: string, llmComplete: LlmComplete): Promise<Region[]> {
  const prompt = [
    `List up to 5 distinct travel regions of ${name}.`,
    `Each region has a short label and a one-line hook naming standout attractions.`,
    `If ${name} has few notable sub-areas, return an empty array.`,
    `Respond with ONLY JSON (no markdown fences): {"regions":[{"label":"...","hook":"..."}]}`,
  ].join("\n");
  try {
    const data = JSON.parse(await llmComplete(prompt)) as { regions?: Region[] };
    return (data.regions ?? [])
      .filter((r) => r && typeof r.label === "string" && typeof r.hook === "string")
      .slice(0, 5);
  } catch {
    return [];
  }
}
```

Create `supabase/functions/suggest-regions/handler.ts`:

```ts
// supabase/functions/suggest-regions/handler.ts
import { suggestRegions, type SuggestRegionsDeps } from "../../_shared/regions.ts";

export interface RegionsRequest { placeId?: string; }

export async function handleSuggestRegions(
  body: RegionsRequest,
  deps: SuggestRegionsDeps,
): Promise<{ status: number; body: unknown }> {
  const placeId = (body?.placeId ?? "").trim();
  if (!placeId) return { status: 400, body: { error: "placeId required" } };
  try {
    const regions = await suggestRegions(placeId, deps);
    return { status: 200, body: { regions } };
  } catch (e) {
    console.error("suggest-regions error:", e instanceof Error ? e.message : e);
    return { status: 502, body: { error: "suggest regions failed" } };
  }
}
```

Create `supabase/functions/suggest-regions/handler_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { handleSuggestRegions } from "./handler.ts";
import type { SuggestRegionsDeps } from "../../_shared/regions.ts";

const deps: SuggestRegionsDeps = {
  getCached: () => Promise.resolve([{ label: "NorCal", hook: "Yosemite" }]),
  putCached: () => Promise.resolve(),
  getDetails: () => Promise.resolve({ viewport: null, name: "n" }),
  llmComplete: () => Promise.resolve("{}"),
};

Deno.test("400 when placeId missing", async () => {
  const r = await handleSuggestRegions({}, deps);
  assertEquals(r.status, 400);
});

Deno.test("200 returns regions", async () => {
  const r = await handleSuggestRegions({ placeId: "p" }, deps);
  assertEquals(r.status, 200);
  assertEquals((r.body as { regions: unknown }).regions, [{ label: "NorCal", hook: "Yosemite" }]);
});
```

Create `supabase/functions/suggest-regions/index.ts`:

```ts
// supabase/functions/suggest-regions/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleSuggestRegions } from "./handler.ts";
import { fetchPlaceDetails } from "../../_shared/places.ts";
import { makeLlmComplete } from "../../_shared/llm_adapter.ts";
import type { Region } from "../../_shared/regions.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LLM_KEY = Deno.env.get("LLM_API_KEY")!;
const LLM_ENDPOINT = Deno.env.get("LLM_ENDPOINT")!;
const LLM_MODEL = Deno.env.get("LLM_MODEL")!;
const llmComplete = makeLlmComplete({ httpFetch: fetch, apiKey: LLM_KEY, endpoint: LLM_ENDPOINT, model: LLM_MODEL });

Deno.serve(async (req: Request) => {
  let body: { placeId?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const result = await handleSuggestRegions(body, {
    getCached: async (placeId) => {
      const { data } = await admin.from("region_suggestions").select("payload").eq("country_place_id", placeId).maybeSingle();
      return data ? (data.payload as Region[]) : null;
    },
    putCached: async (placeId, regions) => {
      await admin.from("region_suggestions").upsert({ country_place_id: placeId, payload: regions, updated_at: new Date().toISOString() });
    },
    getDetails: async (placeId) => {
      const d = await fetchPlaceDetails({ placeId, httpFetch: fetch, apiKey: PLACES_KEY });
      return { viewport: d.viewport, name: d.name };
    },
    llmComplete,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/_shared/regions_test.ts supabase/functions/suggest-regions/handler_test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/regions.ts supabase/_shared/regions_test.ts supabase/functions/suggest-regions/
git commit -m "feat(backend): suggest-regions edge fn with area gate + LLM + cache"
```

---

### Task 8: Mobile client — regions, types passthrough, start fields

Client for `suggest-regions`; surface `types` from autocomplete; pure helper `shouldOfferRegions`; carry start fields through onboarding state.

**Files:**
- Modify: `mobile/lib/placesClient.ts`
- Test: `mobile/lib/placesClient.test.ts`
- Modify: `mobile/lib/onboarding.ts`
- Test: `mobile/lib/onboarding.test.ts`

**Interfaces:**
- Produces: `autocompletePlaces(...)` resolves `{ text: string; placeId: string; types: string[] }[]`; `Region { label: string; hook: string }`; `suggestRegions({ placeId, baseUrl, anonKey, fetchImpl? }): Promise<Region[]>`; `shouldOfferRegions(types: string[]): boolean`; `OnboardingState` gains `startLocation?: string`, `startPlaceId?: string`; `buildRequest` passes them through.

- [ ] **Step 1: Write the failing test**

Append to `mobile/lib/placesClient.test.ts`:

```ts
import { suggestRegions } from "./placesClient";

test("suggestRegions returns regions from the function", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ regions: [{ label: "NorCal", hook: "Yosemite" }] }) });
  const out = await suggestRegions({ placeId: "p", baseUrl: "http://x", anonKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
  expect(out).toEqual([{ label: "NorCal", hook: "Yosemite" }]);
});

test("suggestRegions returns [] on error response", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
  const out = await suggestRegions({ placeId: "p", baseUrl: "http://x", anonKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
  expect(out).toEqual([]);
});
```

Append to `mobile/lib/onboarding.test.ts`:

```ts
import { shouldOfferRegions } from "./onboarding";

test("shouldOfferRegions true for country / state", () => {
  expect(shouldOfferRegions(["country"])).toBe(true);
  expect(shouldOfferRegions(["administrative_area_level_1"])).toBe(true);
});

test("shouldOfferRegions false for city / poi", () => {
  expect(shouldOfferRegions(["locality"])).toBe(false);
  expect(shouldOfferRegions([])).toBe(false);
});

test("buildRequest carries start location", () => {
  const s = { interests: ["scenic"], budget: "mid", pace: "balanced", transport: "balanced", location: "Lisbon", tripDays: 3, startLocation: "  SFO  ", startPlaceId: "sp1" } as const;
  const req = buildRequest(s as unknown as Parameters<typeof buildRequest>[0]);
  expect(req.startLocation).toBe("SFO");
  expect(req.startPlaceId).toBe("sp1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- placesClient onboarding`
Expected: FAIL — `suggestRegions`/`shouldOfferRegions` not exported; `startLocation` not on state type.

- [ ] **Step 3: Write minimal implementation**

In `mobile/lib/placesClient.ts`: change `autocompletePlaces` return type to `{ text: string; placeId: string; types: string[] }[]`, update the parsed `data` type to include `types?: string[]`, and map `types: s.types ?? []` (the function returns `data.suggestions ?? []`, so map over it). Then append:

```ts
export interface Region { label: string; hook: string; }

export async function suggestRegions(opts: {
  placeId: string;
  baseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}): Promise<Region[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/suggest-regions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": opts.anonKey,
      "Authorization": `Bearer ${opts.anonKey}`,
    },
    body: JSON.stringify({ placeId: opts.placeId }),
  });
  if (!res.ok) return [];
  const data = await res.json() as { regions?: Region[] };
  return data.regions ?? [];
}
```

For the autocomplete return mapping, replace the final line:

```ts
  const data = await res.json() as { suggestions?: { text: string; placeId: string; types?: string[] }[] };
  return (data.suggestions ?? []).map((s) => ({ text: s.text, placeId: s.placeId, types: s.types ?? [] }));
```

In `mobile/lib/onboarding.ts`: add `startLocation?: string;` and `startPlaceId?: string;` to `OnboardingState`; initialize both to `undefined` in `stateFromProfile`; set them from `req.startLocation`/`req.startPlaceId` in `stateFromRequest`; update `buildRequest`:

```ts
export function buildRequest(s: OnboardingState): GenerateRequest {
  return {
    location: s.location.trim(),
    tripDays: s.tripDays,
    prefs: prefsFromState(s),
    destinationPlaceId: s.destinationPlaceId,
    startLocation: s.startLocation?.trim() || undefined,
    startPlaceId: s.startPlaceId,
  };
}
```

and add the helper:

```ts
const REGION_TYPES = new Set(["country", "administrative_area_level_1"]);
export function shouldOfferRegions(types: string[]): boolean {
  return types.some((t) => REGION_TYPES.has(t));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- placesClient onboarding && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/placesClient.ts mobile/lib/placesClient.test.ts mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts
git commit -m "feat(mobile): regions client, autocomplete types, start-location state"
```

---

### Task 9: Mobile onboarding — region panel + start input

Wire the region-narrowing panel and the optional start-location input into step 1. Pure decision logic is already tested (Task 8); this task is screen wiring verified by `tsc`.

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `suggestRegions`, `Region`, `autocompletePlaces` (now returns `types`), `shouldOfferRegions`, `OnboardingState.startLocation/startPlaceId`.

- [ ] **Step 1: Add region + start state and handlers**

In `onboarding.tsx`, extend imports:

```ts
import { autocompletePlaces, suggestRegions, type Region } from "../../lib/placesClient";
```

and add `shouldOfferRegions` to the existing `../../lib/onboarding` import.

Add state near the other `useState`s:

```ts
  const [regions, setRegions] = useState<Region[]>([]);
  const [startSuggestions, setStartSuggestions] = useState<{ text: string; placeId: string; types: string[] }[]>([]);
  const debouncedStart = useDebouncedValue(state.startLocation ?? "", 300);
```

Add a start-location autocomplete effect mirroring the existing one:

```ts
  useEffect(() => {
    let active = true;
    autocompletePlaces({ query: debouncedStart, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
      .then((s) => { if (active) setStartSuggestions(s); })
      .catch(() => { if (active) setStartSuggestions([]); });
    return () => { active = false; };
  }, [debouncedStart]);
```

- [ ] **Step 2: Update the destination suggestion tap to offer regions**

Replace the destination suggestion `onPress` so it fetches regions when the picked place is large:

```tsx
<Pressable key={sug.placeId} onPress={() => {
  setState((s) => ({ ...s, location: sug.text, destinationPlaceId: sug.placeId }));
  setSuggestions([]);
  setRegions([]);
  if (shouldOfferRegions(sug.types)) {
    suggestRegions({ placeId: sug.placeId, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
      .then(setRegions).catch(() => setRegions([]));
  }
}}
  className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
  <Text variant="body">{sug.text}</Text>
</Pressable>
```

- [ ] **Step 3: Render the region panel and start input**

After the destination suggestions block in step 1, add the region panel:

```tsx
{regions.length > 0 ? (
  <View className="gap-2">
    <Text variant="label">Big place — narrow it down?</Text>
    {regions.map((r) => (
      <Pressable key={r.label} onPress={() => {
        setState((s) => ({ ...s, location: r.label, destinationPlaceId: undefined }));
        setRegions([]);
      }}
        className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
        <Text variant="body">{r.label}</Text>
        <Text variant="caption">{r.hook}</Text>
      </Pressable>
    ))}
    <Pressable onPress={() => setRegions([])} className="p-2">
      <Text variant="caption" className="text-ink-muted">Skip — search the whole area</Text>
    </Pressable>
  </View>
) : null}
```

Then, after the Days stepper block, add the optional start input:

```tsx
<Text variant="label">Starting point (optional)</Text>
<Input placeholder="Home, airport, or hotel" value={state.startLocation ?? ""}
  onChangeText={(t) => setState((s) => ({ ...s, startLocation: t, startPlaceId: undefined }))} autoCorrect={false} />
{startSuggestions.length > 0 && (state.startLocation ?? "").trim().length >= 2 ? (
  <View className="gap-1">
    {startSuggestions.map((sug) => (
      <Pressable key={sug.placeId} onPress={() => { setState((s) => ({ ...s, startLocation: sug.text, startPlaceId: sug.placeId })); setStartSuggestions([]); }}
        className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
        <Text variant="body">{sug.text}</Text>
      </Pressable>
    ))}
  </View>
) : null}
```

Optionally add a review line in step 2: `{state.startLocation ? <Text variant="body">Start: {state.startLocation}</Text> : null}`.

- [ ] **Step 4: Verify typecheck + existing tests**

Run: `cd mobile && npx tsc --noEmit && npm test -- onboarding`
Expected: no type errors; onboarding lib tests pass.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(mobile): region narrowing panel + optional start location input"
```

---

### Task 10: Mobile itinerary — dwell, meal gaps, header fix

Show per-stop dwell time, render meal-gap stops, and fix the sticky-header overlap.

**Files:**
- Modify: `mobile/lib/poi.ts` (add `formatDwell`)
- Test: `mobile/lib/poi.test.ts`
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Produces: `formatDwell(minutes?: number): string | null` — e.g. `90 -> "~1h 30m"`, `45 -> "~45 min"`, `undefined -> null`.

- [ ] **Step 1: Write the failing test**

Append to `mobile/lib/poi.test.ts`:

```ts
import { formatDwell } from "./poi";

test("formatDwell formats hours and minutes", () => {
  expect(formatDwell(45)).toBe("~45 min");
  expect(formatDwell(60)).toBe("~1h");
  expect(formatDwell(90)).toBe("~1h 30m");
  expect(formatDwell(undefined)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- poi`
Expected: FAIL — `formatDwell` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `mobile/lib/poi.ts`:

```ts
export function formatDwell(minutes?: number): string | null {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `~${m} min`;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npm test -- poi`
Expected: PASS.

- [ ] **Step 5: Render dwell + meal gaps + fix header**

In `mobile/app/(app)/itinerary.tsx`:

Import the helper: `import { getStopCoords, decodePolyline, formatDwell, type StopCoord } from "../../lib/poi";`

Fix the section header (opaque background + padding so cards don't show through the sticky header):

```tsx
renderSectionHeader={({ section }) => (
  <View className="bg-bg pt-2 pb-2">
    <Text variant="heading">{section.title}</Text>
    {section.lodging ? <Text variant="caption">Stay: {section.lodging}</Text> : null}
  </View>
)}
```

(`bg-bg` = `#FFFBFC`, the Screen's background token from `tailwind.config.js` — matches `Screen.tsx`'s `bg-bg`, so the header paints over the scrolling cards.)

Update `renderItem` to render meal gaps distinctly and show dwell + suggested time:

```tsx
renderItem={({ item, index }) => (
  item.kind === "meal-gap" ? (
    <Card className="gap-1 border-dashed">
      <Text variant="heading">{item.name}</Text>
      <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
      <Text variant="caption">{item.suggestedTime}{formatDwell(item.dwellMinutes) ? ` · ${formatDwell(item.dwellMinutes)}` : ""}</Text>
    </Card>
  ) : (
    <Card className="gap-1">
      <Text variant="heading">{index + 1}. {item.name}</Text>
      <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
      <View className="flex-row gap-3">
        {formatDwell(item.dwellMinutes) ? <Text variant="caption">{formatDwell(item.dwellMinutes)} here</Text> : null}
        {item.travelMinutesFromPrev != null ? <Text variant="caption">{item.travelMinutesFromPrev} min from previous</Text> : null}
      </View>
    </Card>
  )
)}
```

Note: meal-gap stops have `placeId: ""`, so the existing `keyExtractor={(item, i) => item.placeId + i}` stays unique via the index. They have no coords, so they are already excluded from `dayMarkers` (the `coords[s.placeId]` guard) — no map change needed.

- [ ] **Step 6: Verify typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npm test -- poi`
Expected: no type errors; tests pass.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/poi.ts mobile/lib/poi.test.ts "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(mobile): show dwell time + meal gaps; fix sticky header overlap"
```

---

## Final verification

- [ ] Backend full suite: `deno test supabase/` — all green.
- [ ] Mobile: `cd mobile && npm test && npx tsc --noEmit` — all green.
- [ ] Deploy edge functions (`generate-itinerary`, `suggest-regions`) and apply migration `0002` to Supabase. (Deploy/migrate steps are environment ops, run by the operator — see prior plans for the exact `supabase` CLI invocations used in this project.)
- [ ] Use `superpowers:finishing-a-development-branch` to merge.

## Notes / open follow-ups (out of scope)

- Popularity-ranked regions from completed trips.
- Real timezone lookup for sunset (currently lng/15 approximation).
- Full absolute-clock daily schedule.
- Sunset label on LLM-selected dinner stops (food-selected path).
