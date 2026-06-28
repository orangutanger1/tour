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
