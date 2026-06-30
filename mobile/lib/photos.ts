// mobile/lib/photos.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PhotoRow {
  id: string;
  tripId: string;
  placeId: string;
  placeName: string;
  caption: string | null;
  sortOrder: number;
  storagePath: string;
  createdAt: string;
}

export interface Album {
  tripId: string;
  photos: PhotoRow[]; // sorted by sortOrder asc
}

export interface Pin { id: string; lat: number; lng: number; }
export interface Cluster { lat: number; lng: number; count: number; ids: string[]; }

export function groupByAlbum(photos: PhotoRow[]): Album[] {
  const order: string[] = [];
  const map = new Map<string, PhotoRow[]>();
  for (const photo of photos) {
    if (!map.has(photo.tripId)) { map.set(photo.tripId, []); order.push(photo.tripId); }
    map.get(photo.tripId)!.push(photo);
  }
  return order.map((tripId) => ({
    tripId,
    photos: [...map.get(tripId)!].sort((a, b) => a.sortOrder - b.sortOrder),
  }));
}

export function distinctPlaceIds(photos: PhotoRow[]): string[] {
  return [...new Set(photos.map((photo) => photo.placeId))];
}

export function coverPhoto(photos: PhotoRow[]): PhotoRow | null {
  if (photos.length === 0) return null;
  return [...photos].sort(
    (a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt),
  )[0];
}

export function nextSortOrder(items: { sortOrder: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
}

// ponytail: grid-bucket clustering, no library. cellDeg comes from the caller's
// zoom. Good enough for a small map header; swap for a real index if pins grow huge.
export function clusterPins(pins: Pin[], cellDeg: number): Cluster[] {
  const buckets = new Map<string, Pin[]>();
  for (const pin of pins) {
    const key = `${Math.floor(pin.lat / cellDeg)}:${Math.floor(pin.lng / cellDeg)}`;
    const group = buckets.get(key) ?? [];
    if (group.length === 0) buckets.set(key, group);
    group.push(pin);
  }
  return [...buckets.values()].map((group) => ({
    lat: group.reduce((sum, pin) => sum + pin.lat, 0) / group.length,
    lng: group.reduce((sum, pin) => sum + pin.lng, 0) / group.length,
    count: group.length,
    ids: group.map((pin) => pin.id),
  }));
}

export const BUCKET = "trip-photos";

interface PhotoDbRow {
  id: string; trip_id: string; place_id: string; place_name: string;
  caption: string | null; sort_order: number; storage_path: string; created_at: string;
}

function rowToPhoto(r: PhotoDbRow): PhotoRow {
  return {
    id: r.id, tripId: r.trip_id, placeId: r.place_id, placeName: r.place_name,
    caption: r.caption, sortOrder: r.sort_order, storagePath: r.storage_path,
    createdAt: r.created_at,
  };
}

export async function listPhotos(client: SupabaseClient): Promise<PhotoRow[]> {
  const { data, error } = await client
    .from("trip_photos")
    .select("id, trip_id, place_id, place_name, caption, sort_order, storage_path, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PhotoDbRow[]).map(rowToPhoto);
}

export async function signedUrls(
  client: SupabaseClient, paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await client.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const item of data ?? []) if (item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}
