# Onboarding & Auth Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sign-in to the end of onboarding (delayed registration), redesign the sign-in screen, make budget/pace meaningful, add location autocomplete, raise the day cap, and fix headers/home — across mobile + two small backend changes.

**Architecture:** The auth gate stops walling the UI; landing + onboarding are reachable signed-out, and the only gate is the **Generate** action (stash the request, sign in, resume). Backend: make pace real in the LLM prompt, and add a `places-autocomplete` edge function. Mobile: pure helpers (`places.ts`, `useDebouncedValue`, `tripFlow` pending seam) are TDD'd; screens are thin and verified by type-check + device smoke.

**Tech Stack:** Expo SDK 56, TypeScript, NativeWind (design system), TanStack Query, Supabase edge functions (Deno), jest-expo (mobile) + `deno test` (backend).

## Global Constraints

- App in `mobile/`; backend in `supabase/`. Mobile commands from `mobile/`; run git from repo root (`cd /home/myen/tour`).
- TypeScript only. **Extensionless imports** in mobile; `.ts` extensions in Deno backend imports (existing convention).
- **Mobile verification:** `npx tsc --noEmit` → **0 errors**; existing `npm test` suite stays green. Pure mobile helpers get jest tests; screens are thin (no RNTL) → tsc + device smoke.
- **Backend verification:** `deno test <file>` for the touched test files.
- `mobile/lib/types.ts` mirrors `supabase/_shared/types.ts`; **no `Prefs` change** — budget/pace stay `low|mid|high` / `relaxed|balanced|packed`; this is labels + prompt only.
- Design system is in place — use `components/ui` (`Screen`, `Text`, `Button`, `Chip`, `Input`, `Card`, `EmptyState`, `Loading`) and token classNames. Crimson accent `#E11D48`.
- Days cap = **30**. Pace stops/day: relaxed 2–3, balanced 4–5, packed 6–8.
- Autocomplete proxy authorized by the **public anon key** (no session needed); debounce 300 ms; min query length 2.
- **Operational prereqs (no code, note for the operator):** after backend tasks, deploy with `supabase functions deploy places-autocomplete`; `GOOGLE_PLACES_KEY` secret is already set (used by `generate-itinerary`). A new **EAS dev build** is needed for the new asset/flow on device.

## Task Ordering

1. Backend: pace → stops/day in `buildPrompt`
2. Backend: `_shared/places.ts` `searchAutocomplete` (Google call)
3. Backend: `places-autocomplete` edge function (handler + index)
4. Mobile: `lib/useDebouncedValue`
5. Mobile: `lib/placesClient.ts` (`autocompletePlaces`)
6. Mobile: `lib/tripFlow` pending-request seam
7. Mobile: auth-gate restructure + hide stack headers
8. Mobile: sign-in screen redesign (+ Google logo asset)
9. Mobile: onboarding (relabels, days cap, autocomplete, gated Generate)
10. Mobile: landing (`index`) redesign + account access
11. Mobile: `account` screen

---

### Task 1: Backend — make pace real in `buildPrompt`

**Files:**
- Modify: `supabase/_shared/llm.ts`
- Test: `supabase/_shared/llm_test.ts`

**Interfaces:**
- Consumes: existing `buildPrompt(pois, prefs, tripDays)`.
- Produces: prompt now contains explicit stops/day guidance derived from `prefs.pace`.

- [ ] **Step 1: Add failing tests** — append to `supabase/_shared/llm_test.ts`:

```typescript
Deno.test("buildPrompt encodes pace as stops/day (packed)", () => {
  const p = buildPrompt(pois, { ...prefs, pace: "packed" }, 2);
  assertStringIncludes(p, "6");
  assertStringIncludes(p, "stops per day");
});

Deno.test("buildPrompt encodes pace as stops/day (relaxed)", () => {
  const p = buildPrompt(pois, { ...prefs, pace: "relaxed" }, 2);
  assertStringIncludes(p, "2");
  assertStringIncludes(p, "stops per day");
});
```

- [ ] **Step 2: Run, expect fail**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: FAIL (prompt lacks "stops per day").

- [ ] **Step 3: Implement** — in `supabase/_shared/llm.ts`, add a pace map and a guidance line. Insert above the `return [` and add the line into the array:

```typescript
  const PACE_STOPS: Record<Prefs["pace"], string> = {
    relaxed: "2-3",
    balanced: "4-5",
    packed: "6-8",
  };
```

Then add this string as a new element in the returned array (right after the "Build a ${tripDays}-day plan…" line):

```typescript
    `Aim for about ${PACE_STOPS[prefs.pace]} stops per day (pace=${prefs.pace}).`,
```

- [ ] **Step 4: Run, expect pass**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
cd /home/myen/tour
git add supabase/_shared/llm.ts supabase/_shared/llm_test.ts
git commit -m "feat(backend): encode pace as stops/day in itinerary prompt"
```

---

### Task 2: Backend — `searchAutocomplete` in `_shared/places.ts`

**Files:**
- Modify: `supabase/_shared/places.ts`
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Consumes: `HttpFetch` from `./types.ts`.
- Produces: `searchAutocomplete(opts: { query: string; httpFetch: HttpFetch; apiKey: string }): Promise<string[]>` — calls Google Places Autocomplete (New), returns up to 5 formatted prediction strings.

> Google Places API (New) Autocomplete: `POST https://places.googleapis.com/v1/places:autocomplete`, header `X-Goog-Api-Key`, body `{ "input": "<query>" }`. Response: `{ "suggestions": [ { "placePrediction": { "text": { "text": "Lisbon, Portugal" } } } ] }`. Verify this shape against current Google docs before relying on it in production.

- [ ] **Step 1: Add failing test** — append to `supabase/_shared/places_test.ts`:

```typescript
import { searchAutocomplete } from "./places.ts";

Deno.test("searchAutocomplete maps predictions to strings", async () => {
  const httpFetch = ((_url: string, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify({
      suggestions: [
        { placePrediction: { text: { text: "Lisbon, Portugal" } } },
        { placePrediction: { text: { text: "Lisbon, OH, USA" } } },
      ],
    }), { status: 200 }))) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "Lis", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(out, ["Lisbon, Portugal", "Lisbon, OH, USA"]);
});

Deno.test("searchAutocomplete returns [] for empty suggestions", async () => {
  const httpFetch = (() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "zzzz", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(out, []);
});
```

(Ensure `assertEquals` is imported at the top of `places_test.ts`; if not, add `import { assertEquals } from "jsr:@std/assert";`.)

- [ ] **Step 2: Run, expect fail**

Run: `deno test supabase/_shared/places_test.ts`
Expected: FAIL (`searchAutocomplete` not exported).

- [ ] **Step 3: Implement** — append to `supabase/_shared/places.ts`:

```typescript
export async function searchAutocomplete(opts: {
  query: string;
  httpFetch: HttpFetch;
  apiKey: string;
}): Promise<string[]> {
  const { query, httpFetch, apiKey } = opts;
  const res = await httpFetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({ input: query }),
  });
  if (!res.ok) throw new Error(`autocomplete: HTTP ${res.status}`);
  const data = await res.json() as {
    suggestions?: Array<{ placePrediction?: { text?: { text?: string } } }>;
  };
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction?.text?.text)
    .filter((t): t is string => typeof t === "string")
    .slice(0, 5);
}
```

- [ ] **Step 4: Run, expect pass**

Run: `deno test supabase/_shared/places_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/myen/tour
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat(backend): Google Places autocomplete helper"
```

---

### Task 3: Backend — `places-autocomplete` edge function

**Files:**
- Create: `supabase/functions/places-autocomplete/handler.ts`, `supabase/functions/places-autocomplete/handler_test.ts`, `supabase/functions/places-autocomplete/index.ts`

**Interfaces:**
- Consumes: `searchAutocomplete` (Task 2).
- Produces: `handleAutocomplete(body: { query?: string }, deps: { search(q: string): Promise<string[]> }): Promise<{ status: number; body: unknown }>` — 400 if query < 2 chars; 200 `{ suggestions }` on success; 502 on upstream error. Plus a deployable `index.ts`.

- [ ] **Step 1: Write failing test** — create `supabase/functions/places-autocomplete/handler_test.ts`:

```typescript
// supabase/functions/places-autocomplete/handler_test.ts
import { assertEquals } from "jsr:@std/assert";
import { handleAutocomplete } from "./handler.ts";

Deno.test("rejects short query", async () => {
  const r = await handleAutocomplete({ query: "a" }, { search: () => Promise.resolve([]) });
  assertEquals(r.status, 400);
});

Deno.test("returns suggestions on success", async () => {
  const r = await handleAutocomplete({ query: "Lis" }, { search: () => Promise.resolve(["Lisbon, Portugal"]) });
  assertEquals(r.status, 200);
  assertEquals(r.body, { suggestions: ["Lisbon, Portugal"] });
});

Deno.test("maps upstream error to 502", async () => {
  const r = await handleAutocomplete({ query: "Lis" }, { search: () => Promise.reject(new Error("boom")) });
  assertEquals(r.status, 502);
});
```

- [ ] **Step 2: Run, expect fail**

Run: `deno test supabase/functions/places-autocomplete/handler_test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement handler** — create `supabase/functions/places-autocomplete/handler.ts`:

```typescript
// supabase/functions/places-autocomplete/handler.ts
export interface AutocompleteDeps {
  search(query: string): Promise<string[]>;
}

export async function handleAutocomplete(
  body: { query?: string },
  deps: AutocompleteDeps,
): Promise<{ status: number; body: unknown }> {
  const query = (body?.query ?? "").trim();
  if (query.length < 2) return { status: 400, body: { error: "query too short" } };
  try {
    const suggestions = await deps.search(query);
    return { status: 200, body: { suggestions } };
  } catch {
    return { status: 502, body: { error: "autocomplete failed" } };
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `deno test supabase/functions/places-autocomplete/handler_test.ts`
Expected: PASS.

- [ ] **Step 5: Create `index.ts`** (deployable; mirrors `generate-itinerary/index.ts` style):

```typescript
// supabase/functions/places-autocomplete/index.ts
import { handleAutocomplete } from "./handler.ts";
import { searchAutocomplete } from "../../_shared/places.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;

Deno.serve(async (req: Request) => {
  let body: { query?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const result = await handleAutocomplete(body, {
    search: (query) => searchAutocomplete({ query, httpFetch: fetch, apiKey: PLACES_KEY }),
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 6: Commit**

```bash
cd /home/myen/tour
git add supabase/functions/places-autocomplete/
git commit -m "feat(backend): places-autocomplete edge function"
```

> Operational (no code): `supabase functions deploy places-autocomplete` so the mobile field works on device.

---

### Task 4: Mobile — `lib/useDebouncedValue`

**Files:**
- Create: `mobile/lib/useDebouncedValue.ts`, `mobile/lib/useDebouncedValue.test.ts`

**Interfaces:**
- Produces: `useDebouncedValue<T>(value: T, delayMs: number): T`.

- [ ] **Step 1: Write failing test** — create `mobile/lib/useDebouncedValue.test.ts`:

```typescript
import { renderHook, act } from "@testing-library/react-native";
import { useDebouncedValue } from "./useDebouncedValue";

jest.useFakeTimers();

test("returns latest value only after the delay", () => {
  const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v, 300), { initialProps: { v: "a" } });
  expect(result.current).toBe("a");
  rerender({ v: "ab" });
  expect(result.current).toBe("a");
  act(() => { jest.advanceTimersByTime(300); });
  expect(result.current).toBe("ab");
});
```

> If `@testing-library/react-native` is not installed, install it dev-only for this hook test: `npx expo install -- --save-dev @testing-library/react-native`. (This is the one place a renderHook test earns its keep; screens still get no component tests.) If you prefer zero new deps, instead test the debounce as a plain function — but the hook form is the deliverable, so the testing-library route is recommended here.

- [ ] **Step 2: Run, expect fail**

Run: `cd mobile && npm test -- useDebouncedValue`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `mobile/lib/useDebouncedValue.ts`:

```typescript
// mobile/lib/useDebouncedValue.ts
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd mobile && npm test -- useDebouncedValue`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/myen/tour
git add mobile/lib/useDebouncedValue.ts mobile/lib/useDebouncedValue.test.ts mobile/package.json mobile/package-lock.json
git commit -m "feat(mobile): useDebouncedValue hook"
```

---

### Task 5: Mobile — `lib/placesClient.ts` (`autocompletePlaces`)

**Files:**
- Create: `mobile/lib/placesClient.ts`, `mobile/lib/placesClient.test.ts`

**Interfaces:**
- Produces: `autocompletePlaces(opts: { query: string; baseUrl: string; anonKey: string; fetchImpl?: typeof fetch }): Promise<string[]>` — POSTs `{ query }` to `${baseUrl}/functions/v1/places-autocomplete` with the anon key; returns `suggestions`; `[]` for query < 2 chars; throws on non-2xx.

> Named `placesClient.ts` to avoid clashing with backend `_shared/places.ts`.

- [ ] **Step 1: Write failing test** — create `mobile/lib/placesClient.test.ts`:

```typescript
import { autocompletePlaces } from "./placesClient";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
}

test("returns [] without calling for short query", async () => {
  let called = false;
  const fetchImpl = (() => { called = true; return Promise.resolve(new Response("{}")); }) as unknown as typeof fetch;
  expect(await autocompletePlaces({ query: "a", baseUrl: "https://x", anonKey: "k", fetchImpl })).toEqual([]);
  expect(called).toBe(false);
});

test("posts to the function URL with anon key and parses suggestions", async () => {
  let url = ""; let init: RequestInit | undefined;
  const fetchImpl = ((u: string, i: RequestInit) => { url = u; init = i;
    return Promise.resolve(new Response(JSON.stringify({ suggestions: ["Lisbon, Portugal"] }), { status: 200 })); }) as unknown as typeof fetch;
  const out = await autocompletePlaces({ query: "Lis", baseUrl: "https://x.supabase.co", anonKey: "anon123", fetchImpl });
  expect(url).toBe("https://x.supabase.co/functions/v1/places-autocomplete");
  expect((init!.headers as Record<string, string>)["apikey"]).toBe("anon123");
  expect(out).toEqual(["Lisbon, Portugal"]);
});

test("throws on non-2xx", async () => {
  await expect(autocompletePlaces({ query: "Lis", baseUrl: "https://x", anonKey: "k", fetchImpl: fakeFetch({ error: "no" }, 500) }))
    .rejects.toBeTruthy();
});
```

- [ ] **Step 2: Run, expect fail**

Run: `cd mobile && npm test -- placesClient`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `mobile/lib/placesClient.ts`:

```typescript
// mobile/lib/placesClient.ts
export async function autocompletePlaces(opts: {
  query: string;
  baseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const query = opts.query.trim();
  if (query.length < 2) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/places-autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": opts.anonKey,
      "Authorization": `Bearer ${opts.anonKey}`,
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`autocomplete failed (${res.status})`);
  const data = await res.json() as { suggestions?: string[] };
  return data.suggestions ?? [];
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd mobile && npm test -- placesClient`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/myen/tour
git add mobile/lib/placesClient.ts mobile/lib/placesClient.test.ts
git commit -m "feat(mobile): places autocomplete client"
```

---

### Task 6: Mobile — `tripFlow` pending-request seam

**Files:**
- Modify: `mobile/lib/tripFlow.tsx`

**Interfaces:**
- Consumes: existing `useGenerateItinerary`.
- Produces: `useTripFlow()` now also exposes `prepare(req: GenerateRequest): void` and `pendingRequest: GenerateRequest | null`; `reset()` also clears `pendingRequest`.

- [ ] **Step 1: Edit `mobile/lib/tripFlow.tsx`** — add pending state to the existing provider. The full file becomes:

```typescript
// mobile/lib/tripFlow.tsx
import { createContext, useContext, useState, type ReactNode } from "react";
import { useGenerateItinerary } from "./useGenerateItinerary";
import type { ApiError, GenerateRequest, GenerateResult } from "./api";

interface TripFlowValue {
  generate(req: GenerateRequest): void;
  prepare(req: GenerateRequest): void;
  pendingRequest: GenerateRequest | null;
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
  const [pendingRequest, setPendingRequest] = useState<GenerateRequest | null>(null);

  function generate(req: GenerateRequest) {
    setLastRequest(req);
    setPendingRequest(null);
    mutation.mutate(req);
  }

  function prepare(req: GenerateRequest) {
    setPendingRequest(req);
  }

  function reset() {
    setLastRequest(null);
    setPendingRequest(null);
    mutation.reset();
  }

  return (
    <TripFlowContext.Provider
      value={{
        generate,
        prepare,
        pendingRequest,
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

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/myen/tour
git add mobile/lib/tripFlow.tsx
git commit -m "feat(mobile): tripFlow pending-request seam for delayed sign-in"
```

---

### Task 7: Mobile — auth-gate restructure + hide stack headers

**Files:**
- Modify: `mobile/app/_layout.tsx`, `mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `AuthProvider`/`useAuth`.
- Produces: no forced redirect to sign-in; stack headers hidden.

- [ ] **Step 1: Edit `mobile/app/_layout.tsx`** — drop the redirect logic in `AuthGate` (keep providers + fonts). Replace the `AuthGate` function and its usage with a plain `<Slot />`:

```typescript
// mobile/app/_layout.tsx
import "../global.css";
import { Slot } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider } from "../lib/auth";

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Slot />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
```

> Removing the gate means signed-out users land on `(app)/index` (the public landing). Data stays protected: the generate edge function + RLS reject unauthenticated calls. `useAuth` still drives per-screen behaviour (e.g., landing's account affordance, onboarding's Generate gating).

- [ ] **Step 2: Edit `mobile/app/(app)/_layout.tsx`** — hide native headers (kills "index"/"onboarding" titles):

```typescript
// mobile/app/(app)/_layout.tsx
import { Stack } from "expo-router";
import { TripFlowProvider } from "../../lib/tripFlow";

export default function AppLayout() {
  return (
    <TripFlowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </TripFlowProvider>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/_layout.tsx" "mobile/app/(app)/_layout.tsx"
git commit -m "feat(mobile): delayed-registration auth gate + hide route headers"
```

---

### Task 8: Mobile — sign-in screen redesign (+ Google logo)

**Files:**
- Create: `mobile/assets/images/google-g.png` (official multi-color Google "G" mark)
- Modify: `mobile/app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `useAuth` (`signInWithGoogle`/`signInWithApple`), `useTripFlow` (`pendingRequest`, `generate`), `upsertProfile` (called with `pendingRequest.prefs`), `useRouter`, `components/ui`.
- Produces: branded sign-in; on success, resume a pending trip (generate → `/generating`) or go to landing.

- [ ] **Step 1: Add the Google "G" asset**

Download the official Google "G" logo PNG into `mobile/assets/images/google-g.png` (e.g., from Google's brand assets / `developers.google.com/identity/branding-guidelines`). ~48–96px square, transparent background. (No code; required for the next step's `require`.)

- [ ] **Step 2: Rewrite `mobile/app/(auth)/sign-in.tsx`**

```typescript
// mobile/app/(auth)/sign-in.tsx
import { View, Image, Pressable, Alert, ActivityIndicator } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { useTripFlow } from "../../lib/tripFlow";
import { upsertProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { Screen, Text } from "../../components/ui";

export default function SignIn() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const { pendingRequest, generate } = useTripFlow();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      if (pendingRequest) {
        try { await upsertProfile(supabase, pendingRequest.prefs); } catch { /* best-effort */ }
        generate(pendingRequest);
        router.replace("/generating");
      } else {
        router.replace("/");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sign-in failed";
      if (!/cancel/i.test(msg)) Alert.alert("Couldn't sign in", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="flex-1 justify-center items-center gap-3">
        <View className="w-16 h-16 rounded-xl bg-accent items-center justify-center">
          <Text variant="title" className="text-ink-inverse">T</Text>
        </View>
        <Text variant="display" className="text-center">Almost there</Text>
        <Text variant="body" className="text-center text-ink-muted">Sign in to save your trip and pick up anywhere.</Text>
      </View>

      <View className="gap-3 pb-2">
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={999}
          style={{ height: 52 }}
          onPress={() => run(signInWithApple)}
        />
        <Pressable
          onPress={() => run(signInWithGoogle)}
          disabled={busy}
          className="h-[52px] flex-row items-center justify-center gap-3 rounded-pill bg-surface border border-border active:bg-surface-2"
        >
          <Image source={require("../../assets/images/google-g.png")} style={{ width: 20, height: 20 }} />
          <Text variant="label" className="text-ink text-[15px]">Continue with Google</Text>
        </Pressable>
        {busy ? <ActivityIndicator color="#E11D48" /> : null}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(auth)/sign-in.tsx" mobile/assets/images/google-g.png
git commit -m "feat(mobile): branded sign-in (Apple + Google) resuming pending trip"
```

---

### Task 9: Mobile — onboarding (relabels, days cap 30, autocomplete, gated Generate)

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx`
- Modify: `mobile/lib/onboarding.ts` (raise `MAX_TRIP_DAYS` to 30)

**Interfaces:**
- Consumes: `lib/onboarding` helpers, `lib/placesClient.autocompletePlaces`, `lib/useDebouncedValue`, `useAuth`, `useTripFlow` (`generate`/`prepare`), `Constants.expoConfig.extra`, `components/ui`.
- Produces: relabeled prefs, 1–30 days, autocomplete field, sign-out-aware Generate.

- [ ] **Step 1: Raise the day cap** — in `mobile/lib/onboarding.ts` change:

```typescript
export const MAX_TRIP_DAYS = 30;
```

(The existing `onboarding.test.ts` uses `MAX_TRIP_DAYS` symbolically, so it still passes. Run `cd mobile && npm test -- onboarding` to confirm.)

- [ ] **Step 2: Rewrite `mobile/app/(app)/onboarding.tsx`**

```typescript
// mobile/app/(app)/onboarding.tsx
import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, canContinue, buildRequest,
  type OnboardingState,
} from "../../lib/onboarding";
import { getProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useTripFlow } from "../../lib/tripFlow";
import { autocompletePlaces } from "../../lib/placesClient";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { Prefs } from "../../lib/types";
import { Screen, Text, Button, Chip, Input, Card } from "../../components/ui";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string; supabaseAnonKey: string };

const BUDGETS: { value: Prefs["budget"]; label: string; desc: string }[] = [
  { value: "low", label: "$ Budget", desc: "Street food, free sights, budget stays" },
  { value: "mid", label: "$$ Comfortable", desc: "Casual eats, mix of sights, mid-range hotels" },
  { value: "high", label: "$$$ Premium", desc: "Fine dining, splurges, upscale stays" },
];
const PACES: { value: Prefs["pace"]; label: string; desc: string }[] = [
  { value: "relaxed", label: "Relaxed", desc: "2–3 stops/day" },
  { value: "balanced", label: "Balanced", desc: "4–5 stops/day" },
  { value: "packed", label: "Packed", desc: "6–8 stops/day" },
];
const DAY_PRESETS = [3, 5, 7, 10, 14];

export default function Onboarding() {
  const router = useRouter();
  const { session } = useAuth();
  const tripFlow = useTripFlow();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(stateFromProfile(null));
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debouncedLocation = useDebouncedValue(state.location, 300);

  useEffect(() => {
    getProfile(supabase).then((prefs) => setState(stateFromProfile(prefs))).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    autocompletePlaces({ query: debouncedLocation, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
      .then((s) => { if (active) setSuggestions(s); })
      .catch(() => { if (active) setSuggestions([]); });
    return () => { active = false; };
  }, [debouncedLocation]);

  function toggleInterest(i: string) {
    setState((s) => ({
      ...s,
      interests: s.interests.includes(i) ? s.interests.filter((x) => x !== i) : [...s.interests, i],
    }));
  }

  function onGenerate() {
    const req = buildRequest(state);
    if (session) {
      tripFlow.generate(req);
      router.push("/generating");
    } else {
      tripFlow.prepare(req);
      router.push("/(auth)/sign-in");
    }
  }

  return (
    <Screen scroll>
      <View className="flex-row gap-2 mb-2">
        {[0, 1, 2].map((i) => (
          <View key={i} className={`h-1.5 flex-1 rounded-pill ${i <= step ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </View>

      {step === 0 && (
        <View className="gap-5">
          <Text variant="title">What do you like?</Text>
          <View className="flex-row flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip key={i} label={i} selected={state.interests.includes(i)} onPress={() => toggleInterest(i)} />
            ))}
          </View>
          <Text variant="label">Budget</Text>
          <View className="gap-2">
            {BUDGETS.map((b) => (
              <Pressable key={b.value} onPress={() => setState((s) => ({ ...s, budget: b.value }))}
                className={`p-3 rounded-lg border ${state.budget === b.value ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
                <Text variant="label" className={state.budget === b.value ? "text-accent" : "text-ink"}>{b.label}</Text>
                <Text variant="caption">{b.desc}</Text>
              </Pressable>
            ))}
          </View>
          <Text variant="label">Pace</Text>
          <View className="gap-2">
            {PACES.map((p) => (
              <Pressable key={p.value} onPress={() => setState((s) => ({ ...s, pace: p.value }))}
                className={`p-3 rounded-lg border ${state.pace === p.value ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
                <Text variant="label" className={state.pace === p.value ? "text-accent" : "text-ink"}>{p.label}</Text>
                <Text variant="caption">{p.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View className="gap-4">
          <Text variant="title">Where and how long?</Text>
          <Input placeholder="Location (e.g. Lisbon)" value={state.location}
            onChangeText={(t) => setState((s) => ({ ...s, location: t }))} autoCorrect={false} />
          {suggestions.length > 0 && state.location.trim().length >= 2 ? (
            <View className="gap-1">
              {suggestions.map((sug) => (
                <Pressable key={sug} onPress={() => { setState((s) => ({ ...s, location: sug })); setSuggestions([]); }}
                  className="p-3 rounded-md bg-surface border border-border active:bg-surface-2">
                  <Text variant="body">{sug}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Text variant="label">Days: {state.tripDays}</Text>
          <View className="flex-row flex-wrap gap-2">
            {DAY_PRESETS.map((d) => (
              <Chip key={d} label={String(d)} selected={state.tripDays === d} onPress={() => setState((s) => ({ ...s, tripDays: d }))} />
            ))}
          </View>
          <View className="flex-row items-center gap-3">
            <Button title="–" variant="secondary" size="sm" onPress={() => setState((s) => ({ ...s, tripDays: Math.max(1, s.tripDays - 1) }))} />
            <Text variant="body">{state.tripDays} {state.tripDays === 1 ? "day" : "days"}</Text>
            <Button title="+" variant="secondary" size="sm" onPress={() => setState((s) => ({ ...s, tripDays: Math.min(MAX_TRIP_DAYS, s.tripDays + 1) }))} />
          </View>
        </View>
      )}

      {step === 2 && (
        <Card className="gap-2">
          <Text variant="title">Review</Text>
          <Text variant="body">Location: {state.location}</Text>
          <Text variant="body">Days: {state.tripDays}</Text>
          <Text variant="body">Interests: {state.interests.join(", ")}</Text>
          <Text variant="body">Budget: {state.budget} · Pace: {state.pace}</Text>
        </Card>
      )}

      <View className="flex-row justify-between gap-3 mt-4">
        <Button title="Back" variant="ghost" disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))} className="flex-1" />
        {step < 2 ? (
          <Button title="Next" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} className="flex-1" />
        ) : (
          <Button title="Generate" onPress={onGenerate} className="flex-1" />
        )}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 3: Type-check + onboarding test**

Run: `cd mobile && npx tsc --noEmit && npm test -- onboarding`
Expected: 0 tsc errors; onboarding test passes.

- [ ] **Step 4: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(app)/onboarding.tsx" mobile/lib/onboarding.ts
git commit -m "feat(mobile): onboarding relabels, autocomplete, 30-day cap, gated generate"
```

---

### Task 10: Mobile — landing (`index`) redesign + account access

**Files:**
- Modify: `mobile/app/(app)/index.tsx`

**Interfaces:**
- Consumes: `useAuth` (`session`/`user`), `useRouter`, `components/ui`.
- Produces: public landing; signed-in users get a top-right account button; no bottom email/sign-out.

- [ ] **Step 1: Rewrite `mobile/app/(app)/index.tsx`**

```typescript
// mobile/app/(app)/index.tsx
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { Screen, Text, Button } from "../../components/ui";

export default function Home() {
  const { user, session } = useAuth();
  const router = useRouter();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();
  return (
    <Screen>
      <View className="flex-row justify-end">
        {session ? (
          <Pressable onPress={() => router.push("/account")}
            className="w-10 h-10 rounded-pill bg-accent-soft items-center justify-center">
            <Text variant="label" className="text-accent">{initial}</Text>
          </Pressable>
        ) : null}
      </View>
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
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(app)/index.tsx"
git commit -m "feat(mobile): public landing with account access, no bottom email"
```

---

### Task 11: Mobile — `account` screen

**Files:**
- Create: `mobile/app/(app)/account.tsx`

**Interfaces:**
- Consumes: `useAuth` (`user`, `signOut`), `useRouter`, `components/ui`.
- Produces: an account screen with email + Sign out.

- [ ] **Step 1: Create `mobile/app/(app)/account.tsx`**

```typescript
// mobile/app/(app)/account.tsx
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { Screen, Text, Button, Card } from "../../components/ui";

export default function Account() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  async function onSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <Screen>
      <View className="flex-row items-center gap-3 mb-4">
        <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <Text variant="title">Account</Text>
      </View>
      <Card className="gap-1">
        <Text variant="caption">Signed in as</Text>
        <Text variant="heading">{user?.email ?? user?.id ?? "—"}</Text>
      </Card>
      <View className="flex-1" />
      <View className="pb-2">
        <Button title="Sign out" variant="secondary" onPress={onSignOut} />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Type-check + full suites**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: 0 tsc errors; all jest tests pass.

- [ ] **Step 3: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(app)/account.tsx"
git commit -m "feat(mobile): account screen (email + sign out)"
```

---

## Final Verification (after all tasks)

- [ ] Backend: `deno test supabase/_shared/llm_test.ts supabase/_shared/places_test.ts supabase/functions/places-autocomplete/handler_test.ts` — all pass.
- [ ] Mobile: `cd mobile && npx tsc --noEmit` → 0 errors; `npm test` → all green (existing + `useDebouncedValue` + `placesClient`).
- [ ] Operational: `supabase functions deploy places-autocomplete`; confirm `GOOGLE_PLACES_KEY` secret set. New **EAS dev build** for the google-g asset + flow.
- [ ] **Device smoke (user):** launch signed-out → landing → onboarding (autocomplete suggests; budget/pace show descriptors; days to 30) → Generate → sign-in (Apple + Google look right) → generating → itinerary saved. Re-launch → lands on landing with account avatar → Account → Sign out → back to landing.
- [ ] Use superpowers:finishing-a-development-branch to integrate. **Do not push unless asked.**

## Notes / Risks

- **Google Places Autocomplete (New) response shape** (Task 2) — verify `suggestions[].placePrediction.text.text` against current Google docs before trusting in prod; the handler/clients are isolated if the field path differs.
- **`apikey` header** — Supabase Edge Functions accept the anon key via the `apikey` header (and `Authorization: Bearer <anon>`). Both are sent for safety.
- **Apple "Continue" button** uses `AppleAuthenticationButtonType.CONTINUE` (vs `SIGN_IN`) to match the delayed-registration copy.
- **`@testing-library/react-native`** (Task 4) is the only new dev dep, solely for the debounce hook test; screens still get no component tests. If you'd rather add zero deps, refactor the debounce into a pure function and test that instead — but the hook is the shipped form.
- Autocomplete only works after the edge function is **deployed**; until then the field still accepts free text (errors fall back silently).
