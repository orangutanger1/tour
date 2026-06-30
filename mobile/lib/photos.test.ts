import {
  groupByAlbum, distinctPlaceIds, coverPhoto, nextSortOrder, clusterPins,
  type PhotoRow, addPhoto, base64ToBytes, listPhotos, signedUrls,
} from "./photos";
import type { SupabaseClient } from "@supabase/supabase-js";

function p(over: Partial<PhotoRow>): PhotoRow {
  return {
    id: "id", tripId: "t1", placeId: "pl", placeName: "Place", caption: null,
    sortOrder: 0, storagePath: "u/t/x.jpg", createdAt: "2026-06-01T00:00:00Z", ...over,
  };
}

test("groupByAlbum groups by trip, keeps first-seen order, sorts by sortOrder", () => {
  const albums = groupByAlbum([
    p({ id: "a", tripId: "t1", sortOrder: 1 }),
    p({ id: "b", tripId: "t2", sortOrder: 0 }),
    p({ id: "c", tripId: "t1", sortOrder: 0 }),
  ]);
  expect(albums.map((a) => a.tripId)).toEqual(["t1", "t2"]);
  expect(albums[0].photos.map((x) => x.id)).toEqual(["c", "a"]);
});

test("distinctPlaceIds dedupes preserving order", () => {
  expect(distinctPlaceIds([p({ placeId: "x" }), p({ placeId: "y" }), p({ placeId: "x" })]))
    .toEqual(["x", "y"]);
});

test("coverPhoto picks lowest sortOrder, newest as tiebreak, null when empty", () => {
  expect(coverPhoto([])).toBeNull();
  const c = coverPhoto([
    p({ id: "a", sortOrder: 1 }),
    p({ id: "b", sortOrder: 0, createdAt: "2026-06-02T00:00:00Z" }),
    p({ id: "c", sortOrder: 0, createdAt: "2026-06-05T00:00:00Z" }),
  ]);
  expect(c?.id).toBe("c");
});

test("nextSortOrder is max+1, or 0 when empty", () => {
  expect(nextSortOrder([])).toBe(0);
  expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 3 }])).toBe(4);
});

test("clusterPins buckets pins into a grid and averages centers", () => {
  const clusters = clusterPins([
    { id: "a", lat: 35.01, lng: 139.01 },
    { id: "b", lat: 35.02, lng: 139.02 },
    { id: "c", lat: 48.85, lng: 2.35 },
  ], 1);
  expect(clusters).toHaveLength(2);
  const tokyo = clusters.find((c) => c.count === 2)!;
  expect(tokyo.ids.sort()).toEqual(["a", "b"]);
  expect(tokyo.lat).toBeCloseTo(35.015, 3);
});

const dbRow = {
  id: "ph1", trip_id: "t1", place_id: "pl1", place_name: "Senso-ji",
  caption: "torii", sort_order: 2, storage_path: "u/t1/x.jpg",
  created_at: "2026-06-01T00:00:00Z",
};

function listClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return { from: () => ({ select: () => ({ order: async () => result }) }) } as unknown as SupabaseClient;
}

test("listPhotos maps db rows to PhotoRow", async () => {
  const rows = await listPhotos(listClient({ data: [dbRow], error: null }));
  expect(rows[0]).toEqual({
    id: "ph1", tripId: "t1", placeId: "pl1", placeName: "Senso-ji",
    caption: "torii", sortOrder: 2, storagePath: "u/t1/x.jpg",
    createdAt: "2026-06-01T00:00:00Z",
  });
});

test("listPhotos throws on error", async () => {
  await expect(listPhotos(listClient({ data: null, error: { message: "x" } }))).rejects.toBeTruthy();
});

test("signedUrls returns {} for empty input without calling storage", async () => {
  const client = { storage: { from: () => { throw new Error("should not be called"); } } } as unknown as SupabaseClient;
  expect(await signedUrls(client, [])).toEqual({});
});

test("signedUrls maps path to signedUrl", async () => {
  const client = {
    storage: { from: () => ({
      createSignedUrls: async () => ({
        data: [{ path: "u/t1/x.jpg", signedUrl: "https://signed/x" }], error: null,
      }),
    }) },
  } as unknown as SupabaseClient;
  expect(await signedUrls(client, ["u/t1/x.jpg"])).toEqual({ "u/t1/x.jpg": "https://signed/x" });
});

test("base64ToBytes decodes a known string", () => {
  // "Man" => TWFu
  expect(Array.from(base64ToBytes("TWFu"))).toEqual([77, 97, 110]);
});

function uploadSpyClient(opts: { uploadError?: unknown; insertError?: unknown }) {
  const calls: string[] = [];
  const removed: string[][] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    storage: { from: () => ({
      upload: async () => { calls.push("upload"); return { error: opts.uploadError ?? null }; },
      remove: async (paths: string[]) => { calls.push("remove"); removed.push(paths); return { error: null }; },
    }) },
    from: () => ({
      select: () => ({ eq: async () => ({ data: [{ sort_order: 0 }, { sort_order: 1 }], error: null }) }),
      insert: async () => { calls.push("insert"); return { error: opts.insertError ?? null }; },
    }),
  } as unknown as SupabaseClient;
  return { client, calls, removed };
}

const addArgs = { tripId: "t1", placeId: "pl1", placeName: "Senso-ji", caption: null, base64: "TWFu" };

test("addPhoto uploads before inserting", async () => {
  const { client, calls } = uploadSpyClient({});
  await addPhoto(client, addArgs);
  expect(calls).toEqual(["upload", "insert"]);
});

test("addPhoto does not insert when upload fails", async () => {
  const { client, calls } = uploadSpyClient({ uploadError: { message: "up" } });
  await expect(addPhoto(client, addArgs)).rejects.toBeTruthy();
  expect(calls).toEqual(["upload"]);
});

test("addPhoto rolls back the object when insert fails", async () => {
  const { client, calls } = uploadSpyClient({ insertError: { message: "ins" } });
  await expect(addPhoto(client, addArgs)).rejects.toBeTruthy();
  expect(calls).toEqual(["upload", "insert", "remove"]);
});
