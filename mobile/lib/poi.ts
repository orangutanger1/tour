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
