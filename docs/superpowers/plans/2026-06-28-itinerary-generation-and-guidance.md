# Itinerary Generation & Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make itinerary generation granularity-aware (landmark/city/country) and transport-aware (new user preference), and turn the itinerary view into a guided, per-day map with a real route line.

**Architecture:** Resolve every destination to one coherent focus area via Google Place Details (center + viewport), size that area by a new 3-level transport preference, fetch POIs with a `locationBias`, route with the matching travel mode, and render each day's ordered stops + decoded route polyline on AppleMaps.

**Tech Stack:** Deno edge functions (`jsr:@std/assert` tests), Google Places API (New) + Routes API, React Native / Expo SDK 56, NativeWind, jest, `@react-native-picker/picker`, expo-maps (AppleMaps).

## Global Constraints

- iOS-only (AppleMaps). Do not add Android-specific code.
- Backend is the source of truth for types; `mobile/lib/types.ts` is a hand-kept mirror — update both together.
- Backend tests: Deno (`*_test.ts`, `jsr:@std/assert`), run `deno test`. Mobile tests: jest (`*.test.ts`), run `npm test` from `mobile/`.
- No DB migration: `profiles.default_prefs` and `trips.itinerary` are JSON columns.
- Transport levels are exactly `"compact" | "balanced" | "far"`.
- Places searchText `locationBias.circle.radius` max is 50000 m — cap the bias radius there.
- Expo deps installed via `npx expo install`, never raw `npm install`.
- Read https://docs.expo.dev/versions/v56.0.0/ before writing Expo/RN code (per `mobile/AGENTS.md`).

---

## Phase A — Destination resolution (foundation)

### Task A1: Autocomplete returns `{text, placeId}` + destination type filter

**Files:**
- Modify: `supabase/_shared/places.ts` (`searchAutocomplete`, ~lines 71-93)
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Produces: `searchAutocomplete(opts) => Promise<{ text: string; placeId: string }[]>`

- [ ] **Step 1: Update the failing tests**

Replace the two `searchAutocomplete` tests in `places_test.ts` with:

```ts
Deno.test("searchAutocomplete sends includedPrimaryTypes and maps text+placeId", async () => {
  let sentBody: any = null;
  const httpFetch = ((_url: string, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify({
      suggestions: [
        { placePrediction: { placeId: "p1", text: { text: "Lisbon, Portugal" } } },
        { placePrediction: { placeId: "p2", text: { text: "Lisbon, OH, USA" } } },
      ],
    }), { status: 200 }));
  }) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "Lis", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(out, [
    { text: "Lisbon, Portugal", placeId: "p1" },
    { text: "Lisbon, OH, USA", placeId: "p2" },
  ]);
  assertEquals(sentBody.includedPrimaryTypes, ["locality", "administrative_area_level_1", "country", "tourist_attraction"]);
});

Deno.test("searchAutocomplete returns [] for empty suggestions", async () => {
  const httpFetch = (() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "zzzz", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(out, []);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: FAIL (shape mismatch / `includedPrimaryTypes` undefined).

- [ ] **Step 3: Implement**

In `places.ts`, change `searchAutocomplete`:

```ts
export async function searchAutocomplete(opts: {
  query: string;
  httpFetch: HttpFetch;
  apiKey: string;
}): Promise<{ text: string; placeId: string }[]> {
  const { query, httpFetch, apiKey } = opts;
  const res = await httpFetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input: query,
      includedPrimaryTypes: ["locality", "administrative_area_level_1", "country", "tourist_attraction"],
    }),
  });
  if (!res.ok) throw new Error(`autocomplete: HTTP ${res.status}`);
  const data = await res.json() as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
  };
  return (data.suggestions ?? [])
    .map((s) => ({ text: s.placePrediction?.text?.text ?? "", placeId: s.placePrediction?.placeId ?? "" }))
    .filter((s) => s.text && s.placeId)
    .slice(0, 5);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat(backend): autocomplete returns placeId + filters to destination types"
```

---

### Task A2: Autocomplete handler + edge function pass the new shape

**Files:**
- Modify: `supabase/functions/places-autocomplete/handler.ts`
- Modify: `supabase/functions/places-autocomplete/index.ts:10-12`
- Test: `supabase/functions/places-autocomplete/handler_test.ts`

**Interfaces:**
- Consumes: `searchAutocomplete => {text, placeId}[]` (Task A1)
- Produces: response body `{ suggestions: { text: string; placeId: string }[] }`

- [ ] **Step 1: Update the failing test**

In `handler_test.ts`, change the `AutocompleteDeps.search` mock and assertions to use the object shape. Add/replace the happy-path test:

```ts
Deno.test("handleAutocomplete returns suggestion objects", async () => {
  const out = await handleAutocomplete({ query: "Lisbon" }, {
    search: () => Promise.resolve([{ text: "Lisbon, Portugal", placeId: "p1" }]),
  });
  assertEquals(out.status, 200);
  assertEquals(out.body, { suggestions: [{ text: "Lisbon, Portugal", placeId: "p1" }] });
});
```

Keep the existing "query too short" (400) and upstream-error (502) tests; update their `search` mocks to return `[]`/throw with the new type as needed.

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test functions/places-autocomplete/handler_test.ts`
Expected: FAIL (type mismatch).

- [ ] **Step 3: Implement**

In `handler.ts` change the dep type:

```ts
export interface AutocompleteDeps {
  search(query: string): Promise<{ text: string; placeId: string }[]>;
}
```

The body of `handleAutocomplete` is unchanged (it already wraps `{ suggestions }`). `index.ts` needs no change beyond type-flow (the `search` wiring already calls `searchAutocomplete`); confirm it compiles.

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test functions/places-autocomplete/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/places-autocomplete/
git commit -m "feat(backend): autocomplete endpoint returns {text, placeId} suggestions"
```

---

### Task A3: `fetchPlaceDetails` helper

**Files:**
- Modify: `supabase/_shared/places.ts` (add export)
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Produces:
  ```ts
  fetchPlaceDetails(opts: { placeId: string; httpFetch: HttpFetch; apiKey: string }): Promise<{
    center: { lat: number; lng: number };
    viewport: { low: { lat: number; lng: number }; high: { lat: number; lng: number } } | null;
    types: string[];
    name: string;
  }>
  ```

- [ ] **Step 1: Write the failing test**

```ts
Deno.test("fetchPlaceDetails parses center, viewport, types", async () => {
  let sawUrl = "", sawMask = "";
  const httpFetch = ((url: string, init?: RequestInit) => {
    sawUrl = url;
    sawMask = (init?.headers as Record<string, string>)["X-Goog-FieldMask"] ?? "";
    return Promise.resolve(new Response(JSON.stringify({
      location: { latitude: 38.7, longitude: -9.1 },
      viewport: { low: { latitude: 38.6, longitude: -9.2 }, high: { latitude: 38.8, longitude: -9.0 } },
      types: ["locality", "political"],
      displayName: { text: "Lisbon" },
    }), { status: 200 }));
  }) as unknown as typeof fetch;
  const d = await fetchPlaceDetails({ placeId: "p1", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(d.center, { lat: 38.7, lng: -9.1 });
  assertEquals(d.viewport, { low: { lat: 38.6, lng: -9.2 }, high: { lat: 38.8, lng: -9.0 } });
  assertEquals(d.types, ["locality", "political"]);
  assertEquals(d.name, "Lisbon");
  assert(sawUrl.includes("/v1/places/p1"));
  assert(sawMask.includes("viewport"));
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: FAIL (`fetchPlaceDetails` not exported).

- [ ] **Step 3: Implement**

Add to `places.ts`:

```ts
const DETAILS_FIELD_MASK = "location,viewport,types,displayName";

export async function fetchPlaceDetails(opts: {
  placeId: string; httpFetch: HttpFetch; apiKey: string;
}): Promise<{
  center: { lat: number; lng: number };
  viewport: { low: { lat: number; lng: number }; high: { lat: number; lng: number } } | null;
  types: string[];
  name: string;
}> {
  const { placeId, httpFetch, apiKey } = opts;
  const res = await httpFetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
  });
  if (!res.ok) throw new Error(`place details: HTTP ${res.status}`);
  const d = await res.json() as {
    location?: { latitude?: number; longitude?: number };
    viewport?: { low?: { latitude?: number; longitude?: number }; high?: { latitude?: number; longitude?: number } };
    types?: string[];
    displayName?: { text?: string };
  };
  const pt = (p?: { latitude?: number; longitude?: number }) => ({ lat: p?.latitude ?? 0, lng: p?.longitude ?? 0 });
  return {
    center: pt(d.location),
    viewport: d.viewport?.low && d.viewport?.high ? { low: pt(d.viewport.low), high: pt(d.viewport.high) } : null,
    types: d.types ?? [],
    name: d.displayName?.text ?? "",
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat(backend): add fetchPlaceDetails (center/viewport/types)"
```

---

### Task A4: Mobile `autocompletePlaces` returns `{text, placeId}`

**Files:**
- Modify: `mobile/lib/placesClient.ts`
- Test: `mobile/lib/placesClient.test.ts`

**Interfaces:**
- Produces: `autocompletePlaces(opts) => Promise<{ text: string; placeId: string }[]>`

- [ ] **Step 1: Update the failing test**

In `placesClient.test.ts`, make the mocked response return `{ suggestions: [{ text, placeId }] }` and assert the returned array of objects. Keep the `< 2 chars → []` test.

```ts
it("returns suggestion objects", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ suggestions: [{ text: "Lisbon, Portugal", placeId: "p1" }] }),
  }) as unknown as typeof fetch;
  const out = await autocompletePlaces({ query: "Lis", baseUrl: "http://x", anonKey: "k", fetchImpl });
  expect(out).toEqual([{ text: "Lisbon, Portugal", placeId: "p1" }]);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- placesClient`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export async function autocompletePlaces(opts: {
  query: string; baseUrl: string; anonKey: string; fetchImpl?: typeof fetch;
}): Promise<{ text: string; placeId: string }[]> {
  const query = opts.query.trim();
  if (query.length < 2) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/places-autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": opts.anonKey, "Authorization": `Bearer ${opts.anonKey}` },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`autocomplete failed (${res.status})`);
  const data = await res.json() as { suggestions?: { text: string; placeId: string }[] };
  return data.suggestions ?? [];
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- placesClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/placesClient.ts mobile/lib/placesClient.test.ts
git commit -m "feat(mobile): placesClient returns {text, placeId}"
```

---

### Task A5: Carry `destinationPlaceId` through onboarding → request

**Files:**
- Modify: `mobile/lib/api.ts:4-8` (`GenerateRequest`)
- Modify: `supabase/functions/generate-itinerary/handler.ts:7-11` (`GenerateRequest`)
- Modify: `mobile/lib/onboarding.ts` (`OnboardingState`, `buildRequest`)
- Modify: `mobile/app/(app)/onboarding.tsx` (suggestion shape + store placeId)
- Test: `mobile/lib/onboarding.test.ts`

**Interfaces:**
- Produces: `GenerateRequest.destinationPlaceId?: string`; `OnboardingState.destinationPlaceId?: string`

- [ ] **Step 1: Write the failing test**

Add to `onboarding.test.ts`:

```ts
it("buildRequest includes destinationPlaceId when set", () => {
  const s = { ...stateFromProfile(null), location: "Lisbon", destinationPlaceId: "p1" };
  expect(buildRequest(s).destinationPlaceId).toBe("p1");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- onboarding`
Expected: FAIL (`destinationPlaceId` not on type/result).

- [ ] **Step 3: Implement**

`mobile/lib/api.ts` and `supabase/functions/generate-itinerary/handler.ts` — add to `GenerateRequest`:

```ts
  destinationPlaceId?: string;
```

`mobile/lib/onboarding.ts`:

```ts
export interface OnboardingState {
  interests: string[];
  budget: Prefs["budget"];
  pace: Prefs["pace"];
  location: string;
  tripDays: number;
  destinationPlaceId?: string;
}
```

In `stateFromProfile` add `destinationPlaceId: undefined,`. In `buildRequest`:

```ts
export function buildRequest(s: OnboardingState): GenerateRequest {
  return { location: s.location.trim(), tripDays: s.tripDays, prefs: prefsFromState(s), destinationPlaceId: s.destinationPlaceId };
}
```

`mobile/app/(app)/onboarding.tsx`:
- `suggestions` state becomes `{ text: string; placeId: string }[]`.
- Render `sug.text`; key `sug.placeId`.
- On press: `setState((s) => ({ ...s, location: sug.text, destinationPlaceId: sug.placeId }))`.
- On manual `onChangeText`: clear placeId — `setState((s) => ({ ...s, location: t, destinationPlaceId: undefined }))`.

```tsx
{suggestions.map((sug) => (
  <Pressable key={sug.placeId}
    onPress={() => { setState((s) => ({ ...s, location: sug.text, destinationPlaceId: sug.placeId })); setSuggestions([]); }}
    className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
    <Text variant="body">{sug.text}</Text>
  </Pressable>
))}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- onboarding && npx tsc --noEmit`
Expected: PASS + no type errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/api.ts mobile/lib/onboarding.ts mobile/app/\(app\)/onboarding.tsx supabase/functions/generate-itinerary/handler.ts mobile/lib/onboarding.test.ts
git commit -m "feat: carry destinationPlaceId from onboarding into generate request"
```

---

## Phase B — Onboarding: days wheel + transport preference

### Task B1: Add `transport` to `Prefs` + onboarding state

**Files:**
- Modify: `supabase/_shared/types.ts` (`Prefs`)
- Modify: `mobile/lib/types.ts` (`Prefs`)
- Modify: `mobile/lib/onboarding.ts` (`OnboardingState`, `stateFromProfile`, `prefsFromState`)
- Test: `mobile/lib/onboarding.test.ts`

**Interfaces:**
- Produces: `Prefs.transport: "compact" | "balanced" | "far"`; `OnboardingState.transport`

- [ ] **Step 1: Write the failing test**

```ts
it("defaults transport to balanced and round-trips it", () => {
  expect(stateFromProfile(null).transport).toBe("balanced");
  const s = { ...stateFromProfile(null), transport: "compact" as const };
  expect(prefsFromState(s).transport).toBe("compact");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- onboarding`
Expected: FAIL.

- [ ] **Step 3: Implement**

Both `types.ts` files — add to `Prefs`:

```ts
  transport: "compact" | "balanced" | "far";
```

`mobile/lib/onboarding.ts`:
- `OnboardingState` add `transport: Prefs["transport"];`
- `stateFromProfile`: `transport: prefs?.transport ?? "balanced",`
- `prefsFromState`: `return { interests: s.interests, budget: s.budget, pace: s.pace, transport: s.transport };`

> Note: `Prefs.transport` is now required. Existing stored profiles without it read back via `stateFromProfile`'s `?? "balanced"` default, so no migration needed.

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/types.ts mobile/lib/types.ts mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts
git commit -m "feat: add transport preference to Prefs"
```

---

### Task B2: Transport selector UI + review row

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `OnboardingState.transport` (Task B1)

- [ ] **Step 1: Implement (UI-only, no unit test)**

Add the constant near `PACES`:

```tsx
const TRANSPORTS: { value: Prefs["transport"]; label: string; desc: string }[] = [
  { value: "compact", label: "Compact", desc: "Stay close. Walkable cluster, minimal transit." },
  { value: "balanced", label: "Balanced", desc: "City + nearby. Some driving." },
  { value: "far", label: "Far-ranging", desc: "Cover a wide region. Longer legs OK." },
];
```

In step 1 (after the Pace block), add a selector mirroring the Pace card pattern:

```tsx
<Text variant="label">Transport</Text>
<View className="gap-2">
  {TRANSPORTS.map((t) => (
    <Pressable key={t.value} onPress={() => setState((s) => ({ ...s, transport: t.value }))}
      className={`p-3 rounded-lg border ${state.transport === t.value ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
      <Text variant="label" className={state.transport === t.value ? "text-accent" : "text-ink"}>{t.label}</Text>
      <Text variant="caption">{t.desc}</Text>
    </Pressable>
  ))}
</View>
```

In step 2 (Review card) add:

```tsx
<Text variant="body">Transport: {state.transport}</Text>
```

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/onboarding.tsx
git commit -m "feat(mobile): transport preference selector + review row"
```

---

### Task B3: Days wheel picker

**Files:**
- Modify: `mobile/package.json` (via expo install)
- Modify: `mobile/app/(app)/onboarding.tsx` (replace −/+ row with Picker)

**Interfaces:**
- Consumes: `MAX_TRIP_DAYS`, `state.tripDays`

- [ ] **Step 1: Install the picker**

Run: `cd mobile && npx expo install @react-native-picker/picker`

- [ ] **Step 2: Implement**

Import at top of `onboarding.tsx`:

```tsx
import { Picker } from "@react-native-picker/picker";
```

Replace the −/+ `Button` row (current lines 132-136) with the wheel; keep the preset chips above it:

```tsx
<Picker
  selectedValue={state.tripDays}
  onValueChange={(v) => setState((s) => ({ ...s, tripDays: Number(v) }))}>
  {Array.from({ length: MAX_TRIP_DAYS }, (_, i) => i + 1).map((d) => (
    <Picker.Item key={d} label={`${d} ${d === 1 ? "day" : "days"}`} value={d} />
  ))}
</Picker>
```

The preset chips already call `setState(... tripDays: d)`; the wheel's `selectedValue` binds to `state.tripDays`, so tapping a chip moves the wheel. No further wiring needed.

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: no type errors, tests green.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app/\(app\)/onboarding.tsx
git commit -m "feat(mobile): days picker wheel (keep presets)"
```

---

## Phase C — Granularity + transport-aware generation

### Task C1: `areaRadiusKm` pure function

**Files:**
- Create: `supabase/_shared/area.ts`
- Test: `supabase/_shared/area_test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Viewport = { low: { lat: number; lng: number }; high: { lat: number; lng: number } } | null;
  type Transport = "compact" | "balanced" | "far";
  areaRadiusKm(opts: { viewport: Viewport; transport: Transport }): number
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { assert } from "jsr:@std/assert";
import { areaRadiusKm } from "./area.ts";

// Lisbon-ish viewport ~ small city (~20km diagonal => ~10km radius)
const city = { low: { lat: 38.65, lng: -9.25 }, high: { lat: 38.80, lng: -9.05 } };
// Tiny landmark viewport (~1km)
const landmark = { low: { lat: 48.857, lng: 2.293 }, high: { lat: 48.859, lng: 2.296 } };
// Huge country viewport
const country = { low: { lat: 36.0, lng: 6.0 }, high: { lat: 47.0, lng: 18.0 } };

Deno.test("compact stays small, far stays large, across granularities", () => {
  assert(areaRadiusKm({ viewport: landmark, transport: "compact" }) >= 2);
  assert(areaRadiusKm({ viewport: landmark, transport: "compact" }) <= 5);
  assert(areaRadiusKm({ viewport: city, transport: "balanced" }) >= 5);
  assert(areaRadiusKm({ viewport: city, transport: "balanced" }) <= 25);
  assert(areaRadiusKm({ viewport: country, transport: "far" }) === 150);
  // null viewport falls back to balanced default band
  assert(areaRadiusKm({ viewport: null, transport: "balanced" }) >= 5);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test _shared/area_test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// supabase/_shared/area.ts
type LatLng = { lat: number; lng: number };
export type Viewport = { low: LatLng; high: LatLng } | null;
export type Transport = "compact" | "balanced" | "far";

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// Default viewport radius when details lack a viewport (~city scale).
const DEFAULT_RADIUS_KM = 10;

export function areaRadiusKm(opts: { viewport: Viewport; transport: Transport }): number {
  const vp = opts.viewport;
  const viewportRadius = vp ? haversineKm(vp.low, vp.high) / 2 : DEFAULT_RADIUS_KM;
  switch (opts.transport) {
    case "compact": return clamp(viewportRadius * 0.3, 2, 5);
    case "balanced": return clamp(viewportRadius, 5, 25);
    case "far": return clamp(viewportRadius, 25, 150);
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test _shared/area_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/area.ts supabase/_shared/area_test.ts
git commit -m "feat(backend): areaRadiusKm (viewport x transport)"
```

---

### Task C2: `fetchPois` accepts a `locationBias`

**Files:**
- Modify: `supabase/_shared/places.ts` (`fetchPois`)
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Produces: `fetchPois` gains optional `locationBias?: { center: { lat: number; lng: number }; radiusKm: number }`

- [ ] **Step 1: Write the failing test**

```ts
Deno.test("fetchPois sends locationBias circle capped at 50km", async () => {
  let sentBody: any = null;
  const httpFetch = (_url: string, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body));
    return Promise.resolve(fakeResponse(placesBody));
  };
  await fetchPois({
    location: "Lisbon", kind: "attraction", prefs, httpFetch, apiKey: "k",
    locationBias: { center: { lat: 38.7, lng: -9.1 }, radiusKm: 150 },
  });
  assertEquals(sentBody.locationBias.circle.center, { latitude: 38.7, longitude: -9.1 });
  assertEquals(sentBody.locationBias.circle.radius, 50000); // capped
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `fetchPois` signature add `locationBias?: { center: { lat: number; lng: number }; radiusKm: number };`. Build the body conditionally:

```ts
const body: Record<string, unknown> = {
  textQuery: `${TYPE_QUERY[kind]} in ${location}`,
  maxResultCount: 20,
};
if (opts.locationBias) {
  // ponytail: searchText circle radius hard-capped at 50km by the API
  const radius = Math.min(opts.locationBias.radiusKm * 1000, 50000);
  body.locationBias = { circle: { center: { latitude: opts.locationBias.center.lat, longitude: opts.locationBias.center.lng }, radius } };
}
```

Pass `JSON.stringify(body)` to the fetch.

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test _shared/places_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat(backend): fetchPois locationBias circle"
```

---

### Task C3: `orderStops` accepts `travelMode`

**Files:**
- Modify: `supabase/_shared/routes.ts` (`orderStops`)
- Test: `supabase/_shared/routes_test.ts`

**Interfaces:**
- Produces: `orderStops` gains optional `travelMode?: "WALK" | "DRIVE"` (default `"DRIVE"`)

- [ ] **Step 1: Write the failing test**

```ts
Deno.test("orderStops sends travelMode WALK when set", async () => {
  let sentBody: any = null;
  const body = { routes: [{ optimizedIntermediateWaypointIndex: [0, 1, 2], legs: [{ duration: "60s" }, { duration: "60s" }, { duration: "60s" }, { duration: "60s" }] }] };
  await orderStops({
    stops, anchor, apiKey: "k", travelMode: "WALK",
    httpFetch: (_u, init) => { sentBody = JSON.parse(String((init as RequestInit).body)); return Promise.resolve(res(body)); },
  });
  assertEquals(sentBody.travelMode, "WALK");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test _shared/routes_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `orderStops` opts add `travelMode?: "WALK" | "DRIVE";`. In the request body change `travelMode: "DRIVE"` to `travelMode: opts.travelMode ?? "DRIVE"`.

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test _shared/routes_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/routes.ts supabase/_shared/routes_test.ts
git commit -m "feat(backend): orderStops travelMode param"
```

---

### Task C4: Handler resolves destination + applies transport

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts`
- Modify: `supabase/functions/generate-itinerary/index.ts`
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Consumes: `areaRadiusKm` (C1), `fetchPois` locationBias (C2), `orderStops` travelMode (C3), `GenerateRequest.destinationPlaceId` (A5)
- Produces: `HandlerDeps.resolveDestination(opts: { placeId?: string; location: string }) => Promise<{ center: { lat: number; lng: number }; viewport: Viewport }>`; `fetchPois` dep gains `locationBias`; `orderStops` dep gains `travelMode`

- [ ] **Step 1: Write the failing test**

In `handler_test.ts` add `resolveDestination` to the deps factory and assert it drives the bias + travel mode. Use a deps spy:

```ts
Deno.test("handleGenerate resolves destination and passes locationBias + WALK for compact", async () => {
  let biasRadiusKm = 0, sawMode = "";
  const deps = makeDeps({
    resolveDestination: () => Promise.resolve({ center: { lat: 1, lng: 2 }, viewport: null }),
    fetchPois: (o: any) => { biasRadiusKm = o.locationBias?.radiusKm ?? 0; return Promise.resolve([{ placeId: "A", name: "A", kind: o.kind, lat: 1, lng: 2 }]); },
    orderStops: (o: any) => { sawMode = o.travelMode; return Promise.resolve([{ placeId: "A", travelMinutesFromPrev: 0 }]); },
  });
  const req = { location: "X", tripDays: 1, destinationPlaceId: "p1", prefs: { interests: [], budget: "mid", pace: "balanced", transport: "compact" } };
  const out = await handleGenerate(req as any, "u1", deps);
  assertEquals(out.status, 200);
  assert(biasRadiusKm >= 2 && biasRadiusKm <= 5);
  assertEquals(sawMode, "WALK");
});
```

> If `handler_test.ts` lacks a `makeDeps` helper, add one that returns a full `HandlerDeps` with no-op defaults (`countTripsToday: () => 0`, `curate` returns a 1-day itinerary containing stop `A`, `saveTrip: () => "t1"`), overridable via `Object.assign`.

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test functions/generate-itinerary/handler_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `handler.ts`:
- Import: `import { areaRadiusKm, type Viewport } from "../../_shared/area.ts";`
- Add to `HandlerDeps`:
  ```ts
  resolveDestination(opts: { placeId?: string; location: string }): Promise<{ center: { lat: number; lng: number }; viewport: Viewport }>;
  ```
- Change `fetchPois` dep signature to include `locationBias?: { center: { lat: number; lng: number }; radiusKm: number }` and `orderStops` to include `travelMode?: "WALK" | "DRIVE"`.
- In `handleGenerate`, before fetching POIs:
  ```ts
  const dest = await deps.resolveDestination({ placeId: body.destinationPlaceId, location: body.location });
  const radiusKm = areaRadiusKm({ viewport: dest.viewport, transport: body.prefs.transport });
  const locationBias = { center: dest.center, radiusKm };
  const travelMode = body.prefs.transport === "compact" ? "WALK" as const : "DRIVE" as const;
  ```
- Pass `locationBias` into each `deps.fetchPois({ ... , locationBias })` call.
- Pass `travelMode` into `deps.orderStops({ ... , travelMode })`.
- Anchor fallback: if `anchorPoi` is null, use `dest.center` as the routing anchor so ordering still runs:
  ```ts
  const anchor = anchorPoi ? { lat: anchorPoi.lat, lng: anchorPoi.lng } : dest.center;
  ```
  and in the loop use `anchor` (route even without lodging). Keep `day.lodgingPlaceId = anchorPoi?.placeId ?? null;`.

In `index.ts`:
- Import `fetchPlaceDetails`, `searchAutocomplete` already imported as needed; add `fetchPlaceDetails` import.
- Add the dep:
  ```ts
  resolveDestination: async ({ placeId, location }) => {
    if (placeId) {
      const d = await fetchPlaceDetails({ placeId, httpFetch: fetch, apiKey: PLACES_KEY });
      return { center: d.center, viewport: d.viewport };
    }
    // fallback: no placeId (free-typed) — bias off, let textQuery carry the location
    return { center: { lat: 0, lng: 0 }, viewport: null };
  },
  ```
  > When `placeId` is absent the fallback center is `{0,0}`; guard in `handler.ts` so a `{0,0}` center skips `locationBias` (pass `locationBias: undefined`):
  ```ts
  const hasCenter = dest.center.lat !== 0 || dest.center.lng !== 0;
  const locationBias = hasCenter ? { center: dest.center, radiusKm } : undefined;
  ```
- Update `fetchPois` and `orderStops` dep wiring to forward `locationBias` / `travelMode`:
  ```ts
  fetchPois: (o) => fetchPois({ ...o, httpFetch: fetch, apiKey: PLACES_KEY, cache: {...} }),
  orderStops: (o) => orderStops({ ...o, httpFetch: fetch, apiKey: ROUTES_KEY }),
  ```
  (`...o` already forwards the new fields.)

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test functions/generate-itinerary/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-itinerary/ supabase/_shared/
git commit -m "feat(backend): granularity + transport-aware generation"
```

---

## Phase D — Guided itinerary + route on map

### Task D1: `orderStops` returns route polyline

**Files:**
- Modify: `supabase/_shared/routes.ts`
- Test: `supabase/_shared/routes_test.ts`

**Interfaces:**
- Produces: `orderStops(...) => Promise<{ ordered: { placeId: string; travelMinutesFromPrev: number }[]; polyline?: string }>`

- [ ] **Step 1: Update the failing tests**

`orderStops` now returns an object. Update every assertion in `routes_test.ts` from `out.map(...)` to `out.ordered.map(...)`, `out.length` to `out.ordered.length`, `out` empty to `out.ordered`. Add:

```ts
Deno.test("orderStops returns encoded polyline + requests it in field mask", async () => {
  let sawMask = "";
  const body = { routes: [{ optimizedIntermediateWaypointIndex: [0, 1, 2], legs: [{ duration: "60s" }, { duration: "60s" }, { duration: "60s" }, { duration: "60s" }], polyline: { encodedPolyline: "abc123" } }] };
  const out = await orderStops({ stops, anchor, apiKey: "k", httpFetch: (_u, init) => { sawMask = (init as RequestInit).headers as any ? ((init as RequestInit).headers as Record<string, string>)["X-Goog-FieldMask"] : ""; return Promise.resolve(res(body)); } });
  assertEquals(out.polyline, "abc123");
  assert(sawMask.includes("routes.polyline"));
});
```

For the fallback tests, assert `out.polyline === undefined`.

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test _shared/routes_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `routes.ts`:
- `FIELD_MASK = "routes.optimizedIntermediateWaypointIndex,routes.legs.duration,routes.polyline.encodedPolyline";`
- Change return type to `Promise<{ ordered: Ordered[]; polyline?: string }>`.
- `fallback(stops)` returns `{ ordered: stops.map(...), polyline: undefined }`.
- On success, read `route?.polyline?.encodedPolyline` and return `{ ordered, polyline }`.
- The empty-stops early return becomes `return { ordered: [], polyline: undefined };`.

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test _shared/routes_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/routes.ts supabase/_shared/routes_test.ts
git commit -m "feat(backend): orderStops returns route polyline"
```

---

### Task D2: Thread `routePolyline` onto each day

**Files:**
- Modify: `supabase/_shared/types.ts` + `mobile/lib/types.ts` (`ItineraryDay`)
- Modify: `supabase/functions/generate-itinerary/handler.ts` (consume new `orderStops` shape)
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Produces: `ItineraryDay.routePolyline?: string`

- [ ] **Step 1: Update the failing test**

Update `makeDeps` `orderStops` default to return `{ ordered: [...], polyline: "poly1" }`. Add:

```ts
Deno.test("handleGenerate attaches routePolyline to each day", async () => {
  const deps = makeDeps({ orderStops: () => Promise.resolve({ ordered: [{ placeId: "A", travelMinutesFromPrev: 0 }], polyline: "poly1" }) });
  const req = { location: "X", tripDays: 1, destinationPlaceId: "p1", prefs: { interests: [], budget: "mid", pace: "balanced", transport: "balanced" } };
  const out: any = await handleGenerate(req as any, "u1", deps);
  assertEquals(out.body.itinerary.days[0].routePolyline, "poly1");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd supabase && deno test functions/generate-itinerary/handler_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Both `types.ts` — `ItineraryDay` add `routePolyline?: string;`.

In `handler.ts` change the `orderStops` dep return type to `{ ordered: { placeId: string; travelMinutesFromPrev: number }[]; polyline?: string }` and the loop:

```ts
const { ordered, polyline } = await deps.orderStops({ stops: dayPois, anchor, travelMode });
const minutesById = new Map(ordered.map((o) => [o.placeId, o.travelMinutesFromPrev]));
day.stops = ordered.map((o) => {
  const stop = day.stops.find((s) => s.placeId === o.placeId)!;
  return { ...stop, travelMinutesFromPrev: minutesById.get(o.placeId) };
});
day.routePolyline = polyline;
```

- [ ] **Step 4: Run, verify pass**

Run: `cd supabase && deno test functions/generate-itinerary/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/types.ts mobile/lib/types.ts supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(backend): attach routePolyline to itinerary days"
```

---

### Task D3: Mobile polyline decoder

**Files:**
- Modify: `mobile/lib/poi.ts` (add `decodePolyline`)
- Test: `mobile/lib/poi.test.ts`

**Interfaces:**
- Produces: `decodePolyline(encoded: string) => { latitude: number; longitude: number }[]`

- [ ] **Step 1: Write the failing test**

Use the canonical Google example `_p~iF~ps|U_ulLnnqC_mqNvxq``@` → `[[38.5,-120.2],[40.7,-120.95],[43.252,-126.453]]`.

```ts
import { decodePolyline } from "./poi";

it("decodes the canonical Google polyline", () => {
  const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  expect(pts.map((p) => [Math.round(p.latitude * 1000) / 1000, Math.round(p.longitude * 1000) / 1000]))
    .toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd mobile && npm test -- poi`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `poi.ts`:

```ts
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
```

- [ ] **Step 4: Run, verify pass**

Run: `cd mobile && npm test -- poi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/poi.ts mobile/lib/poi.test.ts
git commit -m "feat(mobile): decodePolyline util"
```

---

### Task D4: Guided per-day itinerary view (map route + numbered stops)

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: `decodePolyline` (D3), `ItineraryDay.routePolyline` (D2), `getStopCoords` (existing)

- [ ] **Step 1: Implement (UI; verified via tsc + device)**

Changes to `itinerary.tsx`:

1. Add `selectedDay` state (default `days[0]?.day ?? 1`):
   ```tsx
   const [selectedDay, setSelectedDay] = useState(1);
   ```

2. A day selector row (segmented control) above the map, visible in map view:
   ```tsx
   <View className="flex-row flex-wrap gap-2 mb-2">
     {days.map((d) => (
       <Pressable key={d.day} onPress={() => setSelectedDay(d.day)}
         className={`px-3 py-1.5 rounded-pill ${selectedDay === d.day ? "bg-accent" : "bg-surface-2"}`}>
         <Text variant="label" className={selectedDay === d.day ? "text-white" : "text-ink-muted"}>Day {d.day}</Text>
       </Pressable>
     ))}
   </View>
   ```

3. Compute the selected day's ordered stops, numbered markers, and polyline:
   ```tsx
   const activeDay = days.find((d) => d.day === selectedDay) ?? days[0];
   const dayMarkers = (activeDay?.stops ?? [])
     .map((s, i) => ({ stop: s, coord: coords[s.placeId], n: i + 1 }))
     .filter((m) => m.coord)
     .map((m) => ({ id: String(m.n), coordinates: { latitude: m.coord.lat, longitude: m.coord.lng }, title: `${m.n}. ${m.stop.name}` }));
   const dayPolyline = activeDay?.routePolyline
     ? [{ id: `route-${selectedDay}`, coordinates: decodePolyline(activeDay.routePolyline), color: "#C1121F", width: 4 }]
     : [];
   ```
   > `#C1121F` = the crimson accent. Confirm the exact token in `tailwind.config` / theme; use that hex.

4. Pass to `AppleMaps.View`:
   ```tsx
   <AppleMaps.View
     style={{ flex: 1 }}
     cameraPosition={dayMarkers[0] ? { coordinates: dayMarkers[0].coordinates, zoom: 12 } : undefined}
     markers={dayMarkers}
     polylines={dayPolyline}
   />
   ```

5. List view: number each stop and label travel mode. In `renderItem`, the section already knows the day; compute index via `index` from `renderItem`:
   ```tsx
   renderItem={({ item, index }) => (
     <Card className="gap-1">
       <Text variant="heading">{index + 1}. {item.name}</Text>
       <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
       {item.travelMinutesFromPrev != null ? (
         <Text variant="caption">{item.travelMinutesFromPrev} min from previous</Text>
       ) : null}
     </Card>
   )}
   ```
   > `SectionList` `renderItem` `index` is per-section, so numbering restarts each day — correct for a guided day plan.

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: no type errors; tests green.
> Verify `AppleMaps.View` accepts `polylines` against the v56 docs already confirmed (`AppleMapsPolyline[]` with `coordinates`, `color`, `width`).

- [ ] **Step 3: Commit**

```bash
git add mobile/app/\(app\)/itinerary.tsx
git commit -m "feat(mobile): guided per-day itinerary with route line + numbered stops"
```

---

## Final integration

### Task E1: Deploy + device verification

- [ ] **Step 1: Full test sweep**

Run: `cd supabase && deno test` then `cd mobile && npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 2: Deploy edge functions**

```bash
supabase functions deploy places-autocomplete
supabase functions deploy generate-itinerary
```

- [ ] **Step 3: Device smoke (manual)**

Build/run on device. Verify, signed in:
- Autocomplete: "Lisbon" → cities/regions/landmarks only, no streets/restaurants.
- Days wheel spins; presets still set it.
- Transport selector persists across app restart (saved to profile).
- Generate across: a landmark (e.g. "Eiffel Tower"), a city ("Lisbon"), a country ("Italy") × Compact/Balanced/Far — itineraries stay geographically coherent.
- Itinerary: day selector switches days; map shows that day's numbered stops + a route line; list stops are numbered with per-leg times.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR.

---

## Self-Review

**Spec coverage:** Autocomplete type filter (A1) ✓; placeId plumbing (A1,A2,A4,A5) ✓; place details (A3) ✓; days wheel (B3) ✓; transport pref (B1,B2) ✓; granularity/transport area sizing (C1,C2,C4) ✓; travel mode (C3,C4) ✓; single-focus-area via locationBias (C2,C4) ✓; route polyline backend (D1,D2) ✓; decoder (D3) ✓; per-day guided map + numbered list (D4) ✓; no DB migration (B1 note) ✓; deploy + device matrix (E1) ✓.

**Placeholder scan:** none — every code step shows full code.

**Type consistency:** `{text, placeId}` suggestion shape consistent A1↔A2↔A4↔A5. `transport: "compact"|"balanced"|"far"` consistent B1↔C4. `orderStops` return `{ordered, polyline}` consistent D1↔D2 (handler updated in D2). `areaRadiusKm({viewport, transport})` consistent C1↔C4. `locationBias: {center, radiusKm}` consistent C2↔C4. `decodePolyline` → `{latitude, longitude}[]` consistent D3↔D4.
