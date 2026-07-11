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
    const routed = ordered
      .map((o) => attractions.find((s) => s.placeId === o.placeId))
      .filter((s): s is Stop => !!s)
      .map((s) => ({ ...s, travelMinutesFromPrev: travelById.get(s.placeId) }));
    // Attractions without resolvable coords (e.g. freshly-added search picks with
    // no cached_pois row) are excluded from routing above; append them at the end
    // so they aren't silently dropped from the day.
    const unrouted = attractions
      .filter((s) => !travelById.has(s.placeId))
      .map((s) => ({ ...s, travelMinutesFromPrev: s.travelMinutesFromPrev ?? 0 }));
    orderedStops = [...routed, ...unrouted];
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
