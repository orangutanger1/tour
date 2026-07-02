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

test("rowToTrip maps date columns when present and omits them when null", async () => {
  const dated = { ...row, start_date: "2026-07-12", end_date: "2026-07-18", trip_type: "round" };
  const undated = { ...row, id: "t2", start_date: null, end_date: null, trip_type: null };
  const [a, b] = await listTrips(listClient({ data: [dated, undated], error: null }));
  expect(a.startDate).toBe("2026-07-12");
  expect(a.endDate).toBe("2026-07-18");
  expect(a.tripType).toBe("round");
  expect(b.startDate).toBeUndefined();
  expect(b.endDate).toBeUndefined();
  expect(b.tripType).toBeUndefined();
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
