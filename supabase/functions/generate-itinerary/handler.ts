// supabase/functions/generate-itinerary/handler.ts
import type { Itinerary, Poi, Prefs, Stop } from "../../_shared/types.ts";
import { CurationError } from "../../_shared/curate.ts";
import { areaRadiusKm, haversineKm, type Viewport } from "../../_shared/area.ts";
import { assignDays } from "../../_shared/cluster.ts";
import { sunsetLocalMinutes } from "../../_shared/solar.ts";
import { buildDaySchedule } from "../../_shared/schedule.ts";

export const DAILY_CAP = 10;

// Per-day driving appetite by transport choice: minutes the traveler will spend
// moving between stops, and an average speed to turn that into a distance the
// clustering can enforce. Tunable knobs — calibrate against real trips.
const TRANSPORT_TUNING: Record<Prefs["transport"], { budgetMin: number; speedKmh: number }> = {
  compact: { budgetMin: 90, speedKmh: 4.5 },   // walking a tight cluster (~7 km)
  balanced: { budgetMin: 180, speedKmh: 45 },  // some driving (~135 km)
  far: { budgetMin: 330, speedKmh: 45 },       // long legs OK, still under ~6h (~250 km)
};

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
  startLocation?: string;
  startPlaceId?: string;
}

export interface HandlerDeps {
  countTripsToday(userId: string): Promise<number>;
  resolveDestination(opts: { placeId?: string; location: string }): Promise<{ center: { lat: number; lng: number }; viewport: Viewport }>;
  fetchPois(opts: { location: string; kind: Poi["kind"]; prefs: Prefs; locationBias?: { center: { lat: number; lng: number }; radiusKm: number } }): Promise<Poi[]>;
  curate(opts: { pois: Poi[]; prefs: Prefs; tripDays: number }): Promise<Itinerary>;
  orderStops(opts: { stops: Poi[]; anchor: { lat: number; lng: number }; travelMode?: "WALK" | "DRIVE" }): Promise<{ ordered: { placeId: string; travelMinutesFromPrev: number }[]; polyline?: string }>;
  saveTrip(opts: { userId: string; req: GenerateRequest; itinerary: Itinerary }): Promise<string>;
  fetchDwell(placeIds: string[]): Promise<Record<string, number>>;
  saveDwell(entries: { placeId: string; minutes: number }[]): Promise<void>;
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

  const wantsFood = body.prefs.interests.includes("food");
  // Food and lodging are enrichments, not the trip itself — a flaky Places call
  // for either should degrade (empty list) rather than crash the whole request
  // into the runtime's 546. Only attractions are essential; if they fail the
  // request throws and the index wrapper turns it into a readable 500.
  const [attractions, food, lodging] = await Promise.all([
    deps.fetchPois({ location: body.location, kind: "attraction", prefs: body.prefs, locationBias }),
    wantsFood
      ? deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs, locationBias }).catch(() => [] as Poi[])
      : Promise.resolve([] as Poi[]),
    deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs, locationBias }).catch(() => [] as Poi[]),
  ]);

  // Start location is optional; a bad placeId shouldn't sink the trip.
  const start = (body.startPlaceId || body.startLocation)
    ? await deps.resolveDestination({ placeId: body.startPlaceId, location: body.startLocation ?? "" }).catch(() => null)
    : null;
  const startCenter = start && (start.center.lat !== 0 || start.center.lng !== 0) ? start.center : null;

  // Food is no longer curated by the LLM. Attractions alone form the pool, so the
  // pace stop budget applies to attractions only; food fills meal slots below.
  const pois = attractions;
  const anchorPoi = lodging[0] ?? null;

  let itinerary: Itinerary;
  try {
    itinerary = await deps.curate({ pois, prefs: body.prefs, tripDays: body.tripDays });
  } catch (e) {
    if (e instanceof CurationError) return { status: 502, body: { error: "could not build itinerary" } };
    throw e;
  }

  // The LLM chose the places but can't see coordinates, so its day grouping
  // produced implausible cross-region driving. Re-group the chosen stops into
  // geographically compact days under a per-day drive budget; geography decides
  // the days, the LLM's selection/blurbs/dwell ride along unchanged.
  const coordsById: Record<string, { lat: number; lng: number }> = {};
  for (const p of pois) coordsById[p.placeId] = { lat: p.lat, lng: p.lng };
  const tuning = TRANSPORT_TUNING[body.prefs.transport];
  const maxDriveKm = (tuning.budgetMin / 60) * tuning.speedKmh;
  const grouped = assignDays({
    stops: itinerary.days.flatMap((d) => d.stops),
    coords: coordsById,
    tripDays: body.tripDays,
    maxDriveKm,
    start: startCenter,
  });
  itinerary = { days: grouped.map((stops, i) => ({ day: i + 1, lodgingPlaceId: null, stops })) };

  const byId = new Map(pois.map((p) => [p.placeId, p]));
  // Route days in parallel — each day mutates only its own object, so a serial
  // loop just stacks N route round-trips and pushes the request past the gateway
  // timeout (504). Promise.all collapses that to a single round-trip's latency.
  const lastDay = itinerary.days.length;
  await Promise.all(itinerary.days.map(async (day) => {
    day.lodgingPlaceId = anchorPoi?.placeId ?? null;
    // Day 1 and the final day anchor on the traveler's start location when set,
    // so the route begins/returns at home/airport instead of a random point.
    const startAnchor = startCenter && (day.day === 1 || day.day === lastDay) ? startCenter : null;
    if (!startAnchor && !anchorPoi && !hasCenter) {
      day.routePolyline = undefined;
      return;
    }
    const anchor = startAnchor ?? (anchorPoi ? { lat: anchorPoi.lat, lng: anchorPoi.lng } : dest.center);
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

  // Per-place dwell: prefer the cached value (deterministic across regens),
  // persist any newly-seen LLM estimate so the dataset grows over time.
  const stopIds = itinerary.days.flatMap((d) => d.stops.map((s) => s.placeId)).filter((id) => id);
  const cachedDwell = await deps.fetchDwell(stopIds);
  const newDwell: { placeId: string; minutes: number }[] = [];
  for (const day of itinerary.days) {
    for (const s of day.stops) {
      if (!s.placeId) continue;
      const cached = cachedDwell[s.placeId];
      if (cached != null) s.dwellMinutes = cached;
      else if (s.dwellMinutes != null) newDwell.push({ placeId: s.placeId, minutes: s.dwellMinutes });
    }
  }
  if (newDwell.length) await deps.saveDwell(newDwell);

  // Meals are deterministic add-ons, layered on after routing so they never
  // affect the attraction order/polyline or the pace stop budget. Food on →
  // each slot gets the nearest-highest-rated restaurant (deduped across days);
  // food off, or none left → a free-range gap. buildDaySchedule then lays the
  // absolute clock over the day and slots the meals at lunch/sunset.
  // `wantsFood` is already declared above (gates the food fetch); reuse it.
  const usedFood = new Set<string>();
  // Note: mealSlot + startTime are stamped by buildDaySchedule (it decides which candidate fills which slot); these constructors intentionally omit them.
  const pickFood = (centroid: { lat: number; lng: number }): Stop | null => {
    let best: Poi | null = null;
    let bestScore = -Infinity;
    for (const f of food) {
      if (usedFood.has(f.placeId)) continue;
      const score = (f.rating ?? 0) - haversineKm(centroid, { lat: f.lat, lng: f.lng }) * 0.05;
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (!best) return null;
    usedFood.add(best.placeId);
    return { placeId: best.placeId, name: best.name, blurb: "A local spot for a meal.", kind: "meal", dwellMinutes: 60 };
  };
  const gap = (slot: "lunch" | "dinner"): Stop => ({
    placeId: "",
    name: slot === "lunch" ? "Lunch — your pick" : "Dinner — your pick",
    blurb: slot === "lunch" ? "Free time to grab a local bite." : "Free time for dinner near sunset.",
    kind: "meal-gap",
    dwellMinutes: 60,
  });

  const sunLat = anchorPoi?.lat ?? dest.center.lat;
  const sunLng = anchorPoi?.lng ?? dest.center.lng;
  itinerary.days.forEach((day, i) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + i);
    const sunsetMin = (anchorPoi || hasCenter) ? sunsetLocalMinutes(sunLat, sunLng, date) : 19 * 60;
    const pts = day.stops.map((s) => byId.get(s.placeId)).filter((p): p is Poi => !!p);
    const centroid = pts.length
      ? { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length }
      : dest.center;
    const lunch = (wantsFood && pickFood(centroid)) || gap("lunch");
    const dinner = (wantsFood && pickFood(centroid)) || gap("dinner");
    day.stops = buildDaySchedule({ attractions: day.stops, sunsetMinutes: sunsetMin, lunch, dinner });
  });

  const tripId = await deps.saveTrip({ userId, req: body, itinerary });
  return { status: 200, body: { tripId, itinerary } };
}
