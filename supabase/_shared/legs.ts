// supabase/_shared/legs.ts
//
// Long trips can't be curated in one LLM call: the POI pool (~20 per Places
// fetch) can't fill 30+ unique-place days, and one giant prompt drifts. So
// trips longer than MAX_LEG_DAYS split into consecutive geographic legs —
// each leg gets its own sub-area, POI fetch, and curation call (in parallel),
// then the days concatenate. Grounding and validation stay per-leg.
import type { Viewport } from "./area.ts";
import type { TripType } from "./types.ts";
import { haversineKm } from "./area.ts";

type LatLng = { lat: number; lng: number };

export const MAX_LEG_DAYS = 7;

// Balanced split: k = ceil(days/max) legs, sizes differ by at most 1.
export function planLegs(tripDays: number, maxLegDays = MAX_LEG_DAYS): number[] {
  const k = Math.ceil(tripDays / maxLegDays);
  const base = Math.floor(tripDays / k);
  const rem = tripDays % k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}

// Leg centers along the viewport diagonal. oneway: low → high. round: out and
// back (triangle wave) so the final leg lands near where the first began.
// ponytail: the diagonal is a crude axis — upgrade to orienting from the
// traveler's start location if long-trip routes feel backwards.
export function legCenters(opts: { center: LatLng; viewport: Viewport; legs: number; tripType: TripType }): LatLng[] {
  const { center, viewport, legs, tripType } = opts;
  if (legs === 1 || !viewport) return Array.from({ length: legs }, () => ({ ...center }));
  const { low, high } = viewport;
  const out: LatLng[] = [];
  for (let i = 0; i < legs; i++) {
    const t = i / (legs - 1);                                        // 0..1
    // Triangle wave needs >=3 samples to hit a distinct peak; at legs===2 both
    // endpoints land on t=0/1 which fold to the same u=0, collapsing both leg
    // centers onto the same viewport corner (starves one leg's POI search).
    const u = tripType === "round" && legs >= 3 ? 1 - Math.abs(2 * t - 1) : t;

    out.push({ lat: low.lat + (high.lat - low.lat) * u, lng: low.lng + (high.lng - low.lng) * u });
  }
  return out;
}

// Disjoint pools: each item goes to its nearest leg center, so parallel
// curations can never pick the same place twice. Round trips duplicate the
// start-area center for the first and last legs, so distance ties are real:
// break them toward the emptier pool or the return leg starves to an empty
// pool and its curation fails the whole trip.
export function partitionByNearest<T extends { lat: number; lng: number }>(items: T[], centers: LatLng[]): T[][] {
  const parts: T[][] = centers.map(() => []);
  const TIE_KM = 1e-9;
  for (const item of items) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = haversineKm(centers[i], { lat: item.lat, lng: item.lng });
      if (d < bestD - TIE_KM || (Math.abs(d - bestD) <= TIE_KM && parts[i].length < parts[best].length)) {
        bestD = d; best = i;
      }
    }
    parts[best].push(item);
  }
  return parts;
}

// Fallback partition when there is no geometry to partition by (free-typed
// destination, center {0,0}): deal the pool out evenly.
export function splitRoundRobin<T>(items: T[], k: number): T[][] {
  const parts: T[][] = Array.from({ length: k }, () => []);
  items.forEach((item, i) => parts[i % k].push(item));
  return parts;
}

// Sparse destinations can't fill every requested day — a day needs ~2
// attractions minimum. Never 0, never more than asked.
export function effectiveTripDays(poolSize: number, tripDays: number): number {
  return Math.min(tripDays, Math.max(1, Math.floor(poolSize / 2)));
}
