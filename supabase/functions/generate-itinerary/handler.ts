// supabase/functions/generate-itinerary/handler.ts
import type { Itinerary, Poi, Prefs, Stop, TripType } from "../../_shared/types.ts";
import { CurationError } from "../../_shared/curate.ts";
import { areaRadiusKm, haversineKm, type Viewport } from "../../_shared/area.ts";
import { assignDays } from "../../_shared/cluster.ts";
import { planLegs, legCenters, partitionByNearest, splitRoundRobin, effectiveTripDays, allocateDays } from "../../_shared/legs.ts";
import { sunsetLocalMinutes } from "../../_shared/solar.ts";
import { buildDaySchedule } from "../../_shared/schedule.ts";

export const DAILY_CAP = 10;
export const FREE_TRIP_LIMIT = 1;

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
  subDestinations?: { placeId: string; label: string }[];
  startLocation?: string;
  startPlaceId?: string;
  startDate?: string;   // ISO YYYY-MM-DD
  endDate?: string;
  tripType?: TripType;  // default "round"
}

export interface PipelineDeps {
  resolveDestination(opts: { placeId?: string; location: string }): Promise<{ center: { lat: number; lng: number }; viewport: Viewport }>;
  fetchPois(opts: { location: string; kind: Poi["kind"]; prefs: Prefs; locationBias?: { center: { lat: number; lng: number }; radiusKm: number } }): Promise<Poi[]>;
  curate(opts: { pois: Poi[]; prefs: Prefs; tripDays: number }): Promise<Itinerary>;
  orderStops(opts: { stops: Poi[]; anchor: { lat: number; lng: number }; travelMode?: "WALK" | "DRIVE" }): Promise<{ ordered: { placeId: string; travelMinutesFromPrev: number }[]; polyline?: string }>;
  fetchDwell(placeIds: string[]): Promise<Record<string, number>>;
  saveDwell(entries: { placeId: string; minutes: number }[]): Promise<void>;
}

export interface StartDeps extends PipelineDeps {
  countTripsToday(userId: string): Promise<number>;   // implementation must exclude failed rows
  countTotalTrips(userId: string): Promise<number>;   // all-time, excludes failed rows
  hasProEntitlement(userId: string): Promise<boolean>; // may throw — caller fails open
  createPendingTrip(opts: { userId: string; req: GenerateRequest }): Promise<string>;
  completeTrip(opts: { tripId: string; itinerary: Itinerary }): Promise<void>;
  failTrip(opts: { tripId: string; message: string }): Promise<void>;
}

export async function buildItinerary(body: GenerateRequest, deps: PipelineDeps): Promise<Itinerary> {
  const dest = await deps.resolveDestination({ placeId: body.destinationPlaceId, location: body.location });
  const radiusKm = areaRadiusKm({ viewport: dest.viewport, transport: body.prefs.transport });
  const hasCenter = dest.center.lat !== 0 || dest.center.lng !== 0;
  const locationBias = hasCenter ? { center: dest.center, radiusKm } : undefined;
  const travelMode = body.prefs.transport === "compact" ? "WALK" as const : "DRIVE" as const;

  const tripType: TripType = body.tripType ?? "round";

  const wantsFood = body.prefs.interests.includes("food");
  // Food and lodging are region-wide enrichments (parent bias), fetched in
  // parallel with the attraction work below. A flaky call degrades to [].
  const foodP = wantsFood
    ? deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs, locationBias }).catch(() => [] as Poi[])
    : Promise.resolve([] as Poi[]);
  const lodgingP = deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs, locationBias }).catch(() => [] as Poi[]);

  // Start location is optional; a bad placeId shouldn't sink the trip.
  const start = (body.startPlaceId || body.startLocation)
    ? await deps.resolveDestination({ placeId: body.startPlaceId, location: body.startLocation ?? "" }).catch(() => null)
    : null;
  const startCenter = start && (start.center.lat !== 0 || start.center.lng !== 0) ? start.center : null;

  // --- Attraction pools + leg plan ---
  let pois: Poi[];
  let finalLegSizes: number[];
  let legPools: Poi[][];
  let finalMultiLeg: boolean;

  const picks = body.subDestinations ?? [];
  if (picks.length > 0) {
    // Multi-city: the user chose the cities. Each is one leg — geocode its
    // center, fetch a dense city-scale pool, split the days across the cities.
    const geos = await Promise.all(picks.map((p) =>
      deps.resolveDestination({ placeId: p.placeId, location: p.label }).catch(() => null)));
    const cities = picks
      .map((p, i) => ({ p, geo: geos[i] }))
      .filter((c): c is { p: { placeId: string; label: string }; geo: { center: { lat: number; lng: number }; viewport: Viewport } } =>
        !!c.geo && (c.geo.center.lat !== 0 || c.geo.center.lng !== 0));
    const allotted = allocateDays(body.tripDays, cities.length || 1);
    const rawPools = await Promise.all(cities.map((c) =>
      deps.fetchPois({
        location: c.p.label, kind: "attraction", prefs: body.prefs,
        locationBias: { center: c.geo.center, radiusKm: areaRadiusKm({ viewport: c.geo.viewport, transport: body.prefs.transport }) },
      }).catch(() => [] as Poi[])));
    // Dedupe globally, keeping each city's pool disjoint (first city keeps a shared place).
    const seen = new Set<string>();
    const disjoint = rawPools.map((pool) => {
      const out: Poi[] = [];
      for (const p of pool) if (!seen.has(p.placeId)) { seen.add(p.placeId); out.push(p); }
      return out;
    });
    // Drop cities that returned nothing; cap each survivor's days to its pool.
    const kept = disjoint
      .map((pool, i) => ({ pool, days: effectiveTripDays(pool.length, allotted[i]) }))
      .filter((k) => k.pool.length > 0);
    legPools = kept.map((k) => k.pool);
    finalLegSizes = kept.map((k) => k.days);
    finalMultiLeg = legPools.length > 1;
    pois = legPools.flat();
    // Every picked city came back empty (all Places calls failed) → fall back to
    // the parent single-center pool so the trip still builds rather than 500-ing.
    if (legPools.length === 0) {
      const pool = await deps.fetchPois({ location: body.location, kind: "attraction", prefs: body.prefs, locationBias });
      pois = pool;
      finalLegSizes = [effectiveTripDays(pool.length, body.tripDays)];
      legPools = [pool];
      finalMultiLeg = false;
    }
  } else {
    // Single-destination path (unchanged): fetch around the destination centroid,
    // then re-plan geometric legs from the pool we actually got.
    const legSizes = planLegs(body.tripDays);
    const centers = legCenters({ center: dest.center, viewport: dest.viewport, legs: legSizes.length, tripType });
    const multiLeg = legSizes.length > 1;
    // ponytail: leg bias radius = region radius / legs, floor 10km.
    const legRadiusKm = Math.max(radiusKm / legSizes.length, 10);
    const attractionPools = await Promise.all(centers.map((c) =>
      deps.fetchPois({
        location: body.location, kind: "attraction", prefs: body.prefs,
        locationBias: hasCenter ? { center: c, radiusKm: multiLeg ? legRadiusKm : radiusKm } : undefined,
      })));
    const seenIds = new Set<string>();
    pois = [];
    for (const pool of attractionPools) {
      for (const p of pool) if (!seenIds.has(p.placeId)) { seenIds.add(p.placeId); pois.push(p); }
    }
    const plannedDays = effectiveTripDays(pois.length, body.tripDays);
    finalLegSizes = planLegs(plannedDays);
    if (pois.length < 8 * finalLegSizes.length) finalLegSizes = [plannedDays];
    const finalCenters = legCenters({ center: dest.center, viewport: dest.viewport, legs: finalLegSizes.length, tripType });
    finalMultiLeg = finalLegSizes.length > 1;
    legPools = finalMultiLeg
      ? (hasCenter ? partitionByNearest(pois, finalCenters) : splitRoundRobin(pois, finalLegSizes.length))
      : [pois];
    if (finalMultiLeg && legPools.some((p, i) => p.length < finalLegSizes[i])) {
      finalLegSizes = [plannedDays];
      finalMultiLeg = false;
      legPools = [pois];
    }
  }

  const [food, lodging] = await Promise.all([foodP, lodgingP]);
  const anchorPoi = lodging[0] ?? null;

  // Curate each leg in parallel — grounding + validation stay per-leg
  // (expectedDays = leg length, placeId whitelist = that leg's pool). A
  // CurationError here propagates to the caller (startGenerate maps it to a
  // readable failure message on the trip row).
  const legItins: Itinerary[] = await Promise.all(legPools.map((pool, i) =>
    deps.curate({ pois: pool, prefs: body.prefs, tripDays: finalLegSizes[i] })));

  // The LLM chose the places but can't see coordinates, so its day grouping
  // produced implausible cross-region driving. Re-group each leg's stops into
  // geographically compact days under a per-day drive budget; geography decides
  // the days, the LLM's selection/blurbs/dwell ride along unchanged. Trip-type
  // ordering applies within a single leg; multi-leg trips already encode
  // out-and-back (or drift) in the leg centers themselves.
  const coordsById: Record<string, { lat: number; lng: number }> = {};
  for (const p of pois) coordsById[p.placeId] = { lat: p.lat, lng: p.lng };
  const tuning = TRANSPORT_TUNING[body.prefs.transport];
  const maxDriveKm = (tuning.budgetMin / 60) * tuning.speedKmh;
  const allDays: Itinerary["days"] = [];
  legItins.forEach((li, i) => {
    const grouped = assignDays({
      stops: li.days.flatMap((d) => d.stops),
      coords: coordsById,
      tripDays: finalLegSizes[i],
      maxDriveKm,
      start: i === 0 ? startCenter : null,
      tripType: finalMultiLeg ? undefined : tripType,
    });
    for (const stops of grouped) allDays.push({ day: allDays.length + 1, lodgingPlaceId: null, stops });
  });
  let itinerary: Itinerary = { days: allDays };

  const byId = new Map(pois.map((p) => [p.placeId, p]));
  // Route days in parallel — each day mutates only its own object, so a serial
  // loop just stacks N route round-trips and pushes the request past the gateway
  // timeout (504). Promise.all collapses that to a single round-trip's latency.
  const lastDay = itinerary.days.length;
  await Promise.all(itinerary.days.map(async (day) => {
    day.lodgingPlaceId = anchorPoi?.placeId ?? null;
    // Day 1 anchors on the traveler's start when set; the final day returns
    // there only on round trips — one-way routes end wherever they drifted.
    const anchorAtStart = startCenter && (day.day === 1 || (tripType === "round" && day.day === lastDay));
    const startAnchor = anchorAtStart ? startCenter : null;
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

  return itinerary;
}

export async function startGenerate(
  body: GenerateRequest,
  userId: string,
  deps: StartDeps,
): Promise<{ status: number; body: unknown; run?: () => Promise<void> }> {
  if (!body || body.tripDays < 1) {
    return { status: 400, body: { error: "tripDays must be >= 1" } };
  }
  if (body.tripDays > 365) {
    return { status: 400, body: { error: "tripDays must be <= 365" } };
  }
  if ((await deps.countTripsToday(userId)) >= DAILY_CAP) {
    return { status: 429, body: { error: "daily generation limit reached" } };
  }

  if ((await deps.countTotalTrips(userId)) >= FREE_TRIP_LIMIT) {
    let pro = true; // fail open: an entitlement-provider outage must never block generation
    try {
      pro = await deps.hasProEntitlement(userId);
    } catch (e) {
      console.error("entitlement check failed (allowing):", e instanceof Error ? e.message : e);
    }
    if (!pro) return { status: 402, body: { error: "pro required" } };
  }

  const tripId = await deps.createPendingTrip({ userId, req: body });
  // run() never throws: the caller hands it to EdgeRuntime.waitUntil where a
  // rejection would be an unobserved crash. Every failure lands in the trip row.
  const run = async () => {
    try {
      const itinerary = await buildItinerary(body, deps);
      await deps.completeTrip({ tripId, itinerary });
    } catch (e) {
      console.error("generate pipeline failed:", e instanceof Error ? e.stack ?? e.message : e);
      const message = e instanceof CurationError ? "could not build itinerary" : "itinerary generation failed";
      await deps.failTrip({ tripId, message }).catch((err) => console.error("failTrip failed:", err));
    }
  };
  return { status: 202, body: { tripId }, run };
}
