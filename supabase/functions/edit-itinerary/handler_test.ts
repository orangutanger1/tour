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
