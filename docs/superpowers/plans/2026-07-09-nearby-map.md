# Nearby Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the Trips screen, open a full-screen map centered on the user's GPS location showing nearby attractions; tapping one opens a place-detail screen.

**Architecture:** A `nearby-attractions` edge fn reuses `fetchPois` (with a `textQuery` override) to return location-biased attractions. A new `nearby.tsx` screen uses `expo-location` for permission + GPS, renders `AppleMaps.View` + a list, and routes taps to `poi-detail.tsx` (currently a stub — this plan builds it from `cached_pois` data). A compact entry button lives on the Trips tab.

**Tech Stack:** Deno edge fns, Expo RN + NativeWind, `expo-location` (NEW native dep), `expo-maps` (already a dep), `@tanstack/react-query`.

## Global Constraints

- v1 result action is **view detail only** — no add-to-trip, directions, or interest/diet filtering.
- `expo-location` is a NEW native dependency → a NEW EAS build is required before device smoke; OTA cannot deliver it.
- Default search radius: `NEARBY_RADIUS_KM = 5`.
- No new tab — entry is a button on the Trips screen.
- Reuse `fetchPois` via an optional `textQuery` override; do not duplicate the Places mapping/region-filter code.
- `poi-detail` v1 shows name, rating, price, address, a mini map, and an "Open in Maps" link sourced from `cached_pois.payload`. Photos are out of scope v1 (not stored).
- Backend tests `deno test <path>`; mobile tests `cd mobile && npm test`.
- Expo SDK 56 — verify APIs at https://docs.expo.dev/versions/v56.0.0/ before coding.

---

## File Structure

- `supabase/_shared/places.ts` — MODIFY: optional `textQuery` override on `fetchPois`.
- `supabase/_shared/places_test.ts` — MODIFY: override test.
- `supabase/functions/nearby-attractions/handler.ts` — CREATE.
- `supabase/functions/nearby-attractions/handler_test.ts` — CREATE.
- `supabase/functions/nearby-attractions/index.ts` — CREATE.
- `mobile/lib/nearbyClient.ts` — CREATE: calls the edge fn.
- `mobile/lib/nearbyClient.test.ts` — CREATE.
- `mobile/lib/placeDetail.ts` — CREATE: read a POI from `cached_pois`.
- `mobile/lib/placeDetail.test.ts` — CREATE.
- `mobile/app/(app)/nearby.tsx` — CREATE.
- `mobile/app/(app)/poi-detail.tsx` — REPLACE stub with real detail.
- `mobile/app/(app)/(tabs)/index.tsx` — MODIFY: entry button.
- `mobile/app.json` (or `app.config.*`) — MODIFY: `expo-location` plugin + iOS usage string.
- `mobile/package.json` — MODIFY: add `expo-location`.

---

### Task 1: `textQuery` override on `fetchPois`

**Files:**
- Modify: `supabase/_shared/places.ts`
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Produces: `fetchPois` accepts optional `textQuery?: string`; when set it is used verbatim as the request `textQuery` (bypassing the kind/diet query builders). All existing behavior unchanged when absent.

- [ ] **Step 1: Write failing test**

```ts
Deno.test("fetchPois honors an explicit textQuery override", async () => {
  let sent = "";
  const fn: HttpFetch = (_u, init) => {
    sent = JSON.parse(String(init?.body)).textQuery;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ places: [] }) } as Response);
  };
  await fetchPois({ location: "ignored", kind: "attraction", prefs: basePrefs, httpFetch: fn, apiKey: "k", textQuery: "tourist attractions" });
  assertEquals(sent, "tourist attractions");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `deno test supabase/_shared/places_test.ts`
Expected: FAIL — override ignored.

- [ ] **Step 3: Implement**

Add `textQuery?: string` to the `fetchPois` opts type, and in the body-building code:

```ts
const textQuery = opts.textQuery
  ?? (opts.kind === "food" ? foodTextQuery(location, dietTerms) : `${TYPE_QUERY[opts.kind]} in ${location}`);
const body: Record<string, unknown> = { textQuery, maxResultCount: 20 };
```

(If Task 1 of the dietary plan has not landed, use `${TYPE_QUERY[opts.kind]} in ${location}` for the non-override branch.)

- [ ] **Step 4: Run, verify pass**

Run: `deno test supabase/_shared/places_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat(places): optional textQuery override on fetchPois"
```

---

### Task 2: `nearby-attractions` edge function

**Files:**
- Create: `supabase/functions/nearby-attractions/handler.ts`
- Test: `supabase/functions/nearby-attractions/handler_test.ts`
- Create: `supabase/functions/nearby-attractions/index.ts`

**Interfaces:**
- Produces: `handleNearby(body, deps): Promise<{status, body}>` where
  `body = { lat?: number; lng?: number; radiusKm?: number }`,
  `NearbyDeps = { fetchNearby(opts: { lat: number; lng: number; radiusKm: number }): Promise<Poi[]> }`,
  response `body = { pois: Poi[] }`.

- [ ] **Step 1: Write failing tests**

```ts
import { assertEquals } from "jsr:@std/assert";
import { handleNearby, type NearbyDeps } from "./handler.ts";
import type { Poi } from "../../_shared/types.ts";

const pois: Poi[] = [{ placeId: "a", name: "A", kind: "attraction", lat: 1, lng: 2 }];
const deps: NearbyDeps = { fetchNearby: () => Promise.resolve(pois) };

Deno.test("400 on missing/invalid coords", async () => {
  assertEquals((await handleNearby({}, deps)).status, 400);
  assertEquals((await handleNearby({ lat: 1 }, deps)).status, 400);
  assertEquals((await handleNearby({ lat: 999, lng: 0 }, deps)).status, 400);
});

Deno.test("200 returns pois; default radius applied", async () => {
  let usedRadius = 0;
  const spy: NearbyDeps = { fetchNearby: (o) => { usedRadius = o.radiusKm; return Promise.resolve(pois); } };
  const r = await handleNearby({ lat: 10, lng: 20 }, spy);
  assertEquals(r.status, 200);
  assertEquals((r.body as { pois: Poi[] }).pois, pois);
  assertEquals(usedRadius, 5);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `deno test supabase/functions/nearby-attractions/handler_test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `handler.ts`**

```ts
// supabase/functions/nearby-attractions/handler.ts
import type { Poi } from "../../_shared/types.ts";

export const NEARBY_RADIUS_KM = 5;

export interface NearbyDeps {
  fetchNearby(opts: { lat: number; lng: number; radiusKm: number }): Promise<Poi[]>;
}

const valid = (n: unknown, max: number): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max;

export async function handleNearby(
  body: { lat?: number; lng?: number; radiusKm?: number },
  deps: NearbyDeps,
): Promise<{ status: number; body: unknown }> {
  if (!valid(body.lat, 90) || !valid(body.lng, 180)) {
    return { status: 400, body: { error: "valid lat/lng required" } };
  }
  const radiusKm = valid(body.radiusKm, 500) && body.radiusKm! > 0 ? body.radiusKm! : NEARBY_RADIUS_KM;
  const pois = await deps.fetchNearby({ lat: body.lat!, lng: body.lng!, radiusKm });
  return { status: 200, body: { pois } };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `deno test supabase/functions/nearby-attractions/handler_test.ts`
Expected: PASS.

- [ ] **Step 5: Write `index.ts`**

```ts
// supabase/functions/nearby-attractions/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleNearby, type NearbyDeps } from "./handler.ts";
import { fetchPois } from "../../_shared/places.ts";
import type { Prefs } from "../../_shared/types.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NEARBY_PREFS: Prefs = { interests: [], budget: "high", pace: "balanced", transport: "balanced" };

Deno.serve(async (req: Request) => {
  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json() as { lat?: number; lng?: number; radiusKm?: number };

  const deps: NearbyDeps = {
    fetchNearby: ({ lat, lng, radiusKm }) =>
      fetchPois({
        location: "", kind: "attraction", prefs: NEARBY_PREFS,
        textQuery: "tourist attractions", locationBias: { center: { lat, lng }, radiusKm },
        httpFetch: fetch, apiKey: PLACES_KEY,
        cache: { write: async (pois) => { await admin.from("cached_pois").upsert(pois.map((p) => ({ place_id: p.placeId, payload: p, fetched_at: new Date().toISOString() }))); } },
      }),
  };

  try {
    const r = await handleNearby(body, deps);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("nearby-attractions failed:", e instanceof Error ? e.stack ?? e.message : e);
    return new Response(JSON.stringify({ error: "nearby failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
```

(Caching to `cached_pois` here means `poi-detail` can read every nearby result.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/nearby-attractions/
git commit -m "feat(nearby): nearby-attractions edge fn"
```

---

### Task 3: Mobile nearby client

**Files:**
- Create: `mobile/lib/nearbyClient.ts`
- Test: `mobile/lib/nearbyClient.test.ts`

**Interfaces:**
- Consumes: `Poi` from `./types`.
- Produces: `fetchNearbyAttractions(opts: { lat: number; lng: number; accessToken: string; baseUrl: string; radiusKm?: number; fetchImpl?: typeof fetch }): Promise<Poi[]>` — throws on non-OK.

- [ ] **Step 1: Write failing test**

```ts
import { fetchNearbyAttractions } from "./nearbyClient";

test("posts coords and returns pois", async () => {
  const pois = [{ placeId: "a", name: "A", kind: "attraction", lat: 1, lng: 2 }];
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ pois }) }) as never;
  const out = await fetchNearbyAttractions({ lat: 1, lng: 2, accessToken: "t", baseUrl: "http://x", fetchImpl });
  expect(out).toEqual(pois);
  const body = JSON.parse((fetchImpl as jest.Mock).mock.calls[0][1].body);
  expect(body).toEqual({ lat: 1, lng: 2, radiusKm: 5 });
});

test("throws on non-OK", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
  await expect(fetchNearbyAttractions({ lat: 1, lng: 2, accessToken: "t", baseUrl: "http://x", fetchImpl })).rejects.toThrow();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- nearbyClient`
Expected: FAIL.

- [ ] **Step 3: Implement `nearbyClient.ts`**

```ts
// mobile/lib/nearbyClient.ts
import type { Poi } from "./types";

export async function fetchNearbyAttractions(opts: {
  lat: number; lng: number; accessToken: string; baseUrl: string; radiusKm?: number; fetchImpl?: typeof fetch;
}): Promise<Poi[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/nearby-attractions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.accessToken}` },
    body: JSON.stringify({ lat: opts.lat, lng: opts.lng, radiusKm: opts.radiusKm ?? 5 }),
  });
  if (!res.ok) throw new Error(`nearby failed (${res.status})`);
  const data = await res.json() as { pois?: Poi[] };
  return data.pois ?? [];
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- nearbyClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/nearbyClient.ts mobile/lib/nearbyClient.test.ts
git commit -m "feat(nearby): fetchNearbyAttractions client"
```

---

### Task 4: Place-detail data reader + screen

**Files:**
- Create: `mobile/lib/placeDetail.ts`
- Test: `mobile/lib/placeDetail.test.ts`
- Replace: `mobile/app/(app)/poi-detail.tsx`

**Interfaces:**
- Consumes: `Poi` from `./types`; `cached_pois` table (`place_id`, `payload` = full `Poi`).
- Produces: `getPlaceDetail(client, placeId): Promise<Poi | null>`; a `PoiDetail` screen reading `?placeId=`.

- [ ] **Step 1: Write failing test**

```ts
import { getPlaceDetail } from "./placeDetail";

test("returns the cached Poi payload", async () => {
  const payload = { placeId: "a", name: "A", kind: "attraction", lat: 1, lng: 2, rating: 4.5, address: "X St" };
  const maybeSingle = jest.fn().mockResolvedValue({ data: { payload }, error: null });
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const client = { from: jest.fn().mockReturnValue({ select }) } as never;
  expect(await getPlaceDetail(client, "a")).toEqual(payload);
  expect(select).toHaveBeenCalledWith("payload");
  expect(eq).toHaveBeenCalledWith("place_id", "a");
});

test("returns null when absent", async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) } as never;
  expect(await getPlaceDetail(client, "z")).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- placeDetail`
Expected: FAIL.

- [ ] **Step 3: Implement `placeDetail.ts`**

```ts
// mobile/lib/placeDetail.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Poi } from "./types";

export async function getPlaceDetail(client: SupabaseClient, placeId: string): Promise<Poi | null> {
  const { data, error } = await client.from("cached_pois").select("payload").eq("place_id", placeId).maybeSingle();
  if (error) throw error;
  return data ? (data.payload as Poi) : null;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- placeDetail`
Expected: PASS.

- [ ] **Step 5: Build the `poi-detail.tsx` screen**

Replace the stub. Reads `placeId`, loads via `getPlaceDetail`, renders name / rating / price / address, a mini `AppleMaps.View`, and an "Open in Maps" link (`Linking.openURL`). Loading + not-found states.

```tsx
// mobile/app/(app)/poi-detail.tsx
import { View, Linking } from "react-native";
import { AppleMaps } from "expo-maps";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { getPlaceDetail } from "../../lib/placeDetail";
import { Screen, Text, Button, Card, EmptyState, Loading, Icon } from "../../components/ui";

export default function PoiDetail() {
  const router = useRouter();
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const { data: poi, isLoading } = useQuery({
    queryKey: ["poi", placeId],
    queryFn: () => getPlaceDetail(supabase, placeId as string),
    enabled: !!placeId,
  });

  if (isLoading) return <Screen><Loading label="Loading place…" /></Screen>;
  if (!poi) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="location" size={28} color="#6B5560" />} title="Place unavailable" subtitle="No cached details for this spot." action={<Button title="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const price = poi.priceLevel != null ? "$".repeat(Math.max(1, poi.priceLevel)) : null;
  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={8}><Text variant="label" className="text-ink-muted">‹ Back</Text></Pressable>
      <View className="gap-2 mt-2">
        <Text variant="display">{poi.name}</Text>
        <View className="flex-row gap-3">
          {poi.rating != null ? <Text variant="caption">★ {poi.rating.toFixed(1)}</Text> : null}
          {price ? <Text variant="caption">{price}</Text> : null}
        </View>
        {poi.address ? <Text variant="body" className="text-ink-muted">{poi.address}</Text> : null}
      </View>
      <View className="flex-1 rounded-xl overflow-hidden my-4">
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={{ coordinates: { latitude: poi.lat, longitude: poi.lng }, zoom: 14 }}
          markers={[{ id: poi.placeId, coordinates: { latitude: poi.lat, longitude: poi.lng }, title: poi.name }]}
        />
      </View>
      <Button title="Open in Maps" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}&query_place_id=${poi.placeId}`)} />
    </Screen>
  );
}
```

Add the missing `Pressable` import from `react-native`.

- [ ] **Step 6: Typecheck + commit**

Run: `cd mobile && npx tsc --noEmit`
```bash
git add mobile/lib/placeDetail.ts mobile/lib/placeDetail.test.ts "mobile/app/(app)/poi-detail.tsx"
git commit -m "feat(nearby): poi-detail screen from cached_pois"
```

---

### Task 5: Add `expo-location` dependency + config

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json` (or `app.config.*` if that's what the project uses)

**Interfaces:** none (native config only).

- [ ] **Step 1: Install**

Run: `cd mobile && npx expo install expo-location`
Expected: `expo-location` added to `package.json` at an SDK-56-compatible version.

- [ ] **Step 2: Configure the plugin + iOS usage string**

In `app.json` `expo.plugins`, add:

```json
["expo-location", { "locationWhenInUsePermission": "Show attractions near your current location." }]
```

Confirm the exact plugin option name against https://docs.expo.dev/versions/v56.0.0/sdk/location/ before committing.

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/app.json
git commit -m "chore(nearby): add expo-location dependency and permission config"
```

---

### Task 6: Nearby screen

**Files:**
- Create: `mobile/app/(app)/nearby.tsx`

**Interfaces:**
- Consumes: `expo-location`, `expo-maps` `AppleMaps`, `fetchNearbyAttractions` (Task 3), `useAuth`, existing `components/ui`.

- [ ] **Step 1: Build the screen**

```tsx
// mobile/app/(app)/nearby.tsx
import { useEffect, useState } from "react";
import { View, ScrollView, Pressable, Linking } from "react-native";
import * as Location from "expo-location";
import { AppleMaps } from "expo-maps";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { fetchNearbyAttractions } from "../../lib/nearbyClient";
import type { Poi } from "../../lib/types";
import { Screen, Text, Button, Card, EmptyState, Loading, Icon } from "../../components/ui";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string };

type State =
  | { kind: "loading" }
  | { kind: "denied" }
  | { kind: "error" }
  | { kind: "ready"; center: { lat: number; lng: number }; pois: Poi[] };

export default function Nearby() {
  const router = useRouter();
  const { session } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!active) return;
      if (status !== "granted") { setState({ kind: "denied" }); return; }
      try {
        const pos = await Location.getCurrentPositionAsync({});
        const center = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const token = session?.access_token;
        if (!token) { setState({ kind: "error" }); return; }
        const pois = await fetchNearbyAttractions({ ...center, accessToken: token, baseUrl: extra.supabaseUrl });
        if (active) setState({ kind: "ready", center, pois });
      } catch {
        if (active) setState({ kind: "error" });
      }
    })();
    return () => { active = false; };
  }, [session]);

  if (state.kind === "loading") return <Screen><Loading label="Finding what's around you…" /></Screen>;
  if (state.kind === "denied") {
    return (
      <Screen>
        <EmptyState icon={<Icon name="location" size={28} color="#6B5560" />} title="Location off" subtitle="Enable location to see nearby attractions."
          action={<Button title="Open Settings" onPress={() => Linking.openSettings()} />} />
        <Pressable onPress={() => router.back()} hitSlop={8} className="items-center mt-3"><Text variant="label" className="text-ink-muted">Back</Text></Pressable>
      </Screen>
    );
  }
  if (state.kind === "error") {
    return <Screen><EmptyState title="Couldn't load nearby spots" subtitle="Check your connection and try again." action={<Button title="Back" onPress={() => router.back()} />} /></Screen>;
  }

  const markers = state.pois.map((p) => ({ id: p.placeId, coordinates: { latitude: p.lat, longitude: p.lng }, title: p.name }));
  return (
    <Screen>
      <View className="flex-row items-center justify-between mb-2">
        <Pressable onPress={() => router.back()} hitSlop={8}><Text variant="label" className="text-ink-muted">‹ Back</Text></Pressable>
        <Text variant="heading">Near you</Text>
        <View style={{ width: 44 }} />
      </View>
      <View className="h-72 rounded-xl overflow-hidden mb-3">
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={{ coordinates: { latitude: state.center.lat, longitude: state.center.lng }, zoom: 13 }}
          markers={markers}
        />
      </View>
      {state.pois.length === 0 ? (
        <EmptyState title="Nothing close by" subtitle="Try again from a busier area." />
      ) : (
        <ScrollView contentContainerClassName="gap-3 pb-4">
          {state.pois.map((p) => (
            <Pressable key={p.placeId} onPress={() => router.push({ pathname: "/poi-detail", params: { placeId: p.placeId } })}>
              <Card className="gap-1">
                <Text variant="heading">{p.name}</Text>
                <View className="flex-row gap-3">
                  {p.rating != null ? <Text variant="caption">★ {p.rating.toFixed(1)}</Text> : null}
                  {p.address ? <Text variant="caption" className="shrink">{p.address}</Text> : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
```

Verify `router.push` typed-route syntax matches the project (memory notes a typedRoutes gotcha — check an existing `router.push({ pathname, params })` call, e.g. in `discover.tsx`).

- [ ] **Step 2: Typecheck + commit**

Run: `cd mobile && npx tsc --noEmit`
```bash
git add "mobile/app/(app)/nearby.tsx"
git commit -m "feat(nearby): nearby attractions map screen"
```

---

### Task 7: Trips entry button

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`

- [ ] **Step 1: Add the entry button**

Add a compact card/button near the top of the Trips screen that routes to `/nearby`:

```tsx
<Pressable onPress={() => router.push("/nearby")}>
  <Card className="flex-row items-center gap-3">
    <Icon name="location" size={22} color="#E11D48" />
    <View className="flex-1">
      <Text variant="heading">Explore near me</Text>
      <Text variant="caption">Attractions around your current spot</Text>
    </View>
    <Icon name="chevron-forward" size={18} color="#6B5560" />
  </Card>
</Pressable>
```

Confirm `router` is in scope (use `useRouter()` if not already) and `Icon`/`Card` are imported. Verify the `Icon` names against `components/ui/Icon.tsx`.

- [ ] **Step 2: Typecheck + manual verify**

Run: `cd mobile && npx tsc --noEmit`
Manual (after EAS build): button appears on Trips → opens `/nearby` → permission prompt → map + list of nearby attractions → tap → `poi-detail`.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/(tabs)/index.tsx"
git commit -m "feat(nearby): Trips entry point for Explore near me"
```

---

## Deploy + build (after all tasks green)

- [ ] `supabase functions deploy nearby-attractions`
- [ ] Full suites: `deno test supabase/` and `cd mobile && npm test && npx tsc --noEmit`
- [ ] **NEW EAS build** (expo-location native dep) → device smoke: permission grant/deny paths, real GPS returns nearby spots, marker/list tap opens `poi-detail`, "Open in Maps" launches.

---

## Self-Review

- **Spec coverage:** entry button on Trips (Task 7), full-screen map + list (Task 6), `nearby-attractions` reusing `fetchPois` (Tasks 1,2), `expo-location` perms + config + new-build note (Tasks 5,6), view-detail via `poi-detail` — built here since it was a stub (Task 4), permission-denied / no-results / error states (Task 6). ✓
- **Placeholder scan:** none. Deliberate verification-not-guess flags: exact `expo-location` plugin option name (Task 5), typed-route `router.push` shape (Task 6), `Icon` names (Tasks 6,7) — each says "confirm against existing code" rather than assuming.
- **Type consistency:** `Poi` used end-to-end (edge fn → `nearbyClient` → screen → `poi-detail`); `fetchNearbyAttractions` returns `Poi[]` matching Task 6 consumption; `getPlaceDetail` returns `Poi | null` matching the screen guard; `radiusKm` default `5` consistent across handler `NEARBY_RADIUS_KM`, client default, and test. ✓
- **v1 scope honored:** no add-to-trip/directions/filter; photos deferred (not stored). ✓
