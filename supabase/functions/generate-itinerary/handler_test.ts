// supabase/functions/generate-itinerary/handler_test.ts
import { assertEquals, assert } from "jsr:@std/assert";
import { handleGenerate, DAILY_CAP, type HandlerDeps } from "./handler.ts";
import { CurationError } from "../../_shared/curate.ts";
import type { Poi, Prefs, Itinerary } from "../../_shared/types.ts";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced", transport: "balanced" };
const attractions: Poi[] = [{ placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 }];
const lodging: Poi[] = [{ placeId: "L", name: "Hotel", kind: "lodging", lat: 9, lng: 9, deepLink: "https://book/L" }];
const itinerary: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] };

function baseDeps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    countTripsToday: () => Promise.resolve(0),
    resolveDestination: () => Promise.resolve({ center: { lat: 0, lng: 0 }, viewport: null }),
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : attractions),
    curate: () => Promise.resolve(itinerary),
    orderStops: ({ stops }) => Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 7 })), polyline: undefined }),
    saveTrip: () => Promise.resolve("trip-123"),
    ...over,
  };
}

Deno.test("rejects tripDays < 1", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 0, prefs }, "u1", baseDeps());
  assertEquals(r.status, 400);
});

Deno.test("enforces daily cap", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps({ countTripsToday: () => Promise.resolve(DAILY_CAP) }));
  assertEquals(r.status, 429);
});

Deno.test("happy path returns trip id + itinerary with lodging anchor and travel times", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps());
  assertEquals(r.status, 200);
  const body = r.body as { tripId: string; itinerary: Itinerary };
  assertEquals(body.tripId, "trip-123");
  assertEquals(body.itinerary.days[0].lodgingPlaceId, "L");
  assertEquals(body.itinerary.days[0].stops[0].travelMinutesFromPrev, 7);
});

Deno.test("returns 502 on CurationError", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps({ curate: () => Promise.reject(new CurationError("boom")) }));
  assertEquals(r.status, 502);
});

Deno.test("handleGenerate resolves destination and passes locationBias + WALK for compact", async () => {
  let biasRadiusKm = 0, sawMode = "";
  const deps = baseDeps({
    resolveDestination: () => Promise.resolve({ center: { lat: 1, lng: 2 }, viewport: null }),
    fetchPois: (o: any) => { biasRadiusKm = o.locationBias?.radiusKm ?? 0; return Promise.resolve([{ placeId: "A", name: "A", kind: o.kind, lat: 1, lng: 2 }]); },
    orderStops: (o: any) => { sawMode = o.travelMode; return Promise.resolve({ ordered: [{ placeId: "A", travelMinutesFromPrev: 0 }], polyline: undefined }); },
  });
  const req = { location: "X", tripDays: 1, destinationPlaceId: "p1", prefs: { interests: [], budget: "mid", pace: "balanced", transport: "compact" } };
  const out = await handleGenerate(req as any, "u1", deps);
  assertEquals(out.status, 200);
  assert(biasRadiusKm >= 2 && biasRadiusKm <= 5);
  assertEquals(sawMode, "WALK");
});

Deno.test("handleGenerate attaches routePolyline to each day", async () => {
  const deps = baseDeps({ orderStops: () => Promise.resolve({ ordered: [{ placeId: "A", travelMinutesFromPrev: 0 }], polyline: "poly1" }) });
  const req = { location: "X", tripDays: 1, destinationPlaceId: "p1", prefs: { interests: [], budget: "mid", pace: "balanced", transport: "balanced" } };
  const out: any = await handleGenerate(req as any, "u1", deps);
  assertEquals(out.body.itinerary.days[0].routePolyline, "poly1");
});

Deno.test("no-anchor path (free-typed location, no lodging): skips orderStops, routePolyline is undefined, stops preserved", async () => {
  let orderStopsCalled = false;
  let fetchPoisLocationBias: unknown = "SENTINEL";
  const deps = baseDeps({
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
  // No destinationPlaceId — free-typed location
  const req = { location: "Somewhere", tripDays: 1, prefs };
  const out: any = await handleGenerate(req as any, "u1", deps);
  assertEquals(out.status, 200);
  // (a) orderStops must NOT have been called
  assertEquals(orderStopsCalled, false, "orderStops should not be called when anchor is {0,0} and no lodging");
  // (b) routePolyline is undefined and stops are still present
  assertEquals(out.body.itinerary.days[0].routePolyline, undefined);
  assert(out.body.itinerary.days[0].stops.length > 0, "day must still have its stops");
  // (c) locationBias passed to fetchPois was undefined (because center is {0,0})
  assertEquals(fetchPoisLocationBias, undefined, "fetchPois must receive locationBias: undefined when center is {0,0}");
});

Deno.test("routes all days concurrently, not serially", async () => {
  let active = 0, maxActive = 0;
  const day = (d: number) => ({ day: d, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] });
  const deps = baseDeps({
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
  const req = { location: "X", tripDays: 3, destinationPlaceId: "p1", prefs };
  const out: any = await handleGenerate(req as any, "u1", deps);
  assertEquals(out.status, 200);
  assert(maxActive >= 2, `expected per-day routing to overlap, got maxActive=${maxActive}`);
});

Deno.test("real center + no lodging: orderStops IS called (city-center anchor)", async () => {
  let orderStopsCalled = false;
  const deps = baseDeps({
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
  const req = { location: "Paris", tripDays: 1, destinationPlaceId: "paris-id", prefs };
  const out: any = await handleGenerate(req as any, "u1", deps);
  assertEquals(out.status, 200);
  assertEquals(orderStopsCalled, true, "orderStops should be called when center is non-zero even without lodging");
  assertEquals(out.body.itinerary.days[0].routePolyline, "poly2");
});
