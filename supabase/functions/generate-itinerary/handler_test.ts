// supabase/functions/generate-itinerary/handler_test.ts
import { assertEquals } from "jsr:@std/assert";
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
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : attractions),
    curate: () => Promise.resolve(itinerary),
    orderStops: ({ stops }) => Promise.resolve(stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 7 }))),
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
