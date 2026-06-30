# Home Phase 1 — Tabs + Trips Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-screen home into a bottom-tab hub (Trips / Passport / Discover) where the Trips tab lists the user's saved trips from the database and reopening a trip loads its itinerary from the DB.

**Architecture:** Nest a pathless `(tabs)` group inside the existing `(app)` Stack. The old launchpad `index.tsx` becomes `(tabs)/index.tsx` (the Trips tab); Passport and Discover are placeholder screens this phase. Trips are read with a new `lib/trips.ts` (react-query already provides caching). The `itinerary` screen gains an optional `tripId` route param: when present it loads that trip from the DB, otherwise it falls back to the in-memory `useTripFlow()` data (the just-generated path). Flow/detail screens stay at the `(app)` stack level so they push full-screen over the tab bar.

**Tech Stack:** Expo Router (Stack + Tabs), React Native, NativeWind, `@tanstack/react-query`, `@supabase/supabase-js`, Jest (`jest-expo`).

## Global Constraints

- Expo SDK 56 — consult `https://docs.expo.dev/versions/v56.0.0/` before using any Expo/router API.
- TypeScript strict; every change must pass `npx tsc --noEmit` from `mobile/`.
- Reuse the existing design system in `mobile/components/ui` (tokens: `accent` `#E11D48`, `accent-soft`, `bg`, `surface`/`surface-2`, `ink`/`ink-muted`/`ink-inverse`; classes `rounded-pill`, `rounded-lg`, `shadow-card`). Do not introduce raw RN-primitive styling or a new design language.
- No new npm dependencies in this phase. Tab icons use emoji via `react-native` `Text` (the repo has no icon library).
- Tests follow the repo pattern: pure-function unit tests in `lib/*.test.ts` with a hand-rolled fake Supabase client (see `lib/profile.test.ts`). No component/RTL tests this phase (not installed).
- RLS policy `"own trips"` already scopes `public.trips` to `auth.uid() = user_id`; client queries must NOT add a user filter.
- All commands run from `mobile/`.

---

### Task 1: `lib/trips.ts` — read trips from the database

**Files:**
- Create: `mobile/lib/trips.ts`
- Test: `mobile/lib/trips.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`; `Itinerary` from `./types`.
- Produces:
  - `interface TripSummary { id: string; location: string; itinerary: Itinerary; createdAt: string }`
  - `listTrips(client: SupabaseClient): Promise<TripSummary[]>` — newest first.
  - `getTrip(client: SupabaseClient, id: string): Promise<TripSummary | null>`
  - `tripDayCount(trip: TripSummary): number`

- [ ] **Step 1: Write the failing test**

Create `mobile/lib/trips.test.ts`:

```ts
import { listTrips, getTrip, tripDayCount, type TripSummary } from "./trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Itinerary } from "./types";

const itin: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [] }, { day: 2, lodgingPlaceId: null, stops: [] }] };
const row = { id: "t1", location: "Kyoto", itinerary: itin, created_at: "2026-06-01T00:00:00Z" };

function listClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ order: async () => result }) }),
  } as unknown as SupabaseClient;
}

function getClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
  } as unknown as SupabaseClient;
}

test("listTrips maps rows to TripSummary", async () => {
  const trips = await listTrips(listClient({ data: [row], error: null }));
  expect(trips).toEqual([{ id: "t1", location: "Kyoto", itinerary: itin, createdAt: "2026-06-01T00:00:00Z" }]);
});

test("listTrips returns [] when no rows", async () => {
  expect(await listTrips(listClient({ data: null, error: null }))).toEqual([]);
});

test("listTrips throws on query error", async () => {
  await expect(listTrips(listClient({ data: null, error: { message: "boom" } }))).rejects.toBeTruthy();
});

test("getTrip returns one trip", async () => {
  const trip = await getTrip(getClient({ data: row, error: null }), "t1");
  expect(trip?.location).toBe("Kyoto");
});

test("getTrip returns null when not found", async () => {
  expect(await getTrip(getClient({ data: null, error: null }), "missing")).toBeNull();
});

test("getTrip throws on query error", async () => {
  await expect(getTrip(getClient({ data: null, error: { message: "no" } }), "t1")).rejects.toBeTruthy();
});

test("tripDayCount counts itinerary days", () => {
  expect(tripDayCount({ id: "t1", location: "Kyoto", itinerary: itin, createdAt: "" })).toBe(2);
});

test("tripDayCount is 0 for empty itinerary", () => {
  expect(tripDayCount({ id: "t1", location: "x", itinerary: { days: [] }, createdAt: "" })).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest trips`
Expected: FAIL — "Cannot find module './trips'".

- [ ] **Step 3: Write minimal implementation**

Create `mobile/lib/trips.ts`:

```ts
// mobile/lib/trips.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Itinerary } from "./types";

export interface TripSummary {
  id: string;
  location: string;
  itinerary: Itinerary;
  createdAt: string;
}

interface TripRow {
  id: string;
  location: string;
  itinerary: Itinerary;
  created_at: string;
}

function rowToTrip(row: TripRow): TripSummary {
  return { id: row.id, location: row.location, itinerary: row.itinerary, createdAt: row.created_at };
}

// RLS ("own trips") already scopes these to the current user — no user filter here.
export async function listTrips(client: SupabaseClient): Promise<TripSummary[]> {
  const { data, error } = await client
    .from("trips")
    .select("id, location, itinerary, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TripRow[]).map(rowToTrip);
}

export async function getTrip(client: SupabaseClient, id: string): Promise<TripSummary | null> {
  const { data, error } = await client
    .from("trips")
    .select("id, location, itinerary, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToTrip(data as TripRow) : null;
}

export function tripDayCount(trip: TripSummary): number {
  return trip.itinerary?.days?.length ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest trips`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/trips.ts mobile/lib/trips.test.ts
git commit -m "feat(trips): read saved trips from db (listTrips/getTrip)"
```

---

### Task 2: Bottom-tab navigation restructure

**Files:**
- Create: `mobile/app/(app)/(tabs)/_layout.tsx`
- Create: `mobile/app/(app)/(tabs)/passport.tsx`
- Create: `mobile/app/(app)/(tabs)/discover.tsx`
- Move: `mobile/app/(app)/index.tsx` → `mobile/app/(app)/(tabs)/index.tsx` (content unchanged this task — fix import depth)
- Delete: `mobile/app/(app)/saved.tsx` (stray unlinked stub; Discover replaces it in Phase 3)

**Interfaces:**
- Consumes: nothing new.
- Produces: routes `/` (Trips, via `(tabs)/index`), `/passport`, `/discover` rendered inside a bottom tab bar; `(app)`-level routes (`/onboarding`, `/itinerary`, …) continue to push full-screen over the tabs.

- [ ] **Step 1: Move the launchpad into the tab group**

Move the file: `git mv mobile/app/\(app\)/index.tsx mobile/app/\(app\)/\(tabs\)/index.tsx`

Then fix the relative import depth in the moved `mobile/app/(app)/(tabs)/index.tsx` (one level deeper now): change `../../lib/auth` → `../../../lib/auth` and `../../components/ui` → `../../../components/ui`. Leave all JSX/logic unchanged for this task.

- [ ] **Step 2: Create the tab layout**

Create `mobile/app/(app)/(tabs)/_layout.tsx`:

```tsx
// mobile/app/(app)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Text } from "react-native";

function icon(glyph: string) {
  return ({ color }: { color: string }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#E11D48",
        tabBarInactiveTintColor: "#6B5560",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Trips", tabBarIcon: icon("✈") }} />
      <Tabs.Screen name="passport" options={{ title: "Passport", tabBarIcon: icon("◍") }} />
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: icon("✦") }} />
    </Tabs>
  );
}
```

- [ ] **Step 3: Create the two placeholder tabs**

Create `mobile/app/(app)/(tabs)/passport.tsx`:

```tsx
// mobile/app/(app)/(tabs)/passport.tsx
import { Screen, EmptyState } from "../../../components/ui";

export default function Passport() {
  return (
    <Screen>
      <EmptyState title="Passport" subtitle="Your visited landmarks and photos will live here." />
    </Screen>
  );
}
```

Create `mobile/app/(app)/(tabs)/discover.tsx`:

```tsx
// mobile/app/(app)/(tabs)/discover.tsx
import { Screen, EmptyState } from "../../../components/ui";

export default function Discover() {
  return (
    <Screen>
      <EmptyState title="Discover" subtitle="Destination ideas and saved spots are coming soon." />
    </Screen>
  );
}
```

- [ ] **Step 4: Remove the stray stub**

Run: `git rm mobile/app/\(app\)/saved.tsx`

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms the moved file's import depth and the new screens compile.)

- [ ] **Step 6: Commit**

```bash
git add -A mobile/app
git commit -m "feat(nav): bottom tabs (Trips/Passport/Discover) over the app stack"
```

---

### Task 3: Trips tab — list saved trips with `TripCard`

**Files:**
- Create: `mobile/components/ui/TripCard.tsx`
- Modify: `mobile/components/ui/index.ts` (export `TripCard`)
- Modify: `mobile/app/(app)/(tabs)/index.tsx` (replace launchpad body with the trips list)

**Interfaces:**
- Consumes: `listTrips`, `tripDayCount`, `TripSummary` from `lib/trips`; `supabase` from `lib/supabase`; `useQuery` from `@tanstack/react-query`.
- Produces: `TripCard({ trip, onPress })`; the Trips tab navigates to `/itinerary?tripId=<id>` on card press and to `/onboarding` from the CTA.

- [ ] **Step 1: Create `TripCard`**

Create `mobile/components/ui/TripCard.tsx`:

```tsx
// mobile/components/ui/TripCard.tsx
import { View } from "react-native";
import { Card } from "./Card";
import { Text } from "./Text";
import { tripDayCount, type TripSummary } from "../../lib/trips";

// Phase 1 has no user photos yet — cover is a tinted panel with the destination's
// initial. Phase 2 swaps in the first uploaded photo as the cover.
export function TripCard({ trip, onPress }: { trip: TripSummary; onPress: () => void }) {
  const days = tripDayCount(trip);
  const initial = trip.location.trim().charAt(0).toUpperCase() || "?";
  return (
    <Card onPress={onPress} className="overflow-hidden">
      <View className="h-28 -mx-4 -mt-4 mb-3 bg-accent-soft items-center justify-center">
        <Text className="text-[64px] leading-[64px] font-jakarta-extrabold text-accent opacity-30">{initial}</Text>
      </View>
      <Text variant="heading">{trip.location}</Text>
      <Text variant="caption">{days === 1 ? "1-day trip" : `${days}-day trip`}</Text>
    </Card>
  );
}
```

- [ ] **Step 2: Export it**

In `mobile/components/ui/index.ts`, add after the `EmptyState` export line:

```ts
export { TripCard } from "./TripCard";
```

- [ ] **Step 3: Rewrite the Trips tab**

Replace the entire contents of `mobile/app/(app)/(tabs)/index.tsx`:

```tsx
// mobile/app/(app)/(tabs)/index.tsx
import { View, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { listTrips, type TripSummary } from "../../../lib/trips";
import { Screen, Text, Button, TripCard, EmptyState, Loading } from "../../../components/ui";

export default function Trips() {
  const { user, session } = useAuth();
  const router = useRouter();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  const { data: trips, isLoading, isError, refetch } = useQuery({
    queryKey: ["trips"],
    queryFn: () => listTrips(supabase),
    enabled: !!session,
  });

  function Header() {
    return (
      <View className="flex-row items-center justify-between mb-4">
        <Text variant="title">Your trips</Text>
        {session ? (
          <Pressable
            onPress={() => router.push("/account")}
            className="w-10 h-10 rounded-pill bg-accent-soft items-center justify-center"
          >
            <Text variant="label" className="text-accent">{initial}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (isLoading) {
    return <Screen><Loading label="Loading your trips…" /></Screen>;
  }

  if (isError) {
    return (
      <Screen>
        <Header />
        <EmptyState
          title="Couldn't load your trips"
          subtitle="Check your connection and try again."
          action={<Button title="Retry" onPress={() => refetch()} />}
        />
      </Screen>
    );
  }

  if (!trips || trips.length === 0) {
    return (
      <Screen>
        <Header />
        <View className="flex-1 justify-center gap-3">
          <Text variant="display">Where to next?</Text>
          <Text variant="body" className="text-ink-muted">
            Tell us your vibe and we'll plan a local-feel trip, day by day.
          </Text>
        </View>
        <View className="pb-2">
          <Button title="Plan a trip" onPress={() => router.push("/onboarding")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <FlatList
        data={trips}
        keyExtractor={(t: TripSummary) => t.id}
        contentContainerClassName="gap-3 pb-24"
        renderItem={({ item }) => (
          <TripCard trip={item} onPress={() => router.push({ pathname: "/itinerary", params: { tripId: item.id } })} />
        )}
      />
      <View className="absolute left-6 right-6 bottom-6">
        <Button title="Plan a trip" onPress={() => router.push("/onboarding")} />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the unit suite (no regressions)**

Run: `npx jest`
Expected: all tests PASS (existing suites + Task 1's `trips` tests).

- [ ] **Step 6: Commit**

```bash
git add mobile/components/ui/TripCard.tsx mobile/components/ui/index.ts "mobile/app/(app)/(tabs)/index.tsx"
git commit -m "feat(trips): Trips tab lists saved trips with TripCard"
```

---

### Task 4: Itinerary screen loads a trip by `tripId`

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: `getTrip` from `lib/trips`; `useLocalSearchParams` from `expo-router`; `useQuery` from `@tanstack/react-query`.
- Produces: when navigated as `/itinerary?tripId=<id>` the screen renders that trip's itinerary from the DB; with no `tripId` it renders the in-memory `useTripFlow()` data (unchanged generate flow).

- [ ] **Step 1: Add param-driven data source**

In `mobile/app/(app)/itinerary.tsx`, update the imports at the top:

```tsx
import { useEffect, useMemo, useState } from "react";
import { View, SectionList, Pressable } from "react-native";
import { AppleMaps } from "expo-maps";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTripFlow } from "../../lib/tripFlow";
import { supabase } from "../../lib/supabase";
import { getTrip } from "../../lib/trips";
import { getStopCoords, decodePolyline, formatDwell, numberStops, type StopCoord } from "../../lib/poi";
import { Screen, Text, Button, Card, EmptyState, Loading } from "../../components/ui";
```

- [ ] **Step 2: Resolve the itinerary from param or in-memory flow**

Replace the first three lines of the component body (the `const { data } = useTripFlow();` line through `const [selectedDay, setSelectedDay] = useState(1);`) with:

```tsx
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const flow = useTripFlow();

  const tripQuery = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => getTrip(supabase, tripId as string),
    enabled: !!tripId,
  });

  // When opened from a saved trip use the DB row; otherwise the just-generated flow.
  const data = tripId ? (tripQuery.data ?? undefined) : flow.data;

  const [view, setView] = useState<"list" | "map">("list");
  const [coords, setCoords] = useState<Record<string, StopCoord>>({});
  const [selectedDay, setSelectedDay] = useState(1);
```

(Remove the now-duplicate `const router = useRouter();` that previously sat a few lines below — `router` is declared above now.)

- [ ] **Step 3: Add loading + not-found handling before the `empty` branch**

Immediately after the `const empty = …` line, insert:

```tsx
  if (tripId && tripQuery.isLoading) {
    return <Screen><Loading label="Loading trip…" /></Screen>;
  }

  if (tripId && !tripQuery.isLoading && !data) {
    return (
      <Screen>
        <EmptyState
          title="Trip not found"
          subtitle="It may have been removed."
          action={<Button title="Back to trips" onPress={() => router.replace("/")} />}
        />
      </Screen>
    );
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If tsc reports a duplicate `router` declaration, delete the lower `const router = useRouter();` line as noted in Step 2.)

- [ ] **Step 5: Run the unit suite**

Run: `npx jest`
Expected: all PASS (no test imports this screen; this confirms no shared-module breakage).

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(itinerary): load saved trip by tripId, fall back to in-memory flow"
```

---

### Task 5: Finish the branch

**Files:** none (verification + integration).

- [ ] **Step 1: Full typecheck + test sweep**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc clean; all Jest suites PASS.

- [ ] **Step 2: Manual device/OTA smoke (no new native deps, so OTA-safe)**

Confirm on device or web preview:
- App opens to the **Trips** tab with a bottom tab bar (Trips / Passport / Discover).
- With no saved trips: the "Where to next?" hero + "Plan a trip" CTA shows; CTA opens onboarding.
- After generating a trip (existing flow) the itinerary still renders (in-memory path, no `tripId`).
- Re-open the app, go to Trips: previously generated trips appear as cards; tapping one opens its itinerary loaded from the DB.
- Passport and Discover tabs show their placeholder empty states.
- The avatar on the Trips tab opens the account screen.

- [ ] **Step 3: Integrate**

Invoke the `superpowers:finishing-a-development-branch` skill to choose merge / PR / cleanup.

---

## Self-Review

**Spec coverage (Phase 1 rows of the design doc):**
- Tab nav restructure (Trips/Passport/Discover over the `(app)` stack) → Task 2. ✓
- `lib/trips.ts` (`listTrips`/`getTrip`) → Task 1. ✓
- Trips tab + `TripCard` (cover = gradient/tint + name fallback) → Task 3. ✓
- Itinerary loads by `tripId` from DB; reopen-after-restart works; in-memory fallback intact → Task 4. ✓
- Empty / loading / error states → Task 3 (Trips) + Task 4 (itinerary not-found/loading). ✓
- "Plan a trip" CTA persists → Task 3 (empty state + floating button). ✓
- Account reachable (avatar) → Task 3 Header. ✓
- No new deps / no new tables this phase → honored (emoji icons, reads only). ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code. Passport/Discover screens are intentional placeholder UIs (their real builds are Phases 2/3), not plan placeholders.

**Type consistency:** `TripSummary { id, location, itinerary, createdAt }`, `listTrips`, `getTrip`, `tripDayCount` are defined in Task 1 and consumed with identical signatures in Tasks 3–4. Route param `tripId` is written as `params: { tripId }` (Task 3) and read as `useLocalSearchParams<{ tripId?: string }>()` (Task 4) — consistent.

**Deferred to later phases (not gaps):** user photos/`trip_photos`/Storage, Passport list+map+gallery, Discover content + saved spots, `galleryStyle` setting. All are Phase 2/3 per the design doc.
