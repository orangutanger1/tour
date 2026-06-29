// supabase/functions/generate-itinerary/handler.ts
import type { Itinerary, Poi, Prefs } from "../../_shared/types.ts";
import { CurationError } from "../../_shared/curate.ts";
import { areaRadiusKm, type Viewport } from "../../_shared/area.ts";

export const DAILY_CAP = 10;

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
}

export interface HandlerDeps {
  countTripsToday(userId: string): Promise<number>;
  resolveDestination(opts: { placeId?: string; location: string }): Promise<{ center: { lat: number; lng: number }; viewport: Viewport }>;
  fetchPois(opts: { location: string; kind: Poi["kind"]; prefs: Prefs; locationBias?: { center: { lat: number; lng: number }; radiusKm: number } }): Promise<Poi[]>;
  curate(opts: { pois: Poi[]; prefs: Prefs; tripDays: number }): Promise<Itinerary>;
  orderStops(opts: { stops: Poi[]; anchor: { lat: number; lng: number }; travelMode?: "WALK" | "DRIVE" }): Promise<{ ordered: { placeId: string; travelMinutesFromPrev: number }[]; polyline?: string }>;
  saveTrip(opts: { userId: string; req: GenerateRequest; itinerary: Itinerary }): Promise<string>;
}

export async function handleGenerate(
  body: GenerateRequest,
  userId: string,
  deps: HandlerDeps,
): Promise<{ status: number; body: unknown }> {
  if (!body || body.tripDays < 1) {
    return { status: 400, body: { error: "tripDays must be >= 1" } };
  }
  if ((await deps.countTripsToday(userId)) >= DAILY_CAP) {
    return { status: 429, body: { error: "daily generation limit reached" } };
  }

  const dest = await deps.resolveDestination({ placeId: body.destinationPlaceId, location: body.location });
  const radiusKm = areaRadiusKm({ viewport: dest.viewport, transport: body.prefs.transport });
  const hasCenter = dest.center.lat !== 0 || dest.center.lng !== 0;
  const locationBias = hasCenter ? { center: dest.center, radiusKm } : undefined;
  const travelMode = body.prefs.transport === "compact" ? "WALK" as const : "DRIVE" as const;

  const [attractions, food, lodging] = await Promise.all([
    deps.fetchPois({ location: body.location, kind: "attraction", prefs: body.prefs, locationBias }),
    deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs, locationBias }),
    deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs, locationBias }),
  ]);

  const pois = [...attractions, ...food];
  const anchorPoi = lodging[0] ?? null;

  let itinerary: Itinerary;
  try {
    itinerary = await deps.curate({ pois, prefs: body.prefs, tripDays: body.tripDays });
  } catch (e) {
    if (e instanceof CurationError) return { status: 502, body: { error: "could not build itinerary" } };
    throw e;
  }

  const byId = new Map(pois.map((p) => [p.placeId, p]));
  // Route days in parallel — each day mutates only its own object, so a serial
  // loop just stacks N route round-trips and pushes the request past the gateway
  // timeout (504). Promise.all collapses that to a single round-trip's latency.
  await Promise.all(itinerary.days.map(async (day) => {
    day.lodgingPlaceId = anchorPoi?.placeId ?? null;
    // Only route when there is a real anchor: a lodging POI or a resolved center (non-{0,0}).
    // Without a real anchor, routing would use {0,0} (null island) producing garbage results.
    if (!anchorPoi && !hasCenter) {
      day.routePolyline = undefined;
      return;
    }
    const anchor = anchorPoi ? { lat: anchorPoi.lat, lng: anchorPoi.lng } : dest.center;
    const dayPois = day.stops.map((s) => byId.get(s.placeId)).filter((p): p is Poi => !!p);
    const { ordered, polyline } = await deps.orderStops({ stops: dayPois, anchor, travelMode });
    const minutesById = new Map(ordered.map((o) => [o.placeId, o.travelMinutesFromPrev]));
    // reorder stops to match optimized order, attach travel times
    day.stops = ordered.map((o) => {
      const stop = day.stops.find((s) => s.placeId === o.placeId)!;
      return { ...stop, travelMinutesFromPrev: minutesById.get(o.placeId) };
    });
    day.routePolyline = polyline;
  }));

  const tripId = await deps.saveTrip({ userId, req: body, itinerary });
  return { status: 200, body: { tripId, itinerary } };
}
