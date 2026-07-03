// supabase/functions/generate-itinerary/handler_test.ts
import { assertEquals, assert } from "jsr:@std/assert";
import { startGenerate, DAILY_CAP, type StartDeps } from "./handler.ts";
import { CurationError } from "../../_shared/curate.ts";
import type { Poi, Prefs, Itinerary } from "../../_shared/types.ts";
import type { GenerateRequest } from "./handler.ts";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced", transport: "balanced" };
const attractions: Poi[] = [{ placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 }];
const lodging: Poi[] = [{ placeId: "L", name: "Hotel", kind: "lodging", lat: 9, lng: 9, deepLink: "https://book/L" }];
const itinerary: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] };

function baseDeps(over: Partial<StartDeps> = {}): StartDeps {
  return {
    countTripsToday: () => Promise.resolve(0),
    resolveDestination: () => Promise.resolve({ center: { lat: 0, lng: 0 }, viewport: null }),
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : attractions),
    curate: () => Promise.resolve(itinerary),
    orderStops: ({ stops }) => Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 7 })), polyline: undefined }),
    createPendingTrip: () => Promise.resolve("trip-123"),
    completeTrip: () => Promise.resolve(),
    failTrip: () => Promise.resolve(),
    fetchDwell: () => Promise.resolve({}),
    saveDwell: () => Promise.resolve(),
    ...over,
  };
}

// Start + run to completion, capturing the lifecycle. Old tests that asserted
// on the response itinerary now assert on `completed`.
async function runGenerate(body: GenerateRequest, over: Partial<StartDeps> = {}) {
  let completed: Itinerary | undefined;
  let failure: string | undefined;
  const deps = baseDeps({
    ...over,
    completeTrip: async ({ itinerary: it }) => { completed = it; },
    failTrip: async ({ message }) => { failure = message; },
  });
  const r = await startGenerate(body, "u1", deps);
  if (r.run) await r.run();
  return { status: r.status, body: r.body as { tripId?: string; error?: string }, completed, failure };
}

Deno.test("startGenerate returns 202 with tripId before pipeline work", async () => {
  let pipelineRan = false;
  const deps = baseDeps({ resolveDestination: () => { pipelineRan = true; return Promise.resolve({ center: { lat: 0, lng: 0 }, viewport: null }); } });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 202);
  assertEquals((r.body as { tripId: string }).tripId, "trip-123");
  assertEquals(pipelineRan, false);
  assert(r.run);
  await r.run!();
  assertEquals(pipelineRan, true);
});

Deno.test("run() completes the trip with the built itinerary", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs });
  assertEquals(r.status, 202);
  assert(r.completed);
  assertEquals(r.completed!.days.length, 1);
  assertEquals(r.failure, undefined);
});

Deno.test("CurationError fails the trip with a readable message", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs }, { curate: () => Promise.reject(new CurationError("nope")) });
  assertEquals(r.status, 202);
  assertEquals(r.completed, undefined);
  assertEquals(r.failure, "could not build itinerary");
});

Deno.test("unexpected pipeline error fails the trip generically (run never throws)", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs }, { orderStops: () => Promise.reject(new Error("boom")) });
  assertEquals(r.failure, "itinerary generation failed");
});

Deno.test("daily cap → 429 and no pending row", async () => {
  let created = false;
  const deps = baseDeps({ countTripsToday: () => Promise.resolve(DAILY_CAP), createPendingTrip: () => { created = true; return Promise.resolve("t"); } });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 429);
  assertEquals(created, false);
  assertEquals(r.run, undefined);
});

Deno.test("invalid tripDays → 400 and no pending row", async () => {
  const r = await startGenerate({ location: "X", tripDays: 0, prefs }, "u1", baseDeps());
  assertEquals(r.status, 400);
  assertEquals(r.run, undefined);
});

Deno.test("happy path completes trip id + itinerary with lodging anchor and travel times", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs });
  assertEquals(r.status, 202);
  assertEquals(r.body.tripId, "trip-123");
  assertEquals(r.completed!.days[0].lodgingPlaceId, "L");
  assertEquals(r.completed!.days[0].stops[0].travelMinutesFromPrev, 7);
});

Deno.test("resolves destination and passes locationBias + WALK for compact", async () => {
  let biasRadiusKm = 0, sawMode = "";
  const req = { location: "X", tripDays: 1, destinationPlaceId: "p1", prefs: { interests: [], budget: "mid", pace: "balanced", transport: "compact" } };
  const r = await runGenerate(req as any, {
    resolveDestination: () => Promise.resolve({ center: { lat: 1, lng: 2 }, viewport: null }),
    fetchPois: (o: any) => { biasRadiusKm = o.locationBias?.radiusKm ?? 0; return Promise.resolve([{ placeId: "A", name: "A", kind: o.kind, lat: 1, lng: 2 }]); },
    orderStops: (o: any) => { sawMode = o.travelMode; return Promise.resolve({ ordered: [{ placeId: "A", travelMinutesFromPrev: 0 }], polyline: undefined }); },
  });
  assertEquals(r.status, 202);
  assert(r.completed);
  assert(biasRadiusKm >= 2 && biasRadiusKm <= 5);
  assertEquals(sawMode, "WALK");
});

Deno.test("attaches routePolyline to each day", async () => {
  const req = { location: "X", tripDays: 1, destinationPlaceId: "p1", prefs: { interests: [], budget: "mid", pace: "balanced", transport: "balanced" } };
  const r = await runGenerate(req as any, { orderStops: () => Promise.resolve({ ordered: [{ placeId: "A", travelMinutesFromPrev: 0 }], polyline: "poly1" }) });
  assertEquals(r.completed!.days[0].routePolyline, "poly1");
});

Deno.test("no-anchor path (free-typed location, no lodging): skips orderStops, routePolyline is undefined, stops preserved", async () => {
  let orderStopsCalled = false;
  let fetchPoisLocationBias: unknown = "SENTINEL";
  // No destinationPlaceId — free-typed location
  const req = { location: "Somewhere", tripDays: 1, prefs };
  const r = await runGenerate(req as any, {
    // No destinationPlaceId => free-typed, resolveDestination returns {0,0}
    resolveDestination: () => Promise.resolve({ center: { lat: 0, lng: 0 }, viewport: null }),
    fetchPois: (o: any) => {
      if (o.kind === "attraction" || o.kind === "food") {
        fetchPoisLocationBias = o.locationBias;
        return Promise.resolve([{ placeId: "A", name: "A", kind: o.kind, lat: 1, lng: 2 }]);
      }
      // No lodging
      return Promise.resolve([]);
    },
    curate: () => Promise.resolve({ days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] }),
    orderStops: () => { orderStopsCalled = true; return Promise.resolve({ ordered: [], polyline: undefined }); },
  });
  assertEquals(r.status, 202);
  // (a) orderStops must NOT have been called
  assertEquals(orderStopsCalled, false, "orderStops should not be called when anchor is {0,0} and no lodging");
  // (b) routePolyline is undefined and stops are still present
  assertEquals(r.completed!.days[0].routePolyline, undefined);
  assert(r.completed!.days[0].stops.length > 0, "day must still have its stops");
  // (c) locationBias passed to fetchPois was undefined (because center is {0,0})
  assertEquals(fetchPoisLocationBias, undefined, "fetchPois must receive locationBias: undefined when center is {0,0}");
});

Deno.test("routes all days concurrently, not serially", async () => {
  let active = 0, maxActive = 0;
  const day = (d: number) => ({ day: d, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] });
  const req = { location: "X", tripDays: 3, destinationPlaceId: "p1", prefs };
  const r = await runGenerate(req as any, {
    resolveDestination: () => Promise.resolve({ center: { lat: 1, lng: 2 }, viewport: null }),
    fetchPois: (o: any) => Promise.resolve(o.kind === "lodging" ? [] : [{ placeId: "A", name: "A", kind: o.kind, lat: 1, lng: 2 }]),
    curate: () => Promise.resolve({ days: [day(1), day(2), day(3)] }),
    orderStops: async ({ stops }) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 1 })), polyline: "p" };
    },
  });
  assertEquals(r.status, 202);
  assert(maxActive >= 2, `expected per-day routing to overlap, got maxActive=${maxActive}`);
});

Deno.test("real center + no lodging: orderStops IS called (city-center anchor)", async () => {
  let orderStopsCalled = false;
  const req = { location: "Paris", tripDays: 1, destinationPlaceId: "paris-id", prefs };
  const r = await runGenerate(req as any, {
    resolveDestination: () => Promise.resolve({ center: { lat: 48.85, lng: 2.35 }, viewport: null }),
    fetchPois: (o: any) => {
      if (o.kind === "lodging") return Promise.resolve([]);
      return Promise.resolve([{ placeId: "A", name: "A", kind: o.kind, lat: 48.85, lng: 2.35 }]);
    },
    curate: () => Promise.resolve({ days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] }),
    orderStops: ({ stops }) => {
      orderStopsCalled = true;
      return Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 5 })), polyline: "poly2" });
    },
  });
  assertEquals(r.status, 202);
  assertEquals(orderStopsCalled, true, "orderStops should be called when center is non-zero even without lodging");
  assertEquals(r.completed!.days[0].routePolyline, "poly2");
});

Deno.test("does not fetch food unless 'food' interest selected", async () => {
  const kinds: string[] = [];
  const r = await runGenerate({ location: "X", tripDays: 1, prefs }, {
    fetchPois: ({ kind }) => { kinds.push(kind); return Promise.resolve(kind === "lodging" ? lodging : attractions); },
  });
  assert(r.completed);
  assert(!kinds.includes("food"), `food fetched: ${kinds.join(",")}`);
});

Deno.test("fetches food when 'food' interest selected", async () => {
  const kinds: string[] = [];
  const r = await runGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, {
    fetchPois: ({ kind }) => { kinds.push(kind); return Promise.resolve(kind === "lodging" ? lodging : attractions); },
  });
  assert(r.completed);
  assert(kinds.includes("food"), `food not fetched: ${kinds.join(",")}`);
});

Deno.test("prefers cached dwell and saves newly-seen estimates", async () => {
  const saved: { placeId: string; minutes: number }[] = [];
  const curated: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [
    { placeId: "A", name: "A", blurb: "x", dwellMinutes: 30 },
    { placeId: "B", name: "B", blurb: "x", dwellMinutes: 45 },
  ] }] };
  const r = await runGenerate({ location: "X", tripDays: 1, prefs }, {
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : [
      { placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 },
      { placeId: "B", name: "B", kind: "attraction", lat: 0, lng: 0 },
    ]),
    curate: () => Promise.resolve(curated),
    orderStops: ({ stops }) => Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 0 })), polyline: undefined }),
    fetchDwell: () => Promise.resolve({ A: 99 }),         // A cached, B not
    saveDwell: (e) => { saved.push(...e); return Promise.resolve(); },
  });
  const days = r.completed!.days;
  const byId = Object.fromEntries(days[0].stops.map((s) => [s.placeId, s]));
  assertEquals(byId["A"].dwellMinutes, 99);              // cache wins
  assertEquals(byId["B"].dwellMinutes, 45);              // llm value kept
  assertEquals(saved, [{ placeId: "B", minutes: 45 }]);  // only the new one saved
});

Deno.test("food off: each day gets lunch + dinner gaps with absolute times", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs });
  const stops = r.completed!.days[0].stops;
  const gaps = stops.filter((s) => s.kind === "meal-gap");
  assertEquals(gaps.length, 2);
  assert(gaps.every((g) => g.placeId === "" && g.dwellMinutes === 60 && !!g.startTime && !!g.mealSlot));
  assertEquals(gaps.map((g) => g.mealSlot).sort(), ["dinner", "lunch"]);
});

Deno.test("every stop gets an absolute startTime", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs });
  const stops = r.completed!.days[0].stops;
  assert(stops.every((s) => typeof s.startTime === "string" && s.startTime.length > 0));
  assertEquals(stops[0].startTime, "9:00 AM");
});

Deno.test("food on: meal slots are real restaurants (highest-rated first), deduped, not counted as attractions", async () => {
  const foodPois: Poi[] = [
    { placeId: "F1", name: "Joe", kind: "food", lat: 0, lng: 0, rating: 4.8 },
    { placeId: "F2", name: "Mae", kind: "food", lat: 0, lng: 0, rating: 4.5 },
  ];
  const r = await runGenerate({ location: "X", tripDays: 1, destinationPlaceId: "D", prefs: { ...prefs, interests: ["food"] } }, {
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : kind === "food" ? foodPois : attractions),
  });
  const stops = r.completed!.days[0].stops;
  const meals = stops.filter((s) => s.kind === "meal");
  assertEquals(meals.length, 2);
  assert(meals.every((m) => m.placeId !== "" && !!m.mealSlot && !!m.startTime));
  assertEquals(stops.filter((s) => s.kind === "meal-gap").length, 0);
  assertEquals(meals.find((m) => m.mealSlot === "lunch")!.placeId, "F1"); // highest rated first
  // deduped: the two meals are different places
  assert(meals[0].placeId !== meals[1].placeId);
});

Deno.test("food on but no food places found: falls back to gaps", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, {
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : kind === "food" ? [] : attractions),
  });
  const stops = r.completed!.days[0].stops;
  assertEquals(stops.filter((s) => s.kind === "meal-gap").length, 2);
});

Deno.test("food POIs are never sent to the curation pool", async () => {
  let curatedKinds: string[] = [];
  const foodPois: Poi[] = [{ placeId: "F1", name: "Joe", kind: "food", lat: 0, lng: 0, rating: 4.8 }];
  const r = await runGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, {
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : kind === "food" ? foodPois : attractions),
    curate: ({ pois }) => { curatedKinds = pois.map((p) => p.kind); return Promise.resolve(itinerary); },
  });
  assert(r.completed);
  assert(!curatedKinds.includes("food"), `curation pool leaked food: ${curatedKinds.join(",")}`);
});

Deno.test("re-clusters curated stops into geographically compact days", async () => {
  const poiSet: Poi[] = [
    { placeId: "N1", name: "N1", kind: "attraction", lat: 0, lng: 0 },
    { placeId: "N2", name: "N2", kind: "attraction", lat: 0.01, lng: 0.01 },
    { placeId: "F1", name: "F1", kind: "attraction", lat: 2, lng: 2 },
    { placeId: "F2", name: "F2", kind: "attraction", lat: 2.01, lng: 2.01 },
  ];
  // LLM (blind to coords) put a near + far stop on each day — the bug.
  const badCuration: Itinerary = { days: [
    { day: 1, lodgingPlaceId: null, stops: [{ placeId: "N1", name: "N1", blurb: "x" }, { placeId: "F1", name: "F1", blurb: "x" }] },
    { day: 2, lodgingPlaceId: null, stops: [{ placeId: "N2", name: "N2", blurb: "x" }, { placeId: "F2", name: "F2", blurb: "x" }] },
  ] };
  const r = await runGenerate({ location: "X", tripDays: 2, destinationPlaceId: "D", prefs }, {
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? [] : poiSet),
    curate: () => Promise.resolve(badCuration),
  });
  assertEquals(r.status, 202);
  const days = r.completed!.days;
  for (const d of days) {
    const real = d.stops.filter((s) => s.placeId).map((s) => s.placeId);
    const hasNear = real.some((id) => id.startsWith("N"));
    const hasFar = real.some((id) => id.startsWith("F"));
    assert(!(hasNear && hasFar), `day ${d.day} mixes far clusters: ${real.join(",")}`);
  }
});

Deno.test("food fetch failure does not abort generation (no 546)", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs: { ...prefs, interests: ["food"] } }, {
    fetchPois: ({ kind }) => {
      if (kind === "food") return Promise.reject(new Error("places: HTTP 500"));
      return Promise.resolve(kind === "lodging" ? lodging : attractions);
    },
  });
  assertEquals(r.status, 202);
  assert(r.completed);
});

Deno.test("lodging fetch failure does not abort generation (no 546)", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs }, {
    fetchPois: ({ kind }) => {
      if (kind === "lodging") return Promise.reject(new Error("places: HTTP 429"));
      return Promise.resolve(attractions);
    },
  });
  assertEquals(r.status, 202);
  assert(r.completed);
});

Deno.test("start-location resolve failure does not abort generation (no 546)", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, destinationPlaceId: "DEST", startPlaceId: "START", prefs }, {
    resolveDestination: ({ placeId }) =>
      placeId === "START"
        ? Promise.reject(new Error("place details: HTTP 404"))
        : Promise.resolve({ center: { lat: 1, lng: 1 }, viewport: null }),
  });
  assertEquals(r.status, 202);
  assert(r.completed);
});

Deno.test("day 1 and last day anchor on the start location", async () => {
  const threeDay: Itinerary = { days: [
    { day: 1, lodgingPlaceId: null, stops: [{ placeId: "A1", name: "A1", blurb: "x" }] },
    { day: 2, lodgingPlaceId: null, stops: [{ placeId: "A2", name: "A2", blurb: "x" }] },
    { day: 3, lodgingPlaceId: null, stops: [{ placeId: "A3", name: "A3", blurb: "x" }] },
  ] };
  const anchors: { lat: number; lng: number }[] = [];
  const r = await runGenerate({ location: "X", tripDays: 3, destinationPlaceId: "DEST", startPlaceId: "START", prefs }, {
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
  assert(r.completed);
  assertEquals(anchors.length, 3);
  assertEquals(anchors[0], { lat: 5, lng: 5 }); // day 1 -> start
  assertEquals(anchors[2], { lat: 5, lng: 5 }); // last day -> start
  assertEquals(anchors[1], { lat: 9, lng: 9 }); // middle day -> lodging
});

Deno.test("rejects tripDays > 365 (abuse guard, not a UX clamp)", async () => {
  const r = await startGenerate({ location: "X", tripDays: 366, prefs }, "u1", baseDeps());
  assertEquals(r.status, 400);
  assertEquals(r.run, undefined);
});

Deno.test("accepts startDate/endDate/tripType fields", async () => {
  const r = await runGenerate(
    { location: "X", tripDays: 1, prefs, startDate: "2026-07-12", endDate: "2026-07-12", tripType: "oneway" },
  );
  assertEquals(r.status, 202);
  assert(r.completed);
});

function legDeps(kmPerLeg: { curateCalls: { tripDays: number; poolIds: string[] }[] }): Partial<StartDeps> {
  // 16-day trip → legs [6,5,5]; give each leg-local fetch a distinct pool.
  let fetchCall = 0;
  return {
    resolveDestination: () => Promise.resolve({
      center: { lat: 5, lng: 5 },
      viewport: { low: { lat: 0, lng: 0 }, high: { lat: 10, lng: 10 } },
    }),
    fetchPois: (o: any) => {
      if (o.kind !== "attraction") return Promise.resolve([]);
      const i = fetchCall++;
      const c = o.locationBias?.center ?? { lat: 5, lng: 5 };
      // 8 pois per leg, clustered at the leg's bias center
      return Promise.resolve(Array.from({ length: 8 }, (_, j) => ({
        placeId: `L${i}-P${j}`, name: `P${j}`, kind: "attraction" as const,
        lat: c.lat + j * 0.001, lng: c.lng,
      })));
    },
    curate: ({ pois, tripDays }: any) => {
      kmPerLeg.curateCalls.push({ tripDays, poolIds: pois.map((p: Poi) => p.placeId) });
      // one stop per day from this leg's pool
      return Promise.resolve({
        days: Array.from({ length: tripDays }, (_, d) => ({
          day: d + 1, lodgingPlaceId: null,
          stops: [{ placeId: pois[d % pois.length].placeId, name: "s", blurb: "x" }],
        })),
      });
    },
  };
}

Deno.test("long trip: splits into legs, curates per leg in parallel pools, renumbers days 1..N", async () => {
  const seen = { curateCalls: [] as { tripDays: number; poolIds: string[] }[] };
  const r = await runGenerate(
    { location: "X", tripDays: 16, destinationPlaceId: "D", tripType: "oneway", prefs },
    legDeps(seen),
  );
  assertEquals(r.status, 202);
  assertEquals(seen.curateCalls.map((c) => c.tripDays).sort(), [5, 5, 6]);
  // pools are disjoint
  const all = seen.curateCalls.flatMap((c) => c.poolIds);
  assertEquals(new Set(all).size, all.length);
  const days = r.completed!.days;
  assertEquals(days.length, 16);
  assertEquals(days.map((d) => d.day), Array.from({ length: 16 }, (_, i) => i + 1));
});

Deno.test("oneway: final day does NOT anchor back at the start location", async () => {
  const anchors: { lat: number; lng: number }[] = [];
  const threeDay: Itinerary = { days: [1, 2, 3].map((d) => ({
    day: d, lodgingPlaceId: null, stops: [{ placeId: `A${d}`, name: `A${d}`, blurb: "x" }],
  })) };
  const r = await runGenerate({ location: "X", tripDays: 3, destinationPlaceId: "DEST", startPlaceId: "START", tripType: "oneway", prefs }, {
    resolveDestination: ({ placeId }) => Promise.resolve(
      placeId === "START" ? { center: { lat: 5, lng: 5 }, viewport: null } : { center: { lat: 1, lng: 1 }, viewport: null }),
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : [1, 2, 3].map((d) => (
      { placeId: `A${d}`, name: `A${d}`, kind: "attraction" as const, lat: 0, lng: 0 }))),
    curate: () => Promise.resolve(threeDay),
    orderStops: ({ stops, anchor }) => { anchors.push(anchor); return Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 0 })), polyline: undefined }); },
  });
  assert(r.completed);
  assertEquals(anchors[0], { lat: 5, lng: 5 });   // day 1 still starts at start
  assertEquals(anchors[2], { lat: 9, lng: 9 });   // last day anchors at lodging, not start
});
