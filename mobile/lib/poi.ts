// mobile/lib/poi.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface StopCoord {
  lat: number;
  lng: number;
  name: string;
}

interface CachedRow {
  place_id: string;
  payload: { lat: number; lng: number; name: string };
}

export async function getStopCoords(
  client: SupabaseClient,
  placeIds: string[],
): Promise<Record<string, StopCoord>> {
  if (placeIds.length === 0) return {};
  const { data, error } = await client
    .from("cached_pois")
    .select("place_id, payload")
    .in("place_id", placeIds);
  if (error) throw error;
  const out: Record<string, StopCoord> = {};
  for (const row of (data ?? []) as CachedRow[]) {
    out[row.place_id] = { lat: row.payload.lat, lng: row.payload.lng, name: row.payload.name };
  }
  return out;
}

export function formatDwell(minutes?: number): string | null {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `~${m} min`;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

// Google encoded polyline algorithm format → lat/lng points.
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}
