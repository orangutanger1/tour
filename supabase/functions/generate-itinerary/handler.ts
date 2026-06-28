// supabase/functions/generate-itinerary/handler.ts
import type { Itinerary, Poi, Prefs } from "../../_shared/types.ts";
import { CurationError } from "../../_shared/curate.ts";

export const DAILY_CAP = 10;

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
}

export interface HandlerDeps {
  countTripsToday(userId: string): Promise<number>;
  fetchPois(opts: { location: string; kind: Poi["kind"]; prefs: Prefs }): Promise<Poi[]>;
  curate(opts: { pois: Poi[]; prefs: Prefs; tripDays: number }): Promise<Itinerary>;
  orderStops(opts: { stops: Poi[]; anchor: { lat: number; lng: number } }): Promise<{ placeId: string; travelMinutesFromPrev: number }[]>;
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

  const [attractions, food, lodging] = await Promise.all([
    deps.fetchPois({ location: body.location, kind: "attraction", prefs: body.prefs }),
    deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs }),
    deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs }),
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
  for (const day of itinerary.days) {
    day.lodgingPlaceId = anchorPoi?.placeId ?? null;
    if (!anchorPoi) continue;
    const dayPois = day.stops.map((s) => byId.get(s.placeId)).filter((p): p is Poi => !!p);
    const ordered = await deps.orderStops({ stops: dayPois, anchor: { lat: anchorPoi.lat, lng: anchorPoi.lng } });
    const minutesById = new Map(ordered.map((o) => [o.placeId, o.travelMinutesFromPrev]));
    // reorder stops to match optimized order, attach travel times
    day.stops = ordered.map((o) => {
      const stop = day.stops.find((s) => s.placeId === o.placeId)!;
      return { ...stop, travelMinutesFromPrev: minutesById.get(o.placeId) };
    });
  }

  const tripId = await deps.saveTrip({ userId, req: body, itinerary });
  return { status: 200, body: { tripId, itinerary } };
}
