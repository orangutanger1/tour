# Passport (Home Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Passport tab — a clustered map of visited landmarks plus per-destination photo albums (fanned stacks → captioned, reorderable galleries) backed by user-uploaded photos.

**Architecture:** A new `trip_photos` table + private Supabase storage bucket hold user photos keyed to a trip's landmark. `lib/photos.ts` owns all data access (client calls) and pure transforms (grouping, clustering, cover selection); screens are thin. Map pin coordinates reuse the existing `cached_pois` lookup (`getStopCoords`). Gallery aesthetic is a profile setting.

**Tech Stack:** Expo Router (v56), React Native + NativeWind, `@tanstack/react-query`, `@supabase/supabase-js` (Postgres + Storage), `expo-maps` (AppleMaps), `expo-image-picker` (new), Jest (jest-expo) for `lib` unit tests.

## Global Constraints

- Expo SDK **v56** — verify any new dep against `https://docs.expo.dev/versions/v56.0.0/` before installing (per `mobile/AGENTS.md`).
- Supabase client is the singleton `import { supabase } from "../../lib/supabase"`. `lib` functions take a `SupabaseClient` argument so they're testable with a mock (mirror `lib/trips.ts`, `lib/profile.ts`).
- RLS scopes every table to `auth.uid()`; never add a `user_id` filter in client queries (the policy handles it).
- Storage bucket `trip-photos` is **private**; display only via signed URLs.
- Photo → row invariant: **never insert a `trip_photos` row without a successful upload**; roll back the object if the insert fails.
- Album grouping is **per `trip_id`**, labelled `trip.location`.
- Reorder uses **up/down move + set-cover** (writes `sort_order` via `reorderPhotos`). Drag-reorder is a deferred polish — do NOT add `react-native-gesture-handler` wiring in this plan.
- `lib` logic is unit-tested with Jest. Components/screens are verified with `npx tsc --noEmit` (the repo has no component tests; don't introduce a test framework for them).
- Commit after every task. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- All shell/jest/tsc commands run from `mobile/` unless noted.

---

### Task 1: Migration — `trip_photos` table + storage bucket + RLS

**Files:**
- Create: `supabase/migrations/0003_trip_photos.sql`

**Interfaces:**
- Produces: table `public.trip_photos(id, user_id, trip_id, place_id, place_name, caption, sort_order, storage_path, created_at)`; private bucket `trip-photos`; owner-only RLS on both.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_trip_photos.sql`:

```sql
-- supabase/migrations/0003_trip_photos.sql
create table if not exists public.trip_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  place_id text not null,
  place_name text not null,
  caption text,
  sort_order int not null default 0,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists trip_photos_album_idx
  on public.trip_photos (user_id, trip_id, sort_order);

alter table public.trip_photos enable row level security;

create policy "own photos" on public.trip_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private bucket for user-taken photos.
insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', false)
on conflict (id) do nothing;

-- Object key layout: {user_id}/{trip_id}/{uuid}.jpg — owner is the first path segment.
create policy "own photo objects read" on storage.objects
  for select using (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own photo objects insert" on storage.objects
  for insert with check (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own photo objects delete" on storage.objects
  for delete using (
    bucket_id = 'trip-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply locally and verify it parses**

Run (from repo root): `supabase db reset` (re-applies all migrations to the local DB).
Expected: completes without SQL errors; `0003_trip_photos.sql` listed among applied migrations.

If the project has no local Supabase running, instead verify syntax by reviewing against `0001_init.sql` (same `enable row level security` + `create policy` shape) and apply via the dashboard/CI as other migrations are applied. Note in the commit which path was used.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_trip_photos.sql
git commit -m "feat(db): trip_photos table + private trip-photos bucket + RLS

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `lib/photos.ts` — pure helpers

**Files:**
- Create: `mobile/lib/photos.ts`
- Test: `mobile/lib/photos.test.ts`

**Interfaces:**
- Produces:
  - `interface PhotoRow { id: string; tripId: string; placeId: string; placeName: string; caption: string | null; sortOrder: number; storagePath: string; createdAt: string }`
  - `interface Album { tripId: string; photos: PhotoRow[] }` (photos sorted by `sortOrder` asc)
  - `interface Pin { id: string; lat: number; lng: number }`
  - `interface Cluster { lat: number; lng: number; count: number; ids: string[] }`
  - `groupByAlbum(photos: PhotoRow[]): Album[]`
  - `distinctPlaceIds(photos: PhotoRow[]): string[]`
  - `coverPhoto(photos: PhotoRow[]): PhotoRow | null`
  - `nextSortOrder(items: { sortOrder: number }[]): number`
  - `clusterPins(pins: Pin[], cellDeg: number): Cluster[]`

- [ ] **Step 1: Write the failing tests**

Create `mobile/lib/photos.test.ts`:

```ts
import {
  groupByAlbum, distinctPlaceIds, coverPhoto, nextSortOrder, clusterPins,
  type PhotoRow,
} from "./photos";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/photos.test.ts`
Expected: FAIL — `Cannot find module './photos'`.

- [ ] **Step 3: Implement the pure helpers**

Create `mobile/lib/photos.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/photos.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/photos.ts lib/photos.test.ts
git commit -m "feat(photos): pure helpers — group/cluster/cover/sort

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2.5: Type fix-up note

Tasks 3 and 4 add functions and a `rowToPhoto` mapper to the **same** `lib/photos.ts` file and the same test file. Append; do not rewrite Task 2's exports.

---

### Task 3: `lib/photos.ts` — read paths (`listPhotos`, `signedUrls`)

**Files:**
- Modify: `mobile/lib/photos.ts`
- Test: `mobile/lib/photos.test.ts`

**Interfaces:**
- Consumes: `PhotoRow` (Task 2).
- Produces:
  - `listPhotos(client: SupabaseClient): Promise<PhotoRow[]>` (newest-first)
  - `signedUrls(client: SupabaseClient, paths: string[]): Promise<Record<string, string>>`
  - constant `BUCKET = "trip-photos"`

- [ ] **Step 1: Write the failing tests**

Append to `mobile/lib/photos.test.ts`:

```ts
import { listPhotos, signedUrls } from "./photos";
import type { SupabaseClient } from "@supabase/supabase-js";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/photos.test.ts -t signedUrls`
Expected: FAIL — `signedUrls is not a function`.

- [ ] **Step 3: Implement read paths**

Append to `mobile/lib/photos.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/photos.test.ts`
Expected: PASS (9 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/photos.ts lib/photos.test.ts
git commit -m "feat(photos): listPhotos + signedUrls

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `lib/photos.ts` — mutations (`addPhoto`, `deletePhoto`, `updateCaption`, `reorderPhotos`)

**Files:**
- Modify: `mobile/lib/photos.ts`
- Test: `mobile/lib/photos.test.ts`

**Interfaces:**
- Consumes: `PhotoRow`, `BUCKET`, `nextSortOrder` (earlier tasks).
- Produces:
  - `base64ToBytes(b64: string): Uint8Array`
  - `addPhoto(client, args: { tripId: string; placeId: string; placeName: string; caption: string | null; base64: string }): Promise<void>`
  - `deletePhoto(client, photo: PhotoRow): Promise<void>`
  - `updateCaption(client, id: string, caption: string | null): Promise<void>`
  - `reorderPhotos(client, orderedIds: string[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `mobile/lib/photos.test.ts`:

```ts
import { addPhoto, base64ToBytes } from "./photos";

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
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/photos.test.ts -t addPhoto`
Expected: FAIL — `addPhoto is not a function`.

- [ ] **Step 3: Implement mutations**

Append to `mobile/lib/photos.ts`:

```ts
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

// ponytail: N sequential updates — fine for album-sized lists; batch via RPC if albums get huge.
export async function reorderPhotos(client: SupabaseClient, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await client.from("trip_photos").update({ sort_order: i }).eq("id", orderedIds[i]);
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/photos.test.ts`
Expected: PASS (13 tests total).

- [ ] **Step 5: Commit**

```bash
git add lib/photos.ts lib/photos.test.ts
git commit -m "feat(photos): addPhoto (upload-then-insert) + delete/caption/reorder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `lib/profile.ts` — gallery style

**Files:**
- Modify: `mobile/lib/profile.ts`
- Test: `mobile/lib/profile.test.ts`

**Interfaces:**
- Produces:
  - `type GalleryStyle = "polaroid" | "clean"`
  - `getGalleryStyle(client: SupabaseClient): Promise<GalleryStyle>` (default `"polaroid"`)
  - `setGalleryStyle(client: SupabaseClient, style: GalleryStyle): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Append to `mobile/lib/profile.test.ts`:

```ts
import { getGalleryStyle } from "./profile";
import type { SupabaseClient } from "@supabase/supabase-js";

function styleClient(default_prefs: unknown): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { default_prefs }, error: null }) }) }) }),
  } as unknown as SupabaseClient;
}

test("getGalleryStyle returns stored clean", async () => {
  expect(await getGalleryStyle(styleClient({ galleryStyle: "clean" }))).toBe("clean");
});

test("getGalleryStyle defaults to polaroid when absent", async () => {
  expect(await getGalleryStyle(styleClient({}))).toBe("polaroid");
});

test("getGalleryStyle defaults to polaroid when no user", async () => {
  const client = { auth: { getUser: async () => ({ data: { user: null } }) } } as unknown as SupabaseClient;
  expect(await getGalleryStyle(client)).toBe("polaroid");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/profile.test.ts -t getGalleryStyle`
Expected: FAIL — `getGalleryStyle is not a function`.

- [ ] **Step 3: Implement**

Append to `mobile/lib/profile.ts`:

```ts
export type GalleryStyle = "polaroid" | "clean";

// Stored in default_prefs.galleryStyle. Deliberately bypasses getProfile's
// interests-array guard so a user who hasn't onboarded still has a working toggle.
export async function getGalleryStyle(client: SupabaseClient): Promise<GalleryStyle> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return "polaroid";
  const { data } = await client.from("profiles").select("default_prefs").eq("id", user.id).maybeSingle();
  const style = (data?.default_prefs as { galleryStyle?: string } | null)?.galleryStyle;
  return style === "clean" ? "clean" : "polaroid";
}

export async function setGalleryStyle(client: SupabaseClient, style: GalleryStyle): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { data } = await client.from("profiles").select("default_prefs").eq("id", user.id).maybeSingle();
  const prefs = (data?.default_prefs as Record<string, unknown>) ?? {};
  const { error } = await client.from("profiles").upsert({ id: user.id, default_prefs: { ...prefs, galleryStyle: style } });
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest lib/profile.test.ts`
Expected: PASS (existing profile tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add lib/profile.ts lib/profile.test.ts
git commit -m "feat(profile): galleryStyle get/set in default_prefs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Add `expo-image-picker`

**Files:**
- Modify: `mobile/package.json` (via installer)
- Modify: `mobile/app.json` (permission strings, if not auto-added)

**Interfaces:**
- Produces: `expo-image-picker` available to import.

- [ ] **Step 1: Install the SDK-pinned version**

Run: `npx expo install expo-image-picker`
Expected: adds `expo-image-picker` at the v56-compatible version. (`expo install` picks the version matching the SDK — do not `npm install` a floating version.)

- [ ] **Step 2: Add iOS permission copy**

In `mobile/app.json`, under `expo.ios.infoPlist` (create the keys if absent):

```json
"NSPhotoLibraryUsageDescription": "Add your travel photos to your passport.",
"NSCameraUsageDescription": "Take a photo to add to your passport."
```

If the project uses the `expo-image-picker` config plugin instead, add it to `expo.plugins` per the v56 docs. Verify which by checking whether `app.json` already lists plugins.

- [ ] **Step 3: Verify the type resolves**

Run: `npx tsc --noEmit`
Expected: no new errors (a throwaway `import * as ImagePicker from "expo-image-picker";` resolves).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "build: add expo-image-picker (v56)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: `PhotoStack` + `AlbumSection` components

**Files:**
- Create: `mobile/components/ui/PhotoStack.tsx`
- Create: `mobile/components/ui/AlbumSection.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Consumes: `GalleryStyle` (Task 5).
- Produces:
  - `interface StackPhoto { id: string; url: string; caption?: string | null }`
  - `PhotoStack({ photos: StackPhoto[]; style: GalleryStyle; onPress: () => void })`
  - `AlbumSection({ title: string; photos: StackPhoto[]; style: GalleryStyle; onOpen: () => void })`

- [ ] **Step 1: Create `PhotoStack`**

Create `mobile/components/ui/PhotoStack.tsx`:

```tsx
// mobile/components/ui/PhotoStack.tsx
import { View, Image, Pressable } from "react-native";
import { Text } from "./Text";
import type { GalleryStyle } from "../../lib/profile";

export interface StackPhoto { id: string; url: string; caption?: string | null; }

// Deterministic fan angles so a stack looks the same across renders.
const ANGLES = [-6, 5, -3, 7];

export function PhotoStack({ photos, style, onPress }: {
  photos: StackPhoto[]; style: GalleryStyle; onPress: () => void;
}) {
  const top = photos.slice(0, 4);
  if (top.length === 0) {
    return (
      <Pressable onPress={onPress} className="h-44 items-center justify-center rounded-2xl bg-surface">
        <Text variant="caption">No photos yet — tap to add</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} className="h-44 items-center justify-center">
      {top.map((photo, i) => (
        <View
          key={photo.id}
          style={{ transform: [{ rotate: `${ANGLES[i % ANGLES.length]}deg` }], zIndex: i, elevation: i }}
          className={`absolute rounded-md bg-white shadow-lg ${style === "polaroid" ? "p-2 pb-6" : "p-0.5"}`}
        >
          <Image source={{ uri: photo.url }} className="w-32 h-32 rounded-sm" />
          {style === "polaroid" && photo.caption ? (
            <Text className="text-[10px] text-ink-muted text-center mt-1" numberOfLines={1}>
              {photo.caption}
            </Text>
          ) : null}
        </View>
      ))}
    </Pressable>
  );
}
```

- [ ] **Step 2: Create `AlbumSection`**

Create `mobile/components/ui/AlbumSection.tsx`:

```tsx
// mobile/components/ui/AlbumSection.tsx
import { View } from "react-native";
import { Text } from "./Text";
import { PhotoStack, type StackPhoto } from "./PhotoStack";
import type { GalleryStyle } from "../../lib/profile";

export function AlbumSection({ title, photos, style, onOpen }: {
  title: string; photos: StackPhoto[]; style: GalleryStyle; onOpen: () => void;
}) {
  return (
    <View className="mb-6">
      <View className="flex-row items-baseline justify-between mb-2">
        <Text variant="heading">{title}</Text>
        <Text variant="caption">{photos.length} {photos.length === 1 ? "photo" : "photos"}</Text>
      </View>
      <PhotoStack photos={photos} style={style} onPress={onOpen} />
    </View>
  );
}
```

- [ ] **Step 3: Export from the barrel**

In `mobile/components/ui/index.ts`, add:

```ts
export { PhotoStack, type StackPhoto } from "./PhotoStack";
export { AlbumSection } from "./AlbumSection";
```

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui/PhotoStack.tsx components/ui/AlbumSection.tsx components/ui/index.ts
git commit -m "feat(ui): PhotoStack (polaroid|clean) + AlbumSection

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Passport screen — clustered map + album list

**Files:**
- Modify: `mobile/app/(app)/(tabs)/passport.tsx`

**Interfaces:**
- Consumes: `listPhotos`, `signedUrls`, `groupByAlbum`, `distinctPlaceIds`, `coverPhoto`, `clusterPins`, `Album` (photos lib); `getStopCoords` (`lib/poi`); `getGalleryStyle` (`lib/profile`); `listTrips` (`lib/trips`); `AlbumSection` (ui).
- Produces: the Passport tab UI. Navigates to `/gallery?tripId=...`.

- [ ] **Step 1: Implement the screen**

Replace `mobile/app/(app)/(tabs)/passport.tsx`:

```tsx
// mobile/app/(app)/(tabs)/passport.tsx
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { AppleMaps } from "expo-maps";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { getStopCoords } from "../../../lib/poi";
import { getGalleryStyle } from "../../../lib/profile";
import { listTrips } from "../../../lib/trips";
import {
  listPhotos, signedUrls, groupByAlbum, distinctPlaceIds, coverPhoto, clusterPins,
} from "../../../lib/photos";
import { Screen, Text, Loading, EmptyState, AlbumSection, type StackPhoto } from "../../../components/ui";

// ponytail: one cell size for the small header map. Make it zoom-reactive later if needed.
const CELL_DEG = 0.5;

export default function Passport() {
  const { session } = useAuth();
  const router = useRouter();

  const photosQ = useQuery({ queryKey: ["photos"], queryFn: () => listPhotos(supabase), enabled: !!session });
  const styleQ = useQuery({ queryKey: ["galleryStyle"], queryFn: () => getGalleryStyle(supabase), enabled: !!session });
  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase), enabled: !!session });

  const photos = photosQ.data ?? [];

  const coordsQ = useQuery({
    queryKey: ["photoCoords", distinctPlaceIds(photos)],
    queryFn: () => getStopCoords(supabase, distinctPlaceIds(photos)),
    enabled: photos.length > 0,
  });
  const urlsQ = useQuery({
    queryKey: ["photoUrls", photos.map((p) => p.storagePath)],
    queryFn: () => signedUrls(supabase, photos.map((p) => p.storagePath)),
    enabled: photos.length > 0,
  });

  if (!session) {
    return <Screen><EmptyState title="Passport" subtitle="Sign in to start your travel passport." /></Screen>;
  }
  if (photosQ.isLoading) return <Screen><Loading label="Opening your passport…" /></Screen>;
  if (photos.length === 0) {
    return <Screen><EmptyState title="Passport" subtitle="Add photos from your trips and they'll collect here as albums." /></Screen>;
  }

  const style = styleQ.data ?? "polaroid";
  const urls = urlsQ.data ?? {};
  const coords = coordsQ.data ?? {};
  const tripName = (id: string) => tripsQ.data?.find((t) => t.id === id)?.location ?? "Trip";

  const pins = photos
    .map((p) => ({ id: p.id, ...coords[p.placeId] }))
    .filter((p): p is { id: string; lat: number; lng: number; name: string } => "lat" in p);
  const clusters = clusterPins(pins, CELL_DEG);
  const markers = clusters.map((c) => ({
    id: c.ids[0],
    coordinates: { latitude: c.lat, longitude: c.lng },
    title: c.count > 1 ? `${c.count} photos` : "1 photo",
  }));

  const albums = groupByAlbum(photos);
  const toStack = (album: { photos: typeof photos }): StackPhoto[] =>
    album.photos.map((p) => ({ id: p.id, url: urls[p.storagePath] ?? "", caption: p.caption }));

  return (
    <Screen>
      <Text variant="title" className="mb-3">Passport</Text>
      <View className="h-40 rounded-2xl overflow-hidden mb-6 bg-surface">
        {markers.length > 0 ? (
          <AppleMaps.View
            style={{ flex: 1 }}
            cameraPosition={{ coordinates: markers[0].coordinates, zoom: 4 }}
            markers={markers}
          />
        ) : null}
      </View>
      <ScrollView contentContainerClassName="pb-24">
        {albums.map((album) => {
          const cover = coverPhoto(album.photos);
          return (
            <AlbumSection
              key={album.tripId}
              title={tripName(album.tripId)}
              photos={cover ? [{ id: cover.id, url: urls[cover.storagePath] ?? "", caption: cover.caption }, ...toStack(album).filter((s) => s.id !== cover.id)] : toStack(album)}
              style={style}
              onOpen={() => router.push({ pathname: "/gallery", params: { tripId: album.tripId } })}
            />
          );
        })}
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors. (If `AppleMaps.View` prop names differ from `itinerary.tsx`, copy that file's exact usage — it is the source of truth for the installed `expo-maps`.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/(tabs)/passport.tsx"
git commit -m "feat(passport): clustered map header + per-trip album list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Gallery screen — grid, lightbox, edit (caption / delete / reorder / cover)

**Files:**
- Create: `mobile/app/(app)/gallery.tsx`

**Interfaces:**
- Consumes: `listPhotos`, `signedUrls`, `groupByAlbum`, `deletePhoto`, `updateCaption`, `reorderPhotos` (photos lib); `getGalleryStyle` (profile); `listTrips` (trips).
- Produces: route `/gallery?tripId=...`. Navigates to `/add-photo?tripId=...`.

- [ ] **Step 1: Implement the screen**

Create `mobile/app/(app)/gallery.tsx`:

```tsx
// mobile/app/(app)/gallery.tsx
import { useState } from "react";
import { View, ScrollView, Image, Pressable, Modal, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { listTrips } from "../../lib/trips";
import {
  listPhotos, signedUrls, groupByAlbum, deletePhoto, updateCaption, reorderPhotos,
  type PhotoRow,
} from "../../lib/photos";
import { Screen, Text, Button, Loading, EmptyState } from "../../components/ui";

export default function Gallery() {
  const router = useRouter();
  const qc = useQueryClient();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [editing, setEditing] = useState(false);
  const [lightbox, setLightbox] = useState<PhotoRow | null>(null);

  const photosQ = useQuery({ queryKey: ["photos"], queryFn: () => listPhotos(supabase) });
  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase) });
  const all = photosQ.data ?? [];
  const album = groupByAlbum(all).find((a) => a.tripId === tripId);
  const photos = album?.photos ?? [];

  const urlsQ = useQuery({
    queryKey: ["photoUrls", photos.map((p) => p.storagePath)],
    queryFn: () => signedUrls(supabase, photos.map((p) => p.storagePath)),
    enabled: photos.length > 0,
  });
  const urls = urlsQ.data ?? {};
  const title = tripsQ.data?.find((t) => t.id === tripId)?.location ?? "Album";
  const refresh = () => qc.invalidateQueries({ queryKey: ["photos"] });

  async function move(index: number, dir: -1 | 1) {
    const ids = photos.map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await reorderPhotos(supabase, ids);
    refresh();
  }
  async function makeCover(index: number) {
    const ids = photos.map((p) => p.id);
    const [picked] = ids.splice(index, 1);
    await reorderPhotos(supabase, [picked, ...ids]);
    refresh();
  }
  async function remove(photo: PhotoRow) {
    await deletePhoto(supabase, photo);
    setLightbox(null);
    refresh();
  }
  async function saveCaption(photo: PhotoRow, caption: string) {
    await updateCaption(supabase, photo.id, caption || null);
    refresh();
  }

  if (photosQ.isLoading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
          <Text variant="title">{title}</Text>
        </View>
        <Button title={editing ? "Done" : "Edit"} variant="ghost" size="sm" onPress={() => setEditing((e) => !e)} />
      </View>

      {photos.length === 0 ? (
        <EmptyState title="No photos yet" subtitle="Add your first one from this trip."
          action={<Button title="Add photo" onPress={() => router.push({ pathname: "/add-photo", params: { tripId } })} />} />
      ) : (
        <ScrollView contentContainerClassName="flex-row flex-wrap gap-2 pb-24">
          {photos.map((photo, i) => (
            <View key={photo.id} className="w-[31%]">
              <Pressable onPress={() => setLightbox(photo)}>
                <Image source={{ uri: urls[photo.storagePath] }} className="w-full aspect-square rounded-lg bg-surface" />
              </Pressable>
              {editing ? (
                <View className="flex-row justify-between mt-1">
                  <Button title="↑" variant="ghost" size="sm" onPress={() => move(i, -1)} />
                  <Button title="★" variant="ghost" size="sm" onPress={() => makeCover(i)} />
                  <Button title="↓" variant="ghost" size="sm" onPress={() => move(i, 1)} />
                </View>
              ) : photo.caption ? (
                <Text variant="caption" numberOfLines={1} className="mt-1">{photo.caption}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {photos.length > 0 ? (
        <View className="absolute left-6 right-6 bottom-6">
          <Button title="Add photo" onPress={() => router.push({ pathname: "/add-photo", params: { tripId } })} />
        </View>
      ) : null}

      <Lightbox photo={lightbox} url={lightbox ? urls[lightbox.storagePath] : undefined}
        onClose={() => setLightbox(null)} onDelete={remove} onSaveCaption={saveCaption} />
    </Screen>
  );
}

function Lightbox({ photo, url, onClose, onDelete, onSaveCaption }: {
  photo: PhotoRow | null; url?: string; onClose: () => void;
  onDelete: (p: PhotoRow) => void; onSaveCaption: (p: PhotoRow, c: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Modal visible={!!photo} transparent animationType="fade" onShow={() => setDraft(photo?.caption ?? "")}>
      <View className="flex-1 bg-black/90 justify-center p-6">
        {photo ? (
          <>
            <Image source={{ uri: url }} className="w-full aspect-square rounded-xl" resizeMode="contain" />
            <TextInput
              value={draft} onChangeText={setDraft} placeholder="Add a caption…" placeholderTextColor="#9b8b92"
              className="text-white border-b border-white/30 mt-4 py-2"
              onBlur={() => onSaveCaption(photo, draft)}
            />
            <View className="flex-row justify-between mt-6">
              <Button title="Delete" variant="secondary" onPress={() => onDelete(photo)} />
              <Button title="Close" onPress={onClose} />
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `Button` accepts `size="sm"` and `variant="ghost"` — both are used in `account.tsx`/`index.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/gallery.tsx"
git commit -m "feat(gallery): album grid + lightbox + edit (caption/delete/reorder/cover)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Add-photo screen — trip → landmark → pick → caption → upload

**Files:**
- Create: `mobile/app/(app)/add-photo.tsx`

**Interfaces:**
- Consumes: `listTrips`, `getTrip` (trips); landmarks come from `trip.itinerary.days[].stops` (filter `placeId` set, `kind !== "meal-gap"`); `addPhoto` (photos); `expo-image-picker`.
- Produces: route `/add-photo?tripId?=...`. On success: `router.back()` and invalidate `["photos"]`.

- [ ] **Step 1: Implement the screen**

Create `mobile/app/(app)/add-photo.tsx`:

```tsx
// mobile/app/(app)/add-photo.tsx
import { useState } from "react";
import { View, ScrollView, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import { listTrips, getTrip } from "../../lib/trips";
import { addPhoto } from "../../lib/photos";
import { Screen, Text, Button, Card, Input, ListRow, Loading } from "../../components/ui";

interface Picked { uri: string; base64: string; }

export default function AddPhoto() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const [tripId, setTripId] = useState<string | undefined>(params.tripId);
  const [stop, setStop] = useState<{ placeId: string; name: string } | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase) });
  const tripQ = useQuery({ queryKey: ["trip", tripId], queryFn: () => getTrip(supabase, tripId!), enabled: !!tripId });

  const stops = (tripQ.data?.itinerary.days ?? [])
    .flatMap((d) => d.stops)
    .filter((s) => s.placeId && s.kind !== "meal-gap");

  async function pick(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    if (!res.canceled && res.assets[0]?.base64) {
      setPicked({ uri: res.assets[0].uri, base64: res.assets[0].base64 });
    }
  }

  async function save() {
    if (!tripId || !stop || !picked) return;
    setBusy(true);
    try {
      await addPhoto(supabase, {
        tripId, placeId: stop.placeId, placeName: stop.name,
        caption: caption || null, base64: picked.base64,
      });
      qc.invalidateQueries({ queryKey: ["photos"] });
      router.back();
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <Screen><Loading label="Uploading…" /></Screen>;

  return (
    <Screen>
      <View className="flex-row items-center gap-2 mb-4">
        <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <Text variant="title">Add photo</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 pb-24">
        {!tripId ? (
          <>
            <Text variant="heading">Which trip?</Text>
            {(tripsQ.data ?? []).map((t) => (
              <ListRow key={t.id} title={t.location} onPress={() => setTripId(t.id)} />
            ))}
          </>
        ) : !stop ? (
          tripQ.isLoading ? <Loading /> : (
            <>
              <Text variant="heading">Which landmark?</Text>
              {stops.map((s) => (
                <ListRow key={s.placeId} title={s.name} onPress={() => setStop({ placeId: s.placeId, name: s.name })} />
              ))}
            </>
          )
        ) : (
          <>
            <Card className="gap-1">
              <Text variant="caption">Landmark</Text>
              <Text variant="heading">{stop.name}</Text>
            </Card>
            {picked ? <Image source={{ uri: picked.uri }} className="w-full aspect-square rounded-xl" /> : null}
            <View className="flex-row gap-3">
              <View className="flex-1"><Button title="Camera" variant="secondary" onPress={() => pick(true)} /></View>
              <View className="flex-1"><Button title="Library" variant="secondary" onPress={() => pick(false)} /></View>
            </View>
            <Input placeholder="Caption (optional)" value={caption} onChangeText={setCaption} />
            <Button title="Save to passport" onPress={save} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirm `Input` and `ListRow` prop names against `components/ui/Input.tsx` and `ListRow.tsx`; adjust `title`/`onPress`/`value`/`onChangeText` if those components use different names.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/add-photo.tsx"
git commit -m "feat(add-photo): trip → landmark → pick → caption → upload

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Gallery-style toggle in Account

**Files:**
- Modify: `mobile/app/(app)/account.tsx`

**Interfaces:**
- Consumes: `getGalleryStyle`, `setGalleryStyle` (profile).

- [ ] **Step 1: Add the toggle**

In `mobile/app/(app)/account.tsx`, add imports and a settings card. Insert after the "Signed in as" `Card`:

```tsx
// add to imports:
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { getGalleryStyle, setGalleryStyle, type GalleryStyle } from "../../lib/profile";
import { Pressable } from "react-native";
```

```tsx
// inside the component body, before the return:
const qc = useQueryClient();
const styleQ = useQuery({ queryKey: ["galleryStyle"], queryFn: () => getGalleryStyle(supabase) });
async function choose(style: GalleryStyle) {
  await setGalleryStyle(supabase, style);
  qc.invalidateQueries({ queryKey: ["galleryStyle"] });
}
```

```tsx
// insert this Card after the "Signed in as" Card:
<Card className="gap-2 mt-4">
  <Text variant="caption">Passport gallery style</Text>
  <View className="flex-row gap-2">
    {(["polaroid", "clean"] as GalleryStyle[]).map((s) => {
      const active = (styleQ.data ?? "polaroid") === s;
      return (
        <Pressable key={s} onPress={() => choose(s)}
          className={`px-4 py-2 rounded-pill ${active ? "bg-accent" : "bg-surface"}`}>
          <Text className={active ? "text-white" : "text-ink"}>{s === "polaroid" ? "Polaroid" : "Clean"}</Text>
        </Pressable>
      );
    })}
  </View>
</Card>
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/account.tsx"
git commit -m "feat(account): polaroid/clean gallery-style toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Trip-card cover from first photo

**Files:**
- Modify: `mobile/components/ui/TripCard.tsx`
- Modify: `mobile/app/(app)/(tabs)/index.tsx` (pass a cover URL in)

**Interfaces:**
- Consumes: `coverPhoto` (photos), `signedUrls` (photos).
- Produces: `TripCard` accepts an optional `coverUrl?: string`.

- [ ] **Step 1: Accept a cover URL in `TripCard`**

In `mobile/components/ui/TripCard.tsx`, change the signature and cover block:

```tsx
import { View, Image } from "react-native";
// ...
export function TripCard({ trip, coverUrl, onPress }: { trip: TripSummary; coverUrl?: string; onPress: () => void }) {
  const days = tripDayCount(trip);
  const initial = trip.location.trim().charAt(0).toUpperCase() || "?";
  return (
    <Card onPress={onPress} className="overflow-hidden">
      <View className="h-28 -mx-4 -mt-4 mb-3 bg-accent-soft items-center justify-center">
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} className="w-full h-full" />
        ) : (
          <Text className="text-[64px] leading-[64px] font-jakarta-extrabold text-accent opacity-30">{initial}</Text>
        )}
      </View>
      <Text variant="heading">{trip.location}</Text>
      <Text variant="caption">{days === 1 ? "1-day trip" : `${days}-day trip`}</Text>
    </Card>
  );
}
```

- [ ] **Step 2: Feed cover URLs from the Trips screen**

In `mobile/app/(app)/(tabs)/index.tsx`, add a photos + signed-URL query and compute per-trip covers. Add imports:

```tsx
import { listPhotos, signedUrls, groupByAlbum, coverPhoto } from "../../../lib/photos";
```

After the `trips` query, add:

```tsx
const photosQ = useQuery({ queryKey: ["photos"], queryFn: () => listPhotos(supabase), enabled: !!session });
const covers = groupByAlbum(photosQ.data ?? [])
  .map((a) => coverPhoto(a.photos))
  .filter((p): p is NonNullable<typeof p> => !!p);
const coverUrlsQ = useQuery({
  queryKey: ["coverUrls", covers.map((c) => c.storagePath)],
  queryFn: () => signedUrls(supabase, covers.map((c) => c.storagePath)),
  enabled: covers.length > 0,
});
const coverFor = (tripId: string) => {
  const cover = covers.find((c) => c.tripId === tripId);
  return cover ? coverUrlsQ.data?.[cover.storagePath] : undefined;
};
```

Then update the `renderItem` `TripCard`:

```tsx
renderItem={({ item }) => (
  <TripCard trip={item} coverUrl={coverFor(item.id)}
    onPress={() => router.push({ pathname: "/itinerary", params: { tripId: item.id } })} />
)}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Full test + type sweep**

Run: `npx jest && npx tsc --noEmit`
Expected: all jest suites pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui/TripCard.tsx "app/(app)/(tabs)/index.tsx"
git commit -m "feat(trips): use first passport photo as trip-card cover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `npx jest` — all `lib` suites green (photos: 13, profile: +3, existing unchanged).
- [ ] `npx tsc --noEmit` — clean.
- [ ] Migration `0003` applied (local `supabase db reset` or dashboard/CI).
- [ ] Device/EAS smoke (new native module `expo-image-picker` requires a fresh dev/EAS build — not OTA-able):
  - Add a photo from a saved trip → appears in Passport as an album stack.
  - Map header shows a pin (or a clustered count) for the landmark.
  - Open album → grid, lightbox, caption edit, delete, reorder up/down, set-cover.
  - Toggle polaroid/clean in Account → stacks re-render.
  - Trips tab card shows the photo as its cover.

## Notes for the implementer

- **`expo-maps` API:** `itinerary.tsx` is the source of truth for the installed `AppleMaps` prop shape (`cameraPosition`, `markers`). If Task 8's usage mismatches, copy from there.
- **UI prop names:** `Button` (`title`/`variant`/`size`/`onPress`), `Input`, `ListRow`, `Card` — confirm against each file in `components/ui/` before relying on a prop; adjust the call sites if names differ.
- **Drag-reorder** is intentionally deferred (see Global Constraints). The up/down + set-cover controls satisfy the reorder requirement with zero new dependency and the same `reorderPhotos` data path; a later task can layer drag on top without schema changes.
