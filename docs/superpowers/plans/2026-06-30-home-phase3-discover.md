# Home Phase 3 — Discover + Saved + Surprise — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Discover tab (curated destination ideas + a saved-places wishlist), a real `poi-detail` screen with a save toggle, and a "Surprise Me" feature that drops the user at a random real place on Earth.

**Architecture:** A new `saved_pois` table + `lib/savedPois.ts` back a heart/save action used by both `poi-detail` and `surprise`. Discover seeds onboarding by resolving a curated country name → `suggest-regions` → region → existing `tripFlow.prepare` path. Surprise Me is an edge function (`surprise-place`) that picks a random land coordinate and runs a Google Places Nearby Search server-side (keeping the Places key off-device), with the random-coordinate and retry logic in deno-tested `_shared/` modules.

**Tech Stack:** Expo Router + React Native, NativeWind design system (`components/ui`), TanStack react-query, Supabase (Postgres + RLS + Edge Functions on Deno), Google Places API (New). Mobile tests: Jest (`jest-expo`, pure-lib only — no RNTL in this repo). Backend tests: `deno test` (`*_test.ts`, `jsr:@std/assert`).

## Global Constraints

- Mobile tests are **pure-function Jest** only; components are verified by `tsc` + device smoke (repo has no RNTL / `.test.tsx`). Do **not** add component render tests.
- Backend tests are Deno, file suffix `_test.ts`, import `jsr:@std/assert`, logic lives in `supabase/_shared/`; functions split into thin `index.ts` (wiring) + `handler.ts`.
- Edge functions read the Google Places key from `Deno.env.get("GOOGLE_PLACES_KEY")` — **never** expose it to the client.
- Supabase reads rely on RLS for user scoping (no explicit `user_id` filter in selects); **inserts** must set `user_id` from `client.auth.getUser()`.
- Mobile reaches edge functions via `Constants.expoConfig?.extra` → `{ supabaseUrl, supabaseAnonKey }`, POST to `${supabaseUrl}/functions/v1/<fn>` with `apikey` + `Authorization: Bearer <anonKey>` headers.
- Migration files: next number is `0005`. Use `create ... if not exists` + `enable row level security` + an `for all using (auth.uid() = user_id) with check (...)` policy, matching `0003_trip_photos.sql`.
- TypeScript strict: every helper has explicit return types; map raw rows through a `rowTo*` function like `lib/trips.ts`.
- Commit after each task on green. Use Conventional Commit messages.

---

## File Structure

**Create:**
- `supabase/migrations/0005_saved_pois.sql` — table + RLS.
- `mobile/lib/savedPois.ts` — `listSavedPois`, `savePoi`, `unsavePoi`.
- `mobile/lib/savedPois.test.ts` — Jest tests for the above.
- `mobile/lib/discoverSeeds.ts` — curated country const.
- `mobile/lib/surpriseClient.ts` — mobile wrapper calling the `surprise-place` fn.
- `supabase/_shared/random_coord.ts` — `randomLandCoord(rng)`.
- `supabase/_shared/random_coord_test.ts` — deno tests.
- `supabase/_shared/surprise.ts` — `pickSurprisePlace(deps)` retry loop.
- `supabase/_shared/surprise_test.ts` — deno tests.
- `supabase/functions/surprise-place/index.ts` — wiring.
- `supabase/functions/surprise-place/handler.ts` — thin handler.
- `mobile/app/(app)/surprise.tsx` — roll/save screen.

**Modify:**
- `supabase/_shared/places.ts` — add `searchNearby`.
- `supabase/_shared/places_test.ts` — add `searchNearby` tests.
- `mobile/app/(app)/poi-detail.tsx` — replace stub with real screen.
- `mobile/app/(app)/itinerary.tsx` — make attraction stop rows pressable → `poi-detail`.
- `mobile/app/(app)/(tabs)/discover.tsx` — replace placeholder with the real tab.

---

## Task 1: `saved_pois` table + RLS

**Files:**
- Create: `supabase/migrations/0005_saved_pois.sql`

**Interfaces:**
- Produces: table `public.saved_pois (id uuid, user_id uuid, place_id text, place_name text, blurb text, created_at timestamptz)`, unique `(user_id, place_id)`, RLS "own saved" policy.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_saved_pois.sql
-- Wishlist of places the user wants to visit. One row per (user, place).
create table if not exists public.saved_pois (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id text not null,
  place_name text not null,
  blurb text,
  created_at timestamptz not null default now(),
  unique (user_id, place_id)
);
create index if not exists saved_pois_user_created_idx
  on public.saved_pois (user_id, created_at desc);

alter table public.saved_pois enable row level security;

create policy "own saved pois" on public.saved_pois
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Verify it parses against a local DB (if the stack is running)**

Run: `supabase db reset` (or apply to a scratch DB). If the local stack is not running, skip and rely on the Task 2 lib tests + deploy-time apply.
Expected: migration applies with no SQL error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_saved_pois.sql
git commit -m "feat(db): saved_pois table for wishlist POIs"
```

---

## Task 2: `lib/savedPois.ts` data layer

**Files:**
- Create: `mobile/lib/savedPois.ts`
- Test: `mobile/lib/savedPois.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`; table from Task 1.
- Produces:
  - `interface SavedPoi { id: string; placeId: string; placeName: string; blurb: string | null; createdAt: string }`
  - `listSavedPois(client: SupabaseClient): Promise<SavedPoi[]>` (newest first)
  - `savePoi(client: SupabaseClient, poi: { placeId: string; placeName: string; blurb?: string | null }): Promise<void>` (idempotent; sets `user_id` from auth)
  - `unsavePoi(client: SupabaseClient, placeId: string): Promise<void>` (delete by place_id; RLS scopes to user)

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/lib/savedPois.test.ts
import { listSavedPois, savePoi, unsavePoi, type SavedPoi } from "./savedPois";
import type { SupabaseClient } from "@supabase/supabase-js";

const row = { id: "s1", place_id: "p1", place_name: "Eiffel Tower", blurb: "Iron lady", created_at: "2026-06-01T00:00:00Z" };

function listClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return { from: () => ({ select: () => ({ order: async () => result }) }) } as unknown as SupabaseClient;
}

test("listSavedPois maps rows to SavedPoi", async () => {
  const out = await listSavedPois(listClient({ data: [row], error: null }));
  expect(out).toEqual<SavedPoi[]>([
    { id: "s1", placeId: "p1", placeName: "Eiffel Tower", blurb: "Iron lady", createdAt: "2026-06-01T00:00:00Z" },
  ]);
});

test("listSavedPois returns [] when no rows", async () => {
  expect(await listSavedPois(listClient({ data: null, error: null }))).toEqual([]);
});

test("listSavedPois throws on query error", async () => {
  await expect(listSavedPois(listClient({ data: null, error: { message: "boom" } }))).rejects.toBeTruthy();
});

test("savePoi inserts with user_id from auth and null blurb default", async () => {
  let inserted: Record<string, unknown> | null = null;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ insert: async (v: Record<string, unknown>) => { inserted = v; return { error: null }; } }),
  } as unknown as SupabaseClient;
  await savePoi(client, { placeId: "p1", placeName: "Eiffel Tower" });
  expect(inserted).toEqual({ user_id: "u1", place_id: "p1", place_name: "Eiffel Tower", blurb: null });
});

test("savePoi throws when no authenticated user", async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  } as unknown as SupabaseClient;
  await expect(savePoi(client, { placeId: "p1", placeName: "x" })).rejects.toBeTruthy();
});

test("unsavePoi deletes by place_id", async () => {
  let deletedId = "";
  const client = {
    from: () => ({ delete: () => ({ eq: async (_col: string, val: string) => { deletedId = val; return { error: null }; } }) }),
  } as unknown as SupabaseClient;
  await unsavePoi(client, "p1");
  expect(deletedId).toBe("p1");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest savedPois -t "savedPois"` (or `npx jest savedPois`)
Expected: FAIL — `Cannot find module './savedPois'`.

- [ ] **Step 3: Write the implementation**

```ts
// mobile/lib/savedPois.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SavedPoi {
  id: string;
  placeId: string;
  placeName: string;
  blurb: string | null;
  createdAt: string;
}

interface SavedPoiRow {
  id: string;
  place_id: string;
  place_name: string;
  blurb: string | null;
  created_at: string;
}

function rowToSaved(row: SavedPoiRow): SavedPoi {
  return { id: row.id, placeId: row.place_id, placeName: row.place_name, blurb: row.blurb, createdAt: row.created_at };
}

// RLS scopes saved_pois to the current user — no explicit user_id filter on reads.
export async function listSavedPois(client: SupabaseClient): Promise<SavedPoi[]> {
  const { data, error } = await client
    .from("saved_pois")
    .select("id, place_id, place_name, blurb, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as SavedPoiRow[]).map(rowToSaved);
}

export async function savePoi(
  client: SupabaseClient,
  poi: { placeId: string; placeName: string; blurb?: string | null },
): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("not signed in");
  const { error } = await client.from("saved_pois").insert({
    user_id: user.id,
    place_id: poi.placeId,
    place_name: poi.placeName,
    blurb: poi.blurb ?? null,
  });
  if (error) throw error;
}

export async function unsavePoi(client: SupabaseClient, placeId: string): Promise<void> {
  const { error } = await client.from("saved_pois").delete().eq("place_id", placeId);
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest savedPois`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/savedPois.ts mobile/lib/savedPois.test.ts
git commit -m "feat(saved): savedPois data layer (list/save/unsave)"
```

---

## Task 3: Real `poi-detail` screen + itinerary entry point

**Files:**
- Modify: `mobile/app/(app)/poi-detail.tsx` (replace the entire stub)
- Modify: `mobile/app/(app)/itinerary.tsx` (wrap attraction rows in a `Pressable` → `poi-detail`)

**Interfaces:**
- Consumes: `listSavedPois`, `savePoi`, `unsavePoi` (Task 2); `getStopCoords` from `lib/poi`; `supabase` singleton; `AppleMaps` from `expo-maps`; `useLocalSearchParams`/`useRouter` from `expo-router`; `components/ui` (`Screen`, `Text`, `Button`, `Card`).
- Route params (all strings): `placeId`, `name`, `blurb?`, `dwellMinutes?`.

- [ ] **Step 1: Replace the poi-detail stub**

```tsx
// mobile/app/(app)/poi-detail.tsx
import { useMemo } from "react";
import { View } from "react-native";
import { AppleMaps } from "expo-maps";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { getStopCoords } from "../../lib/poi";
import { listSavedPois, savePoi, unsavePoi } from "../../lib/savedPois";
import { formatDwell } from "../../lib/poi";
import { Screen, Text, Button, Card } from "../../components/ui";

export default function PoiDetail() {
  const { placeId, name, blurb, dwellMinutes } = useLocalSearchParams<{
    placeId: string; name: string; blurb?: string; dwellMinutes?: string;
  }>();
  const qc = useQueryClient();

  const coordsQ = useQuery({
    queryKey: ["stopCoords", placeId],
    queryFn: () => getStopCoords(supabase, [placeId]),
    enabled: !!placeId,
  });
  const coord = placeId ? coordsQ.data?.[placeId] : undefined;

  const savedQ = useQuery({ queryKey: ["savedPois"], queryFn: () => listSavedPois(supabase) });
  const isSaved = !!savedQ.data?.some((s) => s.placeId === placeId);

  const toggle = useMutation({
    mutationFn: async () => {
      if (isSaved) await unsavePoi(supabase, placeId);
      else await savePoi(supabase, { placeId, placeName: name, blurb: blurb ?? null });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["savedPois"] }),
  });

  const dwell = useMemo(() => formatDwell(dwellMinutes ? Number(dwellMinutes) : undefined), [dwellMinutes]);

  return (
    <Screen>
      <View className="gap-3">
        <Text variant="display">{name}</Text>
        {blurb ? <Text variant="body" className="text-ink-muted">{blurb}</Text> : null}
        {dwell ? <Text variant="caption">{dwell}</Text> : null}
        {coord ? (
          <Card className="overflow-hidden p-0" style={{ height: 220 }}>
            <AppleMaps.View
              style={{ flex: 1 }}
              cameraPosition={{ coordinates: { latitude: coord.lat, longitude: coord.lng }, zoom: 13 }}
              markers={[{ id: placeId, coordinates: { latitude: coord.lat, longitude: coord.lng }, title: name }]}
            />
          </Card>
        ) : null}
        <Button
          title={isSaved ? "♥ Saved" : "♡ Save this place"}
          variant={isSaved ? "secondary" : "primary"}
          onPress={() => toggle.mutate()}
          disabled={toggle.isPending}
        />
      </View>
    </Screen>
  );
}
```

> Note: confirm `Button` accepts `title`, `variant`, `onPress`, `disabled` (see `(tabs)/index.tsx` usage). If the prop names differ, match the existing `Button` API — do not invent props.

- [ ] **Step 2: Make itinerary attraction rows open poi-detail**

In `mobile/app/(app)/itinerary.tsx`, add `import { useRouter } from "expo-router";` (if absent) and `const router = useRouter();` inside the component. Wrap the **non-meal** `Card` (the `: (` branch around lines 174-186) in a `Pressable`:

```tsx
// at top with other imports
import { Pressable } from "react-native";
// ...
) : (
  <Pressable
    onPress={() => router.push({
      pathname: "/poi-detail",
      params: { placeId: item.placeId, name: item.name, blurb: item.blurb ?? "", dwellMinutes: String(item.dwellMinutes ?? "") },
    })}
  >
    <Card className="gap-1">
      {/* ...existing card contents unchanged... */}
    </Card>
  </Pressable>
);
```

Leave the meal branch unchanged (meals aren't saveable POIs).

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. (If `Button`/`Card` prop mismatch, fix to match their real signatures, then re-run.)

- [ ] **Step 4: Commit**

```bash
git add mobile/app/\(app\)/poi-detail.tsx mobile/app/\(app\)/itinerary.tsx
git commit -m "feat(poi): real poi-detail with save toggle + map; open from itinerary"
```

---

## Task 4: Discover seeds const

**Files:**
- Create: `mobile/lib/discoverSeeds.ts`

**Interfaces:**
- Produces: `DISCOVER_SEEDS: { name: string; emoji: string }[]` — country **names** (resolved to placeIds at tap via autocomplete, so no fragile hardcoded IDs).

- [ ] **Step 1: Write the const**

```ts
// mobile/lib/discoverSeeds.ts
// ponytail: curated const, not a table. Replace with user-rated/reviewed ideas later.
// Names only — resolved to a Google placeId at tap-time via places-autocomplete,
// so we never hardcode (and risk staleness in) Place IDs.
export const DISCOVER_SEEDS: { name: string; emoji: string }[] = [
  { name: "Japan", emoji: "🗾" },
  { name: "Italy", emoji: "🍝" },
  { name: "Portugal", emoji: "🛳️" },
  { name: "Morocco", emoji: "🕌" },
  { name: "Thailand", emoji: "🛺" },
  { name: "Peru", emoji: "🏔️" },
  { name: "Greece", emoji: "🏛️" },
  { name: "Iceland", emoji: "🌋" },
  { name: "Vietnam", emoji: "🍜" },
  { name: "Mexico", emoji: "🌮" },
];
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd mobile && npx tsc --noEmit` → no errors.

```bash
git add mobile/lib/discoverSeeds.ts
git commit -m "feat(discover): curated country seed list"
```

---

## Task 5: Discover tab

**Files:**
- Modify: `mobile/app/(app)/(tabs)/discover.tsx` (replace the placeholder)

**Interfaces:**
- Consumes: `DISCOVER_SEEDS` (Task 4); `listSavedPois` (Task 2); `autocompletePlaces`, `suggestRegions`, `Region` from `lib/placesClient`; `useTripFlow` from `lib/tripFlow`; `buildRequest` + a default state from `lib/onboarding`; `supabase`; `components/ui`.
- Behaviour: Surprise button → `/surprise`. Saved section → `/poi-detail`. Country tap → resolve placeId via autocomplete → `suggestRegions` → render regions inline. Region tap → `tripFlow.prepare(...)` → `/onboarding`.

**Verify before coding:** open `mobile/lib/onboarding.ts` and confirm the exact way to build a seed `GenerateRequest` for a destination. The onboarding screen seeds via `tripFlow.prepare(request)` where `request` is a `GenerateRequest` carrying `location` + `destinationPlaceId`. Use `buildRequest(prefsFromState(...))` if that is the public path, or construct the minimal `GenerateRequest` the existing edit-flow uses. Match `onboarding.tsx` lines ~152-174 (it already sets `{ location, destinationPlaceId }` into state). Do **not** invent new fields.

- [ ] **Step 1: Write the Discover tab**

```tsx
// mobile/app/(app)/(tabs)/discover.tsx
import { useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { listSavedPois } from "../../../lib/savedPois";
import { DISCOVER_SEEDS } from "../../../lib/discoverSeeds";
import { autocompletePlaces, suggestRegions, type Region } from "../../../lib/placesClient";
import { useTripFlow } from "../../../lib/tripFlow";
import { Screen, Text, Button, Card, Loading } from "../../../components/ui";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string; supabaseAnonKey: string };

export default function Discover() {
  const router = useRouter();
  const tripFlow = useTripFlow();
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(false);

  const savedQ = useQuery({ queryKey: ["savedPois"], queryFn: () => listSavedPois(supabase) });

  async function openRegions(country: string) {
    setOpenCountry(country);
    setRegions([]);
    setLoadingRegions(true);
    try {
      const hits = await autocompletePlaces({ query: country, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey });
      const placeId = hits[0]?.placeId;
      const regs = placeId
        ? await suggestRegions({ placeId, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
        : [];
      setRegions(regs);
    } finally {
      setLoadingRegions(false);
    }
  }

  function seedAndPlan(region: Region) {
    // Seed onboarding with the chosen destination, mirroring the trip-edit flow.
    tripFlow.prepare({ location: region.label, destinationPlaceId: region.placeId } as never);
    router.push("/onboarding");
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-4 pb-6">
        <View className="flex-row items-center justify-between">
          <Text variant="display">Discover</Text>
          <Button title="🎲 Surprise me" variant="secondary" onPress={() => router.push("/surprise")} />
        </View>

        {(savedQ.data?.length ?? 0) > 0 ? (
          <View className="gap-2">
            <Text variant="heading">Saved</Text>
            {savedQ.data!.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => router.push({ pathname: "/poi-detail", params: { placeId: s.placeId, name: s.placeName, blurb: s.blurb ?? "" } })}
              >
                <Card className="gap-0.5">
                  <Text variant="heading">{s.placeName}</Text>
                  {s.blurb ? <Text variant="caption" className="text-ink-muted">{s.blurb}</Text> : null}
                </Card>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View className="gap-2">
          <Text variant="heading">Ideas</Text>
          {DISCOVER_SEEDS.map((c) => (
            <View key={c.name} className="gap-2">
              <Pressable onPress={() => (openCountry === c.name ? setOpenCountry(null) : openRegions(c.name))}>
                <Card className="flex-row items-center gap-3">
                  <Text variant="display">{c.emoji}</Text>
                  <Text variant="heading">{c.name}</Text>
                </Card>
              </Pressable>
              {openCountry === c.name ? (
                loadingRegions ? <Loading /> : (
                  <View className="gap-1 pl-4">
                    {regions.length === 0 ? <Text variant="caption" className="text-ink-muted">No regions found.</Text> : null}
                    {regions.map((r) => (
                      <Pressable key={r.placeId} onPress={() => seedAndPlan(r)}>
                        <Card className="gap-0.5">
                          <Text variant="label">{r.label}</Text>
                          {r.hook ? <Text variant="caption" className="text-ink-muted">{r.hook}</Text> : null}
                        </Card>
                      </Pressable>
                    ))}
                  </View>
                )
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
```

> The `as never` on `tripFlow.prepare(...)` is a placeholder for the real `GenerateRequest` shape. During Step 1, open `lib/api.ts` (the `GenerateRequest` type) and `lib/onboarding.ts`, and replace it with a correctly-typed minimal request (matching how `onboarding.tsx` sets `location` + `destinationPlaceId`). Remove the cast once typed correctly.

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors once `prepare(...)` is correctly typed and the cast removed. Verify `Button`/`Card`/`Loading` props match their real signatures.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/\(tabs\)/discover.tsx
git commit -m "feat(discover): Discover tab — saved list + country/region ideas + surprise entry"
```

---

## Task 6: `randomLandCoord` (random-coordinate generator)

**Files:**
- Create: `supabase/_shared/random_coord.ts`
- Test: `supabase/_shared/random_coord_test.ts`

**Interfaces:**
- Produces:
  - `interface LandBox { name: string; minLat: number; maxLat: number; minLng: number; maxLng: number }`
  - `LAND_BOXES: LandBox[]`
  - `randomLandCoord(rng: () => number): { lat: number; lng: number; box: string }` — picks a box (uniform over boxes) then a uniform point inside it.

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/_shared/random_coord_test.ts
import { assert } from "jsr:@std/assert";
import { randomLandCoord, LAND_BOXES } from "./random_coord.ts";

// Deterministic rng: cycles through a fixed sequence.
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

Deno.test("randomLandCoord lands inside one of the defined boxes", () => {
  // 200 pseudo-random draws all fall within some LAND_BOX.
  let seed = 12345;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 200; i++) {
    const c = randomLandCoord(rng);
    const inSome = LAND_BOXES.some((b) =>
      c.lat >= b.minLat && c.lat <= b.maxLat && c.lng >= b.minLng && c.lng <= b.maxLng);
    assert(inSome, `(${c.lat},${c.lng}) outside every land box`);
  }
});

Deno.test("randomLandCoord picks the first box at rng=0 and its min corner", () => {
  const rng = seqRng([0, 0, 0]); // box index 0, lat fraction 0, lng fraction 0
  const c = randomLandCoord(rng);
  const b = LAND_BOXES[0];
  assert(c.lat === b.minLat && c.lng === b.minLng, "expected min corner of first box");
  assert(c.box === b.name);
});

Deno.test("all land boxes have valid ordered bounds", () => {
  for (const b of LAND_BOXES) {
    assert(b.minLat < b.maxLat && b.minLng < b.maxLng, `bad box ${b.name}`);
    assert(b.minLat >= -90 && b.maxLat <= 90 && b.minLng >= -180 && b.maxLng <= 180);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase && deno test _shared/random_coord_test.ts`
Expected: FAIL — module `./random_coord.ts` not found.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/_shared/random_coord.ts
// ponytail: coarse continent boxes over populated land. Some draws still hit
// empty land/water near box edges — the Places retry loop (surprise.ts) covers it.
// Tighten boxes or add a land mask if rolls feel too empty.
export interface LandBox {
  name: string;
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
}

export const LAND_BOXES: LandBox[] = [
  { name: "W Europe",      minLat: 36, maxLat: 60, minLng: -10, maxLng: 20 },
  { name: "E Europe",      minLat: 40, maxLat: 60, minLng: 20,  maxLng: 45 },
  { name: "E Asia",        minLat: 22, maxLat: 45, minLng: 100, maxLng: 142 },
  { name: "S/SE Asia",     minLat: 5,  maxLat: 28, minLng: 70,  maxLng: 122 },
  { name: "Middle East",   minLat: 15, maxLat: 38, minLng: 35,  maxLng: 60 },
  { name: "N Africa",      minLat: 5,  maxLat: 33, minLng: -15, maxLng: 35 },
  { name: "S Africa",      minLat: -34, maxLat: 0, minLng: 12,  maxLng: 40 },
  { name: "E North Am",    minLat: 28, maxLat: 50, minLng: -95, maxLng: -68 },
  { name: "W North Am",    minLat: 32, maxLat: 49, minLng: -124, maxLng: -100 },
  { name: "Mexico/CenAm",  minLat: 8,  maxLat: 28, minLng: -106, maxLng: -83 },
  { name: "S America",     minLat: -40, maxLat: 5, minLng: -75, maxLng: -38 },
  { name: "Australia",     minLat: -38, maxLat: -18, minLng: 115, maxLng: 150 },
];

export function randomLandCoord(rng: () => number): { lat: number; lng: number; box: string } {
  const box = LAND_BOXES[Math.floor(rng() * LAND_BOXES.length)] ?? LAND_BOXES[0];
  const lat = box.minLat + rng() * (box.maxLat - box.minLat);
  const lng = box.minLng + rng() * (box.maxLng - box.minLng);
  return { lat, lng, box: box.name };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase && deno test _shared/random_coord_test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/random_coord.ts supabase/_shared/random_coord_test.ts
git commit -m "feat(surprise): randomLandCoord over weighted continent boxes"
```

---

## Task 7: `searchNearby` Places helper

**Files:**
- Modify: `supabase/_shared/places.ts` (add `searchNearby`)
- Modify: `supabase/_shared/places_test.ts` (add tests)

**Interfaces:**
- Produces: `searchNearby(opts: { lat: number; lng: number; radiusM: number; httpFetch: HttpFetch; apiKey: string }): Promise<{ placeId: string; name: string; lat: number; lng: number; blurb: string | null } | null>` — returns the top popular nearby tourist attraction / locality, or `null` if none.

- [ ] **Step 1: Add the failing tests to `places_test.ts`**

```ts
// append to supabase/_shared/places_test.ts
import { searchNearby } from "./places.ts";

Deno.test("searchNearby maps the first place", async () => {
  const body = {
    places: [
      { id: "N1", displayName: { text: "Mount Cool" }, location: { latitude: 10, longitude: 20 }, editorialSummary: { text: "A nice peak" } },
    ],
  };
  const httpFetch = () => Promise.resolve(fakeResponse(body));
  const out = await searchNearby({ lat: 10, lng: 20, radiusM: 50000, httpFetch, apiKey: "k" });
  assertEquals(out, { placeId: "N1", name: "Mount Cool", lat: 10, lng: 20, blurb: "A nice peak" });
});

Deno.test("searchNearby returns null on empty result", async () => {
  const httpFetch = () => Promise.resolve(fakeResponse({ places: [] }));
  const out = await searchNearby({ lat: 0, lng: 0, radiusM: 50000, httpFetch, apiKey: "k" });
  assertEquals(out, null);
});

Deno.test("searchNearby blurb is null when no editorialSummary", async () => {
  const body = { places: [{ id: "N2", displayName: { text: "Plain Town" }, location: { latitude: 1, longitude: 2 } }] };
  const httpFetch = () => Promise.resolve(fakeResponse(body));
  const out = await searchNearby({ lat: 1, lng: 2, radiusM: 50000, httpFetch, apiKey: "k" });
  assertEquals(out?.blurb, null);
});

Deno.test("searchNearby throws on HTTP error", async () => {
  const httpFetch = () => Promise.resolve(fakeResponse({}, false, 500));
  let threw = false;
  try { await searchNearby({ lat: 0, lng: 0, radiusM: 1000, httpFetch, apiKey: "k" }); }
  catch { threw = true; }
  assert(threw);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: FAIL — `searchNearby` not exported.

- [ ] **Step 3: Add `searchNearby` to `places.ts`**

```ts
// append to supabase/_shared/places.ts
const NEARBY_FIELD_MASK = "places.id,places.displayName,places.location,places.editorialSummary";

export async function searchNearby(opts: {
  lat: number; lng: number; radiusM: number; httpFetch: HttpFetch; apiKey: string;
}): Promise<{ placeId: string; name: string; lat: number; lng: number; blurb: string | null } | null> {
  const { lat, lng, radiusM, httpFetch, apiKey } = opts;
  const res = await httpFetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": NEARBY_FIELD_MASK },
    body: JSON.stringify({
      includedTypes: ["tourist_attraction", "locality"],
      maxResultCount: 1,
      rankPreference: "POPULARITY",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusM, 50000) } },
    }),
  });
  if (!res.ok) throw new Error(`searchNearby: HTTP ${res.status}`);
  const data = await res.json() as {
    places?: Array<{ id?: string; displayName?: { text?: string }; location?: { latitude?: number; longitude?: number }; editorialSummary?: { text?: string } }>;
  };
  const p = data.places?.[0];
  if (!p?.id) return null;
  return {
    placeId: p.id,
    name: p.displayName?.text ?? "",
    lat: p.location?.latitude ?? lat,
    lng: p.location?.longitude ?? lng,
    blurb: p.editorialSummary?.text ?? null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: PASS (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat(places): searchNearby helper (Places Nearby, popularity)"
```

---

## Task 8: `pickSurprisePlace` retry loop + `surprise-place` function

**Files:**
- Create: `supabase/_shared/surprise.ts`
- Test: `supabase/_shared/surprise_test.ts`
- Create: `supabase/functions/surprise-place/handler.ts`
- Create: `supabase/functions/surprise-place/index.ts`

**Interfaces:**
- Consumes: `randomLandCoord` (Task 6), `searchNearby` (Task 7).
- Produces:
  - `interface SurpriseDeps { rng: () => number; nearby(lat: number, lng: number): Promise<{ placeId: string; name: string; lat: number; lng: number; blurb: string | null } | null>; maxTries?: number }`
  - `pickSurprisePlace(deps: SurpriseDeps): Promise<{ placeId: string; name: string; lat: number; lng: number; blurb: string | null } | null>` — loops up to `maxTries` (default 5), returns first non-null nearby hit, else `null`.
  - `handleSurprise(deps): Promise<{ status: number; body: unknown }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/_shared/surprise_test.ts
import { assertEquals } from "jsr:@std/assert";
import { pickSurprisePlace } from "./surprise.ts";

const hit = { placeId: "p", name: "Somewhere", lat: 1, lng: 2, blurb: null };

Deno.test("pickSurprisePlace returns the first non-null nearby hit", async () => {
  let calls = 0;
  const out = await pickSurprisePlace({
    rng: () => 0.5,
    nearby: async () => { calls++; return calls >= 2 ? hit : null; },
    maxTries: 5,
  });
  assertEquals(out, hit);
  assertEquals(calls, 2);
});

Deno.test("pickSurprisePlace returns null after exhausting maxTries", async () => {
  let calls = 0;
  const out = await pickSurprisePlace({
    rng: () => 0.5,
    nearby: async () => { calls++; return null; },
    maxTries: 3,
  });
  assertEquals(out, null);
  assertEquals(calls, 3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase && deno test _shared/surprise_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `surprise.ts`**

```ts
// supabase/_shared/surprise.ts
import { randomLandCoord } from "./random_coord.ts";

interface Place { placeId: string; name: string; lat: number; lng: number; blurb: string | null }

export interface SurpriseDeps {
  rng: () => number;
  nearby(lat: number, lng: number): Promise<Place | null>;
  maxTries?: number;
}

export async function pickSurprisePlace(deps: SurpriseDeps): Promise<Place | null> {
  const tries = deps.maxTries ?? 5;
  for (let i = 0; i < tries; i++) {
    const { lat, lng } = randomLandCoord(deps.rng);
    const place = await deps.nearby(lat, lng);
    if (place) return place;
  }
  return null;
}

export async function handleSurprise(deps: SurpriseDeps): Promise<{ status: number; body: unknown }> {
  try {
    const place = await pickSurprisePlace(deps);
    if (!place) return { status: 502, body: { error: "no place found, try again" } };
    return { status: 200, body: place };
  } catch (e) {
    console.error("surprise-place error:", e instanceof Error ? e.message : e);
    return { status: 502, body: { error: "surprise failed" } };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase && deno test _shared/surprise_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the function `handler.ts` + `index.ts`**

```ts
// supabase/functions/surprise-place/handler.ts
export { handleSurprise } from "../../_shared/surprise.ts";
```

```ts
// supabase/functions/surprise-place/index.ts
import { handleSurprise } from "./handler.ts";
import { searchNearby } from "../../_shared/places.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;

Deno.serve(async () => {
  const result = await handleSurprise({
    rng: Math.random,
    nearby: (lat, lng) => searchNearby({ lat, lng, radiusM: 50000, httpFetch: fetch, apiKey: PLACES_KEY }),
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 6: Typecheck the function**

Run: `cd supabase && deno check functions/surprise-place/index.ts`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/_shared/surprise.ts supabase/_shared/surprise_test.ts supabase/functions/surprise-place
git commit -m "feat(surprise): surprise-place edge fn + retry loop"
```

---

## Task 9: `surprise.tsx` screen + mobile client

**Files:**
- Create: `mobile/lib/surpriseClient.ts`
- Create: `mobile/app/(app)/surprise.tsx`

**Interfaces:**
- Consumes: edge fn `surprise-place`; `savePoi` (Task 2); `AppleMaps`; `components/ui`.
- Produces: `surprisePlace(opts: { baseUrl: string; anonKey: string; fetchImpl?: typeof fetch }): Promise<{ placeId: string; name: string; lat: number; lng: number; blurb: string | null } | null>`.

- [ ] **Step 1: Write the client + a small test**

```ts
// mobile/lib/surpriseClient.ts
export interface SurprisePlace { placeId: string; name: string; lat: number; lng: number; blurb: string | null }

export async function surprisePlace(opts: {
  baseUrl: string; anonKey: string; fetchImpl?: typeof fetch;
}): Promise<SurprisePlace | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/surprise-place`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": opts.anonKey, "Authorization": `Bearer ${opts.anonKey}` },
    body: "{}",
  });
  if (!res.ok) return null;
  return await res.json() as SurprisePlace;
}
```

```ts
// mobile/lib/surpriseClient.test.ts
import { surprisePlace } from "./surpriseClient";

test("surprisePlace returns the parsed place", async () => {
  const place = { placeId: "p", name: "X", lat: 1, lng: 2, blurb: null };
  const fetchImpl = (async () => new Response(JSON.stringify(place), { status: 200 })) as unknown as typeof fetch;
  expect(await surprisePlace({ baseUrl: "http://x", anonKey: "k", fetchImpl })).toEqual(place);
});

test("surprisePlace returns null on non-ok", async () => {
  const fetchImpl = (async () => new Response("{}", { status: 502 })) as unknown as typeof fetch;
  expect(await surprisePlace({ baseUrl: "http://x", anonKey: "k", fetchImpl })).toBeNull();
});
```

- [ ] **Step 2: Run the client test (red → green)**

Run: `cd mobile && npx jest surpriseClient`
Expected: FAIL first (no module), then PASS after Step 1 file exists. (Write the test, run to see red, then it is already green since impl is in the same step — if so, proceed.)

- [ ] **Step 3: Write the screen**

```tsx
// mobile/app/(app)/surprise.tsx
import { useState, useCallback, useEffect } from "react";
import { View } from "react-native";
import { AppleMaps } from "expo-maps";
import Constants from "expo-constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { savePoi } from "../../lib/savedPois";
import { surprisePlace, type SurprisePlace } from "../../lib/surpriseClient";
import { Screen, Text, Button, Card, Loading } from "../../components/ui";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string; supabaseAnonKey: string };

export default function Surprise() {
  const qc = useQueryClient();
  const [place, setPlace] = useState<SurprisePlace | null>(null);
  const [saved, setSaved] = useState(false);

  const roll = useMutation({
    mutationFn: () => surprisePlace({ baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey }),
    onSuccess: (p) => { setPlace(p); setSaved(false); },
  });

  const save = useMutation({
    mutationFn: () => savePoi(supabase, { placeId: place!.placeId, placeName: place!.name, blurb: place!.blurb }),
    onSuccess: () => { setSaved(true); qc.invalidateQueries({ queryKey: ["savedPois"] }); },
  });

  // Roll once on mount.
  const start = useCallback(() => roll.mutate(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { start(); }, [start]);

  return (
    <Screen>
      <View className="flex-1 gap-3">
        {roll.isPending ? <Loading /> : null}
        {!roll.isPending && !place ? (
          <Text variant="body" className="text-ink-muted">Couldn't find a spot. Roll again!</Text>
        ) : null}
        {place ? (
          <>
            <Text variant="display">{place.name}</Text>
            {place.blurb ? <Text variant="body" className="text-ink-muted">{place.blurb}</Text> : null}
            <Card className="overflow-hidden p-0" style={{ height: 260 }}>
              <AppleMaps.View
                style={{ flex: 1 }}
                cameraPosition={{ coordinates: { latitude: place.lat, longitude: place.lng }, zoom: 9 }}
                markers={[{ id: place.placeId, coordinates: { latitude: place.lat, longitude: place.lng }, title: place.name }]}
              />
            </Card>
            <Button
              title={saved ? "♥ Saved" : "♡ Save this place"}
              variant={saved ? "secondary" : "primary"}
              onPress={() => save.mutate()}
              disabled={saved || save.isPending}
            />
          </>
        ) : null}
        <Button title="🎲 Roll again" variant="secondary" onPress={() => roll.mutate()} disabled={roll.isPending} />
      </View>
    </Screen>
  );
}
```

> Confirm `Button`/`Card`/`Loading` prop names against their real signatures; adjust if needed.

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/surpriseClient.ts mobile/lib/surpriseClient.test.ts mobile/app/\(app\)/surprise.tsx
git commit -m "feat(surprise): surprise screen + client (roll + save)"
```

---

## Task 10: Full suite + deploy notes

**Files:** none (verification + deploy).

- [ ] **Step 1: Run all mobile tests + typecheck**

Run: `cd mobile && npx jest && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 2: Run all backend tests**

Run: `cd supabase && deno test _shared/`
Expected: all green (includes new random_coord, surprise, places tests).

- [ ] **Step 3: Deploy backend** (requires Supabase access; confirm with the user before running)

```bash
supabase db push                         # applies 0005_saved_pois.sql
supabase functions deploy surprise-place
```

- [ ] **Step 4: Device smoke checklist (human)**

  - Discover tab: saved list (empty → hidden), country tap → regions load → region tap → onboarding pre-seeded.
  - Itinerary stop → poi-detail → map renders → save/unsave persists (re-open Discover shows it).
  - Surprise: rolls a place on open, map centers, Save works, Roll again re-rolls; "couldn't find a spot" after exhausted retries.

- [ ] **Step 5: Commit any smoke fixes, then update memory** (`home-screen-state` → Phase 3 done).

---

## Self-Review

**Spec coverage:**
- Discover tab (saved + curated ideas → onboarding seed) → Tasks 4, 5. ✓
- Real poi-detail + save action + itinerary entry → Tasks 2, 3. ✓
- `saved_pois` table + RLS → Task 1. ✓
- Surprise Me (random land coord + Places Nearby + retry, edge fn, screen) → Tasks 6, 7, 8, 9. ✓
- Testing: savedPois (jest), randomLandCoord/searchNearby/pickSurprisePlace (deno), RLS verified at deploy → Tasks 2, 6, 7, 8, 1/10. ✓
- Error/empty states (empty saved hidden, region-fail inline, retry exhaustion, save-fail revert) → Tasks 5, 8, 9. ✓
- No component render tests (repo convention) → respected. ✓

**Placeholder scan:** The two `as never` / "confirm Button props" notes are explicit *resolve-at-implementation* instructions tied to reading named existing files (`lib/api.ts`, `lib/onboarding.ts`, `components/ui/Button`), not vague TODOs — acceptable because the exact `GenerateRequest`/`Button` shapes must be read from source, and the plan names where.

**Type consistency:** `searchNearby` return shape `{ placeId, name, lat, lng, blurb }` is reused verbatim by `pickSurprisePlace`, `SurpriseDeps.nearby`, `handleSurprise`, `surprisePlace`, and `SurprisePlace`. `SavedPoi`/`savePoi`/`unsavePoi` signatures match across Tasks 2, 3, 5, 9. `randomLandCoord(rng)` signature matches Tasks 6 and 8.

**Scope:** Single feature set (Discover + saved + surprise), one plan. ✓
