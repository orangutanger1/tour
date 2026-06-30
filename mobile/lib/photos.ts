// mobile/lib/photos.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PhotoRow {
  id: string;
  tripId: string;
  placeId: string;
  placeName: string;
  caption: string | null;
  sortOrder: number;
  isFavorite: boolean;
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
  caption: string | null; sort_order: number; is_favorite: boolean;
  storage_path: string; created_at: string;
}

function rowToPhoto(r: PhotoDbRow): PhotoRow {
  return {
    id: r.id, tripId: r.trip_id, placeId: r.place_id, placeName: r.place_name,
    caption: r.caption, sortOrder: r.sort_order, isFavorite: !!r.is_favorite,
    storagePath: r.storage_path, createdAt: r.created_at,
  };
}

export async function listPhotos(client: SupabaseClient): Promise<PhotoRow[]> {
  const { data, error } = await client
    .from("trip_photos")
    .select("id, trip_id, place_id, place_name, caption, sort_order, is_favorite, storage_path, created_at")
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
  for (const item of data ?? []) if (item.signedUrl && item.path) out[item.path] = item.signedUrl;
  return out;
}

// One signed URL, cached per-path by the caller so add/delete/reorder don't churn
// every image's token (which would make <Image> re-download). 1h expiry.
export async function signedUrl(client: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// ponytail: filename id — not crypto-grade, only needs to be unique per upload.
function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ponytail: hand-rolled base64 decode — React Native has no atob, and this saves
// a dependency for the one place we need raw bytes (storage upload).
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0, value = 0, idx = 0;
  for (const ch of clean) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[idx++] = (value >> bits) & 0xff; }
  }
  return out;
}

export async function addPhoto(
  client: SupabaseClient,
  args: { tripId: string; placeId: string; placeName: string; caption: string | null; base64: string },
): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const path = `${user.id}/${args.tripId}/${uid()}.jpg`;

  const { error: upErr } = await client.storage
    .from(BUCKET)
    .upload(path, base64ToBytes(args.base64), { contentType: "image/jpeg" });
  if (upErr) throw upErr; // no row without a successful upload

  const { data: existing } = await client
    .from("trip_photos").select("sort_order").eq("trip_id", args.tripId);
  const sortOrder = nextSortOrder(
    ((existing ?? []) as { sort_order: number }[]).map((r) => ({ sortOrder: r.sort_order })),
  );

  const { error: insErr } = await client.from("trip_photos").insert({
    user_id: user.id, trip_id: args.tripId, place_id: args.placeId,
    place_name: args.placeName, caption: args.caption, sort_order: sortOrder,
    storage_path: path,
  });
  if (insErr) {
    await client.storage.from(BUCKET).remove([path]); // roll back the orphan
    throw insErr;
  }
}

export async function deletePhoto(client: SupabaseClient, photo: PhotoRow): Promise<void> {
  const { error } = await client.from("trip_photos").delete().eq("id", photo.id);
  if (error) throw error;
  await client.storage.from(BUCKET).remove([photo.storagePath]); // best-effort cleanup
}

export async function updateCaption(
  client: SupabaseClient, id: string, caption: string | null,
): Promise<void> {
  const { error } = await client.from("trip_photos").update({ caption }).eq("id", id);
  if (error) throw error;
}

export async function toggleFavorite(
  client: SupabaseClient, id: string, value: boolean,
): Promise<void> {
  const { error } = await client.from("trip_photos").update({ is_favorite: value }).eq("id", id);
  if (error) throw error;
}

// ponytail: N sequential updates — fine for album-sized lists; batch via RPC if albums get huge.
export async function reorderPhotos(client: SupabaseClient, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await client.from("trip_photos").update({ sort_order: i }).eq("id", orderedIds[i]);
    if (error) throw error;
  }
}
