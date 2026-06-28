# Tour Guide — Mobile Home Itinerary (Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user completes a multi-step onboarding (travel prefs + trip params), the app saves their profile, generates an itinerary via the existing edge function, and renders it as a day-by-day list with an Apple Maps toggle.

**Architecture:** Reuse the Phase 2a foundation (`useGenerateItinerary`, `useAuth`, `supabase`, mirrored `types.ts`, the auth-gated `(app)` route group). Pure logic lives in testable `lib/` modules (`onboarding.ts`, `profile.ts`, `poi.ts`); a thin `TripFlow` context lifts the generate mutation across the onboarding → generating → itinerary screens; screens are thin views over those modules. Map coordinates come from `cached_pois` (RLS-readable), so no backend change.

**Tech Stack:** Expo SDK 56, TypeScript, Expo Router, `@supabase/supabase-js`, `@tanstack/react-query`, `expo-maps` (Apple Maps on iOS), jest-expo.

## Global Constraints

- App lives in `mobile/` at repo root. All paths below are relative to repo root.
- TypeScript only. **Extensionless imports** (Metro/Expo convention) — never `.ts`/`.tsx` suffixes in import paths.
- `mobile/lib/types.ts` is a **mirror** of `supabase/_shared/types.ts` (backend = source of truth). Do NOT redesign `Prefs`/`Itinerary`/`Stop`/`ItineraryDay`; consume them as-is.
- The Supabase **anon key is public**; data is guarded by RLS. Never add the service-role key or Google/LLM keys to `mobile/`.
- Only pure `lib/` modules get automated tests (jest-expo). Screens/context are thin and verified by `npx tsc --noEmit` + manual device smoke (no React Native Testing Library — YAGNI, per 2a).
- iOS-only app → `expo-maps` uses Apple Maps, **no API key**.
- Interests are a fixed in-app list: `scenic, food, history, nightlife, outdoors, art, shopping`. Trip days bound: `1..14`.
- Run all commands from `mobile/`: `cd mobile`. Test command: `npm test`. Type-check: `npx tsc --noEmit`.

---

## Task Ordering

1. `lib/profile.ts` — profile read/write (TDD)
2. `lib/onboarding.ts` — pure onboarding logic (TDD)
3. `lib/poi.ts` — map coords lookup (TDD)
4. `lib/tripFlow.tsx` + wire into `(app)/_layout.tsx` (type-check)
5. `(app)/index.tsx` — home launchpad (type-check)
6. `(app)/onboarding.tsx` — multi-step wizard (type-check + smoke)
7. `(app)/generating.tsx` — loading/error screen (type-check + smoke)
8. `(app)/itinerary.tsx` + `expo-maps` install/config — list + map (type-check + smoke)

---

### Task 1: `lib/profile.ts` — profile read/write

**Files:**
- Create: `mobile/lib/profile.ts`
- Test: `mobile/lib/profile.test.ts`

**Interfaces:**
- Consumes: `Prefs` from `./types`; `SupabaseClient` from `@supabase/supabase-js`.
- Produces:
  - `getProfile(client: SupabaseClient): Promise<Prefs | null>` — reads the current user's `profiles.default_prefs`; `null` if no user or no row.
  - `upsertProfile(client: SupabaseClient, prefs: Prefs): Promise<void>` — upserts `{ id: user.id, default_prefs: prefs }`.

- [ ] **Step 1: Write the failing test**

Create `mobile/lib/profile.test.ts`:

```typescript
import { getProfile, upsertProfile } from "./profile";
import type { Prefs } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

const prefs: Prefs = { interests: ["food"], budget: "mid", pace: "balanced" };

function fakeClient(opts: {
  user?: { id: string } | null;
  selectResult?: { data: unknown; error: unknown };
  upsertResult?: { error: unknown };
  onUpsert?: (row: unknown) => void;
}): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: opts.user === undefined ? { id: "u1" } : opts.user } }) },
    from: (_table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => opts.selectResult ?? { data: null, error: null } }) }),
      upsert: async (row: unknown) => { opts.onUpsert?.(row); return opts.upsertResult ?? { error: null }; },
    }),
  } as unknown as SupabaseClient;
}

test("getProfile returns prefs from default_prefs", async () => {
  const client = fakeClient({ selectResult: { data: { default_prefs: prefs }, error: null } });
  expect(await getProfile(client)).toEqual(prefs);
});

test("getProfile returns null when no row", async () => {
  const client = fakeClient({ selectResult: { data: null, error: null } });
  expect(await getProfile(client)).toBeNull();
});

test("getProfile returns null when no user", async () => {
  const client = fakeClient({ user: null });
  expect(await getProfile(client)).toBeNull();
});

test("getProfile throws on query error", async () => {
  const client = fakeClient({ selectResult: { data: null, error: { message: "boom" } } });
  await expect(getProfile(client)).rejects.toBeTruthy();
});

test("upsertProfile upserts id + default_prefs", async () => {
  let row: unknown;
  const client = fakeClient({ onUpsert: (r) => { row = r; } });
  await upsertProfile(client, prefs);
  expect(row).toEqual({ id: "u1", default_prefs: prefs });
});

test("upsertProfile throws when not authenticated", async () => {
  const client = fakeClient({ user: null });
  await expect(upsertProfile(client, prefs)).rejects.toBeTruthy();
});

test("upsertProfile throws on upsert error", async () => {
  const client = fakeClient({ upsertResult: { error: { message: "no" } } });
  await expect(upsertProfile(client, prefs)).rejects.toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- profile`
Expected: FAIL — `Cannot find module './profile'`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/lib/profile.ts`:

```typescript
// mobile/lib/profile.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Prefs } from "./types";

export async function getProfile(client: SupabaseClient): Promise<Prefs | null> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const { data, error } = await client
    .from("profiles")
    .select("default_prefs")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  const prefs = (data?.default_prefs ?? null) as Prefs | null;
  return prefs && Array.isArray(prefs.interests) ? prefs : null;
}

export async function upsertProfile(client: SupabaseClient, prefs: Prefs): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { error } = await client.from("profiles").upsert({ id: user.id, default_prefs: prefs });
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npm test -- profile`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/profile.ts mobile/lib/profile.test.ts
git commit -m "feat(mobile): profile read/write (getProfile/upsertProfile)"
```

---

### Task 2: `lib/onboarding.ts` — pure onboarding logic

**Files:**
- Create: `mobile/lib/onboarding.ts`
- Test: `mobile/lib/onboarding.test.ts`

**Interfaces:**
- Consumes: `Prefs` from `./types`; `GenerateRequest` from `./api`.
- Produces:
  - `INTERESTS: readonly string[]`, `MAX_TRIP_DAYS: number`
  - `interface OnboardingState { interests: string[]; budget: Prefs["budget"]; pace: Prefs["pace"]; location: string; tripDays: number }`
  - `stateFromProfile(prefs: Prefs | null): OnboardingState`
  - `canContinue(step: number, s: OnboardingState): boolean`
  - `prefsFromState(s: OnboardingState): Prefs`
  - `buildRequest(s: OnboardingState): GenerateRequest`

- [ ] **Step 1: Write the failing test**

Create `mobile/lib/onboarding.test.ts`:

```typescript
import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, canContinue, prefsFromState, buildRequest,
  type OnboardingState,
} from "./onboarding";
import type { Prefs } from "./types";

const base: OnboardingState = {
  interests: ["food"], budget: "mid", pace: "balanced", location: "Lisbon", tripDays: 3,
};

test("INTERESTS has the fixed taxonomy", () => {
  expect(INTERESTS).toEqual(["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"]);
});

test("stateFromProfile seeds from prefs, blank trip fields", () => {
  const prefs: Prefs = { interests: ["art"], budget: "high", pace: "packed" };
  const s = stateFromProfile(prefs);
  expect(s.interests).toEqual(["art"]);
  expect(s.budget).toBe("high");
  expect(s.pace).toBe("packed");
  expect(s.location).toBe("");
  expect(s.tripDays).toBeGreaterThanOrEqual(1);
});

test("stateFromProfile uses defaults when null", () => {
  const s = stateFromProfile(null);
  expect(s.interests).toEqual([]);
  expect(s.budget).toBe("mid");
  expect(s.pace).toBe("balanced");
});

test("canContinue step 0 needs >=1 interest", () => {
  expect(canContinue(0, { ...base, interests: [] })).toBe(false);
  expect(canContinue(0, { ...base, interests: ["food"] })).toBe(true);
});

test("canContinue step 1 needs location and valid tripDays", () => {
  expect(canContinue(1, { ...base, location: "  " })).toBe(false);
  expect(canContinue(1, { ...base, tripDays: 0 })).toBe(false);
  expect(canContinue(1, { ...base, tripDays: MAX_TRIP_DAYS + 1 })).toBe(false);
  expect(canContinue(1, base)).toBe(true);
});

test("canContinue step 2 (review) is always true", () => {
  expect(canContinue(2, base)).toBe(true);
});

test("prefsFromState drops trip fields", () => {
  expect(prefsFromState(base)).toEqual({ interests: ["food"], budget: "mid", pace: "balanced" });
});

test("buildRequest trims location and carries prefs", () => {
  expect(buildRequest({ ...base, location: "  Porto " })).toEqual({
    location: "Porto",
    tripDays: 3,
    prefs: { interests: ["food"], budget: "mid", pace: "balanced" },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- onboarding`
Expected: FAIL — `Cannot find module './onboarding'`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/lib/onboarding.ts`:

```typescript
// mobile/lib/onboarding.ts
import type { Prefs } from "./types";
import type { GenerateRequest } from "./api";

export const INTERESTS = ["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"] as const;
export const MAX_TRIP_DAYS = 14;

export interface OnboardingState {
  interests: string[];
  budget: Prefs["budget"];
  pace: Prefs["pace"];
  location: string;
  tripDays: number;
}

export function stateFromProfile(prefs: Prefs | null): OnboardingState {
  return {
    interests: prefs?.interests ?? [],
    budget: prefs?.budget ?? "mid",
    pace: prefs?.pace ?? "balanced",
    location: "",
    tripDays: 3,
  };
}

export function canContinue(step: number, s: OnboardingState): boolean {
  if (step === 0) return s.interests.length >= 1;
  if (step === 1) return s.location.trim().length > 0 && s.tripDays >= 1 && s.tripDays <= MAX_TRIP_DAYS;
  return true;
}

export function prefsFromState(s: OnboardingState): Prefs {
  return { interests: s.interests, budget: s.budget, pace: s.pace };
}

export function buildRequest(s: OnboardingState): GenerateRequest {
  return { location: s.location.trim(), tripDays: s.tripDays, prefs: prefsFromState(s) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npm test -- onboarding`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts
git commit -m "feat(mobile): pure onboarding state/validation/request helpers"
```

---

### Task 3: `lib/poi.ts` — map coords lookup from `cached_pois`

**Files:**
- Create: `mobile/lib/poi.ts`
- Test: `mobile/lib/poi.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`.
- Produces:
  - `interface StopCoord { lat: number; lng: number; name: string }`
  - `getStopCoords(client: SupabaseClient, placeIds: string[]): Promise<Record<string, StopCoord>>`

- [ ] **Step 1: Write the failing test**

Create `mobile/lib/poi.test.ts`:

```typescript
import { getStopCoords } from "./poi";
import type { SupabaseClient } from "@supabase/supabase-js";

function fakeClient(opts: {
  result?: { data: unknown; error: unknown };
  onIn?: (col: string, ids: string[]) => void;
}): SupabaseClient {
  return {
    from: (_table: string) => ({
      select: () => ({
        in: (col: string, ids: string[]) => { opts.onIn?.(col, ids); return Promise.resolve(opts.result ?? { data: [], error: null }); },
      }),
    }),
  } as unknown as SupabaseClient;
}

test("returns {} for empty placeIds without querying", async () => {
  let called = false;
  const client = fakeClient({ onIn: () => { called = true; } });
  expect(await getStopCoords(client, [])).toEqual({});
  expect(called).toBe(false);
});

test("maps cached_pois payload to coords keyed by place_id", async () => {
  const client = fakeClient({
    result: {
      data: [
        { place_id: "A", payload: { lat: 1, lng: 2, name: "Alpha" } },
        { place_id: "B", payload: { lat: 3, lng: 4, name: "Beta" } },
      ],
      error: null,
    },
  });
  expect(await getStopCoords(client, ["A", "B"])).toEqual({
    A: { lat: 1, lng: 2, name: "Alpha" },
    B: { lat: 3, lng: 4, name: "Beta" },
  });
});

test("queries place_id with the given ids", async () => {
  let col = ""; let ids: string[] = [];
  const client = fakeClient({ onIn: (c, i) => { col = c; ids = i; } });
  await getStopCoords(client, ["X"]);
  expect(col).toBe("place_id");
  expect(ids).toEqual(["X"]);
});

test("throws on query error", async () => {
  const client = fakeClient({ result: { data: null, error: { message: "boom" } } });
  await expect(getStopCoords(client, ["A"])).rejects.toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npm test -- poi`
Expected: FAIL — `Cannot find module './poi'`.

- [ ] **Step 3: Write minimal implementation**

Create `mobile/lib/poi.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npm test -- poi`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/poi.ts mobile/lib/poi.test.ts
git commit -m "feat(mobile): cached_pois coords lookup for map pins"
```

---

### Task 4: `lib/tripFlow.tsx` — TripFlow context + wire into `(app)/_layout.tsx`

**Files:**
- Create: `mobile/lib/tripFlow.tsx`
- Modify: `mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `useGenerateItinerary` from `./useGenerateItinerary`; `GenerateRequest`, `GenerateResult`, `ApiError` from `./api`.
- Produces:
  - `TripFlowProvider({ children }): JSX.Element`
  - `useTripFlow(): { generate(req: GenerateRequest): void; status: "idle" | "pending" | "success" | "error"; data: GenerateResult | undefined; error: ApiError | null; lastRequest: GenerateRequest | null; reset(): void }`

> No automated test: this is a thin wrapper over the already-tested `useGenerateItinerary` mutation (TanStack manages the state). Verified by type-check and consumed by the screens. (Matches 2a's treatment of `auth.tsx`.)

- [ ] **Step 1: Write `lib/tripFlow.tsx`**

Create `mobile/lib/tripFlow.tsx`:

```typescript
// mobile/lib/tripFlow.tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { useGenerateItinerary } from "./useGenerateItinerary";
import type { ApiError, GenerateRequest, GenerateResult } from "./api";

interface TripFlowValue {
  generate(req: GenerateRequest): void;
  status: "idle" | "pending" | "success" | "error";
  data: GenerateResult | undefined;
  error: ApiError | null;
  lastRequest: GenerateRequest | null;
  reset(): void;
}

const TripFlowContext = createContext<TripFlowValue | null>(null);

export function TripFlowProvider({ children }: { children: ReactNode }) {
  const mutation = useGenerateItinerary();
  const [lastRequest, setLastRequest] = useState<GenerateRequest | null>(null);

  function generate(req: GenerateRequest) {
    setLastRequest(req);
    mutation.mutate(req);
  }

  function reset() {
    setLastRequest(null);
    mutation.reset();
  }

  return (
    <TripFlowContext.Provider
      value={{
        generate,
        status: mutation.status,
        data: mutation.data,
        error: mutation.error,
        lastRequest,
        reset,
      }}
    >
      {children}
    </TripFlowContext.Provider>
  );
}

export function useTripFlow(): TripFlowValue {
  const ctx = useContext(TripFlowContext);
  if (!ctx) throw new Error("useTripFlow must be used within TripFlowProvider");
  return ctx;
}
```

- [ ] **Step 2: Wire the provider into the `(app)` layout**

Replace the contents of `mobile/app/(app)/_layout.tsx`:

```typescript
// mobile/app/(app)/_layout.tsx
import { Stack } from "expo-router";
import { TripFlowProvider } from "../../lib/tripFlow";

export default function AppLayout() {
  return (
    <TripFlowProvider>
      <Stack screenOptions={{ headerShown: true }} />
    </TripFlowProvider>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite (no regressions)**

Run: `cd mobile && npm test`
Expected: PASS (existing `api` tests + Tasks 1–3 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/tripFlow.tsx "mobile/app/(app)/_layout.tsx"
git commit -m "feat(mobile): TripFlow context lifting generate across screens"
```

---

### Task 5: `(app)/index.tsx` — home launchpad

**Files:**
- Modify: `mobile/app/(app)/index.tsx`

**Interfaces:**
- Consumes: `useAuth` from `../../lib/auth`; `useRouter` from `expo-router`.
- Produces: a "Plan a trip" button that navigates to `/onboarding`; keeps sign-out.

> No automated test (thin screen). Verified by type-check + smoke.

- [ ] **Step 1: Replace `index.tsx`**

Replace the contents of `mobile/app/(app)/index.tsx`:

```typescript
// mobile/app/(app)/index.tsx
import { View, Text, Button } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";

export default function Home() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Plan your trip</Text>
      <Text style={{ color: "#888" }}>Signed in as {user?.email ?? user?.id}</Text>
      <Button title="Plan a trip" onPress={() => router.push("/onboarding")} />
      <Button title="Sign out" onPress={signOut} />
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/index.tsx"
git commit -m "feat(mobile): home launchpad routes to onboarding"
```

---

### Task 6: `(app)/onboarding.tsx` — multi-step wizard

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `INTERESTS`, `MAX_TRIP_DAYS`, `stateFromProfile`, `canContinue`, `buildRequest`, `prefsFromState`, `type OnboardingState` from `../../lib/onboarding`; `getProfile`, `upsertProfile` from `../../lib/profile`; `supabase` from `../../lib/supabase`; `useTripFlow` from `../../lib/tripFlow`; `useRouter` from `expo-router`.
- Produces: a 3-step wizard. On Generate: best-effort `upsertProfile`, then `tripFlow.generate(buildRequest(state))`, then navigate to `/generating`.

> No automated test (thin screen; its logic is the already-tested `lib/onboarding.ts`). Verified by type-check + smoke.

- [ ] **Step 1: Replace `onboarding.tsx`**

Replace the contents of `mobile/app/(app)/onboarding.tsx`:

```typescript
// mobile/app/(app)/onboarding.tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, Button, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, canContinue, buildRequest, prefsFromState,
  type OnboardingState,
} from "../../lib/onboarding";
import { getProfile, upsertProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useTripFlow } from "../../lib/tripFlow";
import type { Prefs } from "../../lib/types";

const BUDGETS: Prefs["budget"][] = ["low", "mid", "high"];
const PACES: Prefs["pace"][] = ["relaxed", "balanced", "packed"];

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1,
        borderColor: active ? "#2563eb" : "#ccc", backgroundColor: active ? "#dbeafe" : "transparent",
      }}
    >
      <Text style={{ color: active ? "#1e3a8a" : "#333" }}>{label}</Text>
    </Pressable>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const tripFlow = useTripFlow();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(stateFromProfile(null));

  useEffect(() => {
    getProfile(supabase).then((prefs) => setState(stateFromProfile(prefs))).catch(() => {});
  }, []);

  function toggleInterest(i: string) {
    setState((s) => ({
      ...s,
      interests: s.interests.includes(i) ? s.interests.filter((x) => x !== i) : [...s.interests, i],
    }));
  }

  async function onGenerate() {
    try { await upsertProfile(supabase, prefsFromState(state)); } catch { /* best-effort */ }
    tripFlow.generate(buildRequest(state));
    router.push("/generating");
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
      {step === 0 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>What do you like?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {INTERESTS.map((i) => (
              <Chip key={i} label={i} active={state.interests.includes(i)} onPress={() => toggleInterest(i)} />
            ))}
          </View>
          <Text style={{ fontWeight: "600" }}>Budget</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {BUDGETS.map((b) => (
              <Chip key={b} label={b} active={state.budget === b} onPress={() => setState((s) => ({ ...s, budget: b }))} />
            ))}
          </View>
          <Text style={{ fontWeight: "600" }}>Pace</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {PACES.map((p) => (
              <Chip key={p} label={p} active={state.pace === p} onPress={() => setState((s) => ({ ...s, pace: p }))} />
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>Where and how long?</Text>
          <TextInput
            placeholder="Location (e.g. Lisbon)"
            value={state.location}
            onChangeText={(t) => setState((s) => ({ ...s, location: t }))}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
          />
          <Text style={{ fontWeight: "600" }}>Days: {state.tripDays}</Text>
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Button title="−" onPress={() => setState((s) => ({ ...s, tripDays: Math.max(1, s.tripDays - 1) }))} />
            <Button title="+" onPress={() => setState((s) => ({ ...s, tripDays: Math.min(MAX_TRIP_DAYS, s.tripDays + 1) }))} />
          </View>
        </View>
      )}

      {step === 2 && (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>Review</Text>
          <Text>Location: {state.location}</Text>
          <Text>Days: {state.tripDays}</Text>
          <Text>Interests: {state.interests.join(", ")}</Text>
          <Text>Budget: {state.budget} · Pace: {state.pace}</Text>
        </View>
      )}

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        <Button title="Back" disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))} />
        {step < 2 ? (
          <Button title="Next" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} />
        ) : (
          <Button title="Generate" onPress={onGenerate} />
        )}
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(mobile): multi-step onboarding wizard (prefs + trip)"
```

---

### Task 7: `(app)/generating.tsx` — loading / error screen

**Files:**
- Modify: `mobile/app/(app)/generating.tsx`

**Interfaces:**
- Consumes: `useTripFlow` from `../../lib/tripFlow`; `useRouter` from `expo-router`.
- Produces: spinner while `status === "pending"`; on `"success"` navigates to `/itinerary`; on `"error"` shows message + Try again + Edit.

> No automated test (thin screen). Verified by type-check + smoke.

- [ ] **Step 1: Replace `generating.tsx`**

Replace the contents of `mobile/app/(app)/generating.tsx`:

```typescript
// mobile/app/(app)/generating.tsx
import { useEffect } from "react";
import { View, Text, ActivityIndicator, Button } from "react-native";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";

export default function Generating() {
  const { status, error, lastRequest, generate } = useTripFlow();
  const router = useRouter();

  useEffect(() => {
    if (status === "success") router.replace("/itinerary");
  }, [status]);

  if (status === "error") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Couldn't build your itinerary</Text>
        <Text style={{ color: "#888", textAlign: "center" }}>{error?.message ?? "Something went wrong."}</Text>
        <Button title="Try again" onPress={() => lastRequest && generate(lastRequest)} />
        <Button title="Edit trip" onPress={() => router.replace("/onboarding")} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
      <ActivityIndicator size="large" />
      <Text>Building your itinerary…</Text>
    </View>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(app)/generating.tsx"
git commit -m "feat(mobile): generating screen (loading + error/retry)"
```

---

### Task 8: `(app)/itinerary.tsx` + `expo-maps` — list + map toggle

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`, `mobile/app.config.ts`, `mobile/package.json` (via install)

**Interfaces:**
- Consumes: `useTripFlow` from `../../lib/tripFlow`; `getStopCoords`, `type StopCoord` from `../../lib/poi`; `supabase` from `../../lib/supabase`; `AppleMaps` from `expo-maps`; `useRouter` from `expo-router`.
- Produces: the itinerary result screen — day list + Apple Maps toggle; empty state.

> No automated test (thin screen + native map). Verified by type-check + device smoke. Confirm the `expo-maps` SDK 56 marker/camera API against `https://docs.expo.dev/versions/v56.0.0/sdk/maps/` before coding (per `mobile/AGENTS.md`); the props used below are `AppleMaps.View` with `cameraPosition={{ coordinates: { latitude, longitude }, zoom }}` and `markers={[{ id, coordinates: { latitude, longitude }, title }]}`.

- [ ] **Step 1: Install expo-maps**

Run: `cd mobile && npx expo install expo-maps`
Expected: `expo-maps` added to `package.json` dependencies.

- [ ] **Step 2: Register the config plugin**

In `mobile/app.config.ts`, add `"expo-maps"` to the `plugins` array (alongside the existing plugins). The plugins array becomes (append the last entry):

```typescript
  plugins: [
    ...(config.plugins ?? []),
    "expo-apple-authentication",
    ["@react-native-google-signin/google-signin", { iosUrlScheme: googleIosUrlScheme }],
    [
      "expo-build-properties",
      {
        ios: {
          extraPods: [
            { name: "GoogleUtilities", modular_headers: true },
            { name: "RecaptchaInterop", modular_headers: true },
          ],
        },
      },
    ],
    "expo-maps",
  ],
```

- [ ] **Step 3: Replace `itinerary.tsx`**

Replace the contents of `mobile/app/(app)/itinerary.tsx`:

```typescript
// mobile/app/(app)/itinerary.tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, SectionList, Button, Pressable } from "react-native";
import { AppleMaps } from "expo-maps";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";
import { supabase } from "../../lib/supabase";
import { getStopCoords, type StopCoord } from "../../lib/poi";

export default function Itinerary() {
  const { data } = useTripFlow();
  const router = useRouter();
  const [view, setView] = useState<"list" | "map">("list");
  const [coords, setCoords] = useState<Record<string, StopCoord>>({});

  const days = data?.itinerary.days ?? [];
  const empty = days.length === 0 || days.every((d) => d.stops.length === 0);

  const placeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of days) {
      if (d.lodgingPlaceId) ids.add(d.lodgingPlaceId);
      d.stops.forEach((s) => ids.add(s.placeId));
    }
    return [...ids];
  }, [data]);

  useEffect(() => {
    if (placeIds.length) getStopCoords(supabase, placeIds).then(setCoords).catch(() => {});
  }, [placeIds]);

  if (empty) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Limited data here</Text>
        <Text style={{ color: "#888", textAlign: "center" }}>Try a broader location.</Text>
        <Button title="Edit trip" onPress={() => router.replace("/onboarding")} />
      </View>
    );
  }

  const markers = placeIds
    .map((id) => coords[id])
    .filter((c): c is StopCoord => !!c)
    .map((c, idx) => ({ id: String(idx), coordinates: { latitude: c.lat, longitude: c.lng }, title: c.name }));

  const sections = days.map((d) => ({
    title: `Day ${d.day}`,
    lodging: d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined,
    data: d.stops,
  }));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, padding: 12 }}>
        <Pressable onPress={() => setView("list")}><Text style={{ fontWeight: view === "list" ? "700" : "400" }}>List</Text></Pressable>
        <Text>·</Text>
        <Pressable onPress={() => setView("map")}><Text style={{ fontWeight: view === "map" ? "700" : "400" }}>Map</Text></Pressable>
      </View>

      {view === "map" ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={markers[0] ? { coordinates: markers[0].coordinates, zoom: 11 } : undefined}
          markers={markers}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.placeId + i}
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: "#f3f4f6", padding: 12 }}>
              <Text style={{ fontWeight: "700" }}>{section.title}</Text>
              {section.lodging ? <Text style={{ color: "#888" }}>Stay: {section.lodging}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
              <Text style={{ fontWeight: "600" }}>{item.name}</Text>
              <Text style={{ color: "#444" }}>{item.blurb}</Text>
              {item.travelMinutesFromPrev != null ? (
                <Text style={{ color: "#888", fontSize: 12 }}>{item.travelMinutesFromPrev} min from previous</Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. (If `expo-maps` types complain about `cameraPosition={undefined}`, pass a default coordinate object instead — verify against the SDK 56 docs noted above.)

- [ ] **Step 5: Run the full test suite (no regressions)**

Run: `cd mobile && npm test`
Expected: PASS (all `lib` tests; no screen tests).

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/itinerary.tsx" mobile/app.config.ts mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): itinerary list + Apple Maps toggle"
```

---

## Final Verification (after all tasks)

- [ ] `cd mobile && npm test` — all `lib` unit tests pass.
- [ ] `cd mobile && npx tsc --noEmit` — clean.
- [ ] **Device smoke** (dev build, not Expo Go — native modules): sign in → Home "Plan a trip" → onboarding (interests/budget/pace → location/days → review) → Generate → spinner → itinerary list renders days/stops → toggle Map shows pins. Force an error (bad location or offline) → error screen with Try again / Edit. Force thin data → empty state.
- [ ] Use superpowers:finishing-a-development-branch to integrate. **Do not push unless asked** (per dev-workflow).

## Notes / Risks

- `expo-maps` is alpha — if the SDK 56 marker/camera prop names differ from those in Task 8, fix per the versioned docs; the list view is the primary renderer and is unaffected.
- A new native dep (`expo-maps`) requires a **new EAS dev build** before the map shows on device; the JS-only tasks (1–7) run in the existing dev build.
- The trip is persisted server-side by the edge function (`saveTrip`); the saved-trips list that consumes it is Phase 2c.
