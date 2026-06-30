import { listTrips, getTrip, tripDayCount, type TripSummary } from "./trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Itinerary } from "./types";

const itin: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [] }, { day: 2, lodgingPlaceId: null, stops: [] }] };
const row = { id: "t1", location: "Kyoto", itinerary: itin, created_at: "2026-06-01T00:00:00Z" };

function listClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ order: async () => result }) }),
  } as unknown as SupabaseClient;
}

function getClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
  } as unknown as SupabaseClient;
}

test("listTrips maps rows to TripSummary", async () => {
  const trips = await listTrips(listClient({ data: [row], error: null }));
  expect(trips).toEqual([{ id: "t1", location: "Kyoto", itinerary: itin, createdAt: "2026-06-01T00:00:00Z" }]);
});

test("listTrips returns [] when no rows", async () => {
  expect(await listTrips(listClient({ data: null, error: null }))).toEqual([]);
});

test("listTrips throws on query error", async () => {
  await expect(listTrips(listClient({ data: null, error: { message: "boom" } }))).rejects.toBeTruthy();
});

test("getTrip returns one trip", async () => {
  const trip = await getTrip(getClient({ data: row, error: null }), "t1");
  expect(trip?.location).toBe("Kyoto");
});

test("getTrip returns null when not found", async () => {
  expect(await getTrip(getClient({ data: null, error: null }), "missing")).toBeNull();
});

test("getTrip throws on query error", async () => {
  await expect(getTrip(getClient({ data: null, error: { message: "no" } }), "t1")).rejects.toBeTruthy();
});

test("tripDayCount counts itinerary days", () => {
  expect(tripDayCount({ id: "t1", location: "Kyoto", itinerary: itin, createdAt: "" })).toBe(2);
});

test("tripDayCount is 0 for empty itinerary", () => {
  expect(tripDayCount({ id: "t1", location: "x", itinerary: { days: [] }, createdAt: "" })).toBe(0);
});
