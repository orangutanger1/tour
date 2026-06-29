// supabase/_shared/cluster.ts
//
// Deterministic geographic day-assignment. The LLM curates *which* places are
// worth visiting (subjective) but has no coordinates, so it can't keep a day
// compact — that's what produced 13-hour driving days. This module does the
// geometry the LLM can't: chain stops by proximity, split into days, and drop
// the far outliers that blow a realistic daily drive budget.
//
// ponytail: haversine * roadFactor estimates road distance — real roads wind,
// so the budget is approximate. Real drive times come from the Routes API after
// this runs. If users report days that still feel long, lower the budgets in
// the handler or feed real routed legs back into enforceBudget.

import { haversineKm } from "./area.ts";

type LatLng = { lat: number; lng: number };

const DEFAULT_ROAD_FACTOR = 1.3;

function coordOf(coords: Record<string, LatLng>, placeId: string): LatLng {
  return coords[placeId] ?? { lat: 0, lng: 0 };
}

// Greedy nearest-neighbour ordering from a seed point. Keeps spatially close
// stops adjacent, so a contiguous slice of the result is a compact region.
function nnChain<T extends { placeId: string }>(stops: T[], coords: Record<string, LatLng>, seed: LatLng): T[] {
  const remaining = [...stops];
  const out: T[] = [];
  let cur = seed;
  while (remaining.length) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(cur, coordOf(coords, remaining[i].placeId));
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    out.push(picked);
    cur = coordOf(coords, picked.placeId);
  }
  return out;
}

// Contiguous, count-balanced split into k groups (sizes differ by at most 1).
function splitBalanced<T>(arr: T[], k: number): T[][] {
  const groups: T[][] = [];
  const base = Math.floor(arr.length / k);
  const rem = arr.length % k;
  let idx = 0;
  for (let i = 0; i < k; i++) {
    const size = base + (i < rem ? 1 : 0);
    groups.push(arr.slice(idx, idx + size));
    idx += size;
  }
  return groups;
}

// Estimated road distance along the day's chain (open path, no return leg).
function pathKm<T extends { placeId: string }>(group: T[], coords: Record<string, LatLng>, roadFactor: number): number {
  let total = 0;
  for (let i = 1; i < group.length; i++) {
    total += haversineKm(coordOf(coords, group[i - 1].placeId), coordOf(coords, group[i].placeId)) * roadFactor;
  }
  return total;
}

// Drop stops until the day fits the drive budget. Removes whichever stop leaves
// the shortest remaining path (the far outlier), never empties the day.
function enforceBudget<T extends { placeId: string }>(
  group: T[], coords: Record<string, LatLng>, maxDriveKm: number, roadFactor: number,
): T[] {
  const g = [...group];
  while (g.length > 1 && pathKm(g, coords, roadFactor) > maxDriveKm) {
    let bestIdx = 0, bestPath = Infinity;
    for (let i = 0; i < g.length; i++) {
      const trial = [...g.slice(0, i), ...g.slice(i + 1)];
      const p = pathKm(trial, coords, roadFactor);
      if (p < bestPath) { bestPath = p; bestIdx = i; }
    }
    g.splice(bestIdx, 1);
  }
  return g;
}

export function assignDays<T extends { placeId: string }>(opts: {
  stops: T[];
  coords: Record<string, LatLng>;
  tripDays: number;
  maxDriveKm: number;       // per-day road-distance budget
  start?: LatLng | null;    // anchor day 1 nearest the traveler's start
  roadFactor?: number;
}): T[][] {
  const { stops, coords, tripDays, maxDriveKm } = opts;
  const roadFactor = opts.roadFactor ?? DEFAULT_ROAD_FACTOR;
  const seed = opts.start ?? (stops.length ? coordOf(coords, stops[0].placeId) : { lat: 0, lng: 0 });
  const ordered = nnChain(stops, coords, seed);
  const groups = splitBalanced(ordered, Math.max(1, tripDays));
  return groups.map((g) => enforceBudget(g, coords, maxDriveKm, roadFactor));
}
