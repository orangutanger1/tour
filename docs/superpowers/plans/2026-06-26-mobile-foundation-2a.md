# Tour Guide — Mobile Foundation (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mobile app skeleton — a user signs in with Google or Apple, lands on an empty authenticated home, and a typed `generateItinerary()` call sits wired to the edge function for Phase 2b to consume.

**Architecture:** An Expo (React Native) app under `mobile/`, file-routed by Expo Router. Auth uses native Google/Apple sign-in exchanged for a Supabase session via `signInWithIdToken`. Server calls go through TanStack Query. The one pure, framework-free module (`lib/api.ts`) is unit-tested with jest-expo + an injected `fetch`; native and config code is verified by type-check and manual device smoke.

**Tech Stack:** Expo SDK 51+, TypeScript, Expo Router, `@supabase/supabase-js`, `@tanstack/react-query`, `expo-secure-store`, `expo-apple-authentication`, `@react-native-google-signin/google-signin`, `react-native-url-polyfill`, jest-expo.

## Global Constraints

- App lives in `mobile/` at repo root (alongside `docs/`, `supabase/`). All paths below are relative to repo root.
- TypeScript only. Extensionless imports (Metro/Expo convention) — NOT `.ts` suffixes.
- Auth is native-flow only: `supabase.auth.signInWithIdToken({ provider, token })`. No web-redirect OAuth.
- The Supabase **anon key is public** and ships in the app; data is guarded by RLS (Phase 1). Never put the service-role key, Google Places/Routes keys, or LLM keys in `mobile/` — those are backend secrets.
- `mobile/lib/types.ts` is a **mirror** of `supabase/_shared/types.ts`; the backend file is the source of truth. Keep them in sync by hand (header comment says so).
- Requires an Expo **dev build** (EAS) — native auth modules don't run in Expo Go.
- Only `lib/api.ts` has automated tests in 2a (jest-expo). Don't add component tests yet (YAGNI — no component logic until 2b).
- Itinerary/`Prefs` shapes are the Phase 1 contract — copy them verbatim, don't redesign.

---

## Prerequisites (operational — do before Task 5 and Task 8; no code)

These produce the IDs/keys the code reads from env. Gather them once.

1. **Supabase URL + anon key** — Dashboard (project `zhqucbpgcysxhejvbhex`) → Settings → API. Copy `Project URL` and `anon public` key.
2. **Google OAuth client IDs** — Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID, twice (iOS-only app):
   - **Web** (used by Supabase + as `webClientId` for idToken),
   - **iOS** (bundle id `com.tour.local`).
3. **Supabase Auth → Google provider** — Dashboard → Authentication → Providers → Google → enable, paste the **Web** client ID + secret.
4. **Apple Developer** ($99/yr) → Certificates, Identifiers & Profiles:
   - App ID with **Sign In with Apple** capability (bundle `com.tour.local`),
   - a **Services ID**, and a **Sign in with Apple key**.
5. **Supabase Auth → Apple provider** — enable, paste Services ID + key + team/key IDs.
6. **EAS** — `npm i -g eas-cli`, `eas login`, then `eas build:configure` (Task 8 covers the build itself).

Put the values into `mobile/.env` (gitignored) — see Task 1.

---

### Task 1: Scaffold the Expo app + dependencies + env config

**Files:**
- Create: `mobile/` (via scaffold), `mobile/app.config.ts`, `mobile/.env.example`, `mobile/.gitignore`, `mobile/tsconfig.json` (generated, then verified)
- Modify: root `.gitignore` (already ignores `node_modules/`)

**Interfaces:**
- Consumes: nothing.
- Produces: a bootable Expo app; env values exposed as `process.env.EXPO_PUBLIC_*`.

- [ ] **Step 1: Scaffold the app**

Run from repo root:
```bash
npx create-expo-app@latest mobile --template tabs
cd mobile
```
This creates an Expo Router app. Keep the generated `app/` for now; Task 6 replaces its contents.

- [ ] **Step 2: Install dependencies**

```bash
cd mobile
npx expo install @supabase/supabase-js @tanstack/react-query expo-secure-store \
  expo-apple-authentication @react-native-google-signin/google-signin \
  react-native-url-polyfill
npm i -D jest-expo jest @types/jest
```

- [ ] **Step 3: Write `mobile/app.config.ts`** (exposes env + native config)

```typescript
// mobile/app.config.ts
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Tour",
  slug: "tour",
  scheme: "tour",
  ios: { bundleIdentifier: "com.tour.local", usesAppleSignIn: true, supportsTablet: true },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-apple-authentication",
    "@react-native-google-signin/google-signin",
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
};

export default config;
```

- [ ] **Step 4: Write `mobile/.env.example`**

```bash
# mobile/.env.example  — copy to mobile/.env and fill in (mobile/.env is gitignored)
EXPO_PUBLIC_SUPABASE_URL=https://zhqucbpgcysxhejvbhex.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxx.apps.googleusercontent.com
```

- [ ] **Step 5: Ensure `mobile/.gitignore` ignores secrets and build output**

Append to `mobile/.gitignore` (create if missing):
```
.env
.env.*
!.env.example
.expo/
ios/
android/
```

- [ ] **Step 6: Verify it type-checks and boots**

Run:
```bash
cd mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add mobile/app.config.ts mobile/.env.example mobile/.gitignore mobile/package.json mobile/package-lock.json mobile/tsconfig.json mobile/app mobile/assets
git commit -m "feat(mobile): scaffold Expo app + deps + env config"
```

---

### Task 2: Shared itinerary types (mirror of backend)

**Files:**
- Create: `mobile/lib/types.ts`

**Interfaces:**
- Consumes: nothing (verbatim copy of `supabase/_shared/types.ts` minus the server-only `HttpFetch`/`LlmComplete`).
- Produces: `Prefs`, `Poi`, `Stop`, `ItineraryDay`, `Itinerary`.

- [ ] **Step 1: Write `mobile/lib/types.ts`** (no test — pure type declarations)

```typescript
// mobile/lib/types.ts
// MIRROR of supabase/_shared/types.ts — backend is the source of truth. Keep in sync by hand.
export interface Prefs {
  interests: string[];
  budget: "low" | "mid" | "high";
  pace: "relaxed" | "balanced" | "packed";
  diet?: string[];
  accessibility?: string[];
}

export interface Poi {
  placeId: string;
  name: string;
  kind: "attraction" | "food" | "lodging";
  lat: number;
  lng: number;
  priceLevel?: number;
  rating?: number;
  address?: string;
  deepLink?: string;
}

export interface Stop {
  placeId: string;
  name: string;
  blurb: string;
  travelMinutesFromPrev?: number;
}

export interface ItineraryDay {
  day: number;
  lodgingPlaceId: string | null;
  stops: Stop[];
}

export interface Itinerary {
  days: ItineraryDay[];
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/types.ts
git commit -m "feat(mobile): mirror itinerary types from backend"
```

---

### Task 3: Typed API client (`lib/api.ts`) + jest setup — TDD

**Files:**
- Create: `mobile/lib/api.ts`, `mobile/lib/api.test.ts`
- Modify: `mobile/package.json` (add jest preset + test script)

**Interfaces:**
- Consumes: `Prefs`, `Itinerary` from `lib/types`.
- Produces:
  - `GenerateRequest = { location: string; tripDays: number; prefs: Prefs }`
  - `GenerateResult = { tripId: string; itinerary: Itinerary }`
  - `class ApiError extends Error { status: number }`
  - `generateItinerary(opts: { req: GenerateRequest; accessToken: string; baseUrl: string; fetchImpl?: typeof fetch }): Promise<GenerateResult>`

- [ ] **Step 1: Add the jest preset + test script to `mobile/package.json`**

Add these keys (merge with existing):
```json
{
  "scripts": { "test": "jest" },
  "jest": { "preset": "jest-expo" }
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// mobile/lib/api.test.ts
import { generateItinerary, ApiError, type GenerateResult } from "./api";
import type { Prefs } from "./types";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced" };
const req = { location: "Lisbon", tripDays: 2, prefs };
const result: GenerateResult = {
  tripId: "t1",
  itinerary: { days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] },
};

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
}

test("posts to the function URL with bearer token and body", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const fetchImpl = ((u: string, i: RequestInit) => {
    url = u; init = i;
    return Promise.resolve(new Response(JSON.stringify(result), { status: 200 }));
  }) as unknown as typeof fetch;
  await generateItinerary({ req, accessToken: "jwt123", baseUrl: "https://x.supabase.co", fetchImpl });
  expect(url).toBe("https://x.supabase.co/functions/v1/generate-itinerary");
  expect((init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer jwt123");
  expect(JSON.parse(init!.body as string)).toEqual(req);
});

test("returns parsed result on 200", async () => {
  const out = await generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch(result) });
  expect(out.tripId).toBe("t1");
  expect(out.itinerary.days.length).toBe(1);
});

test("throws ApiError with status on 400", async () => {
  await expect(
    generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch({ error: "bad" }, 400) }),
  ).rejects.toMatchObject({ status: 400 });
});

test("throws ApiError on 429 (rate limit)", async () => {
  await expect(
    generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch({ error: "cap" }, 429) }),
  ).rejects.toBeInstanceOf(ApiError);
});

test("throws ApiError on 502 (generation failed)", async () => {
  await expect(
    generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch({ error: "boom" }, 502) }),
  ).rejects.toMatchObject({ status: 502 });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd mobile && npm test -- lib/api.test.ts`
Expected: FAIL — cannot find module `./api`.

- [ ] **Step 4: Write `mobile/lib/api.ts`**

```typescript
// mobile/lib/api.ts
import type { Itinerary, Prefs } from "./types";

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
}

export interface GenerateResult {
  tripId: string;
  itinerary: Itinerary;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function generateItinerary(opts: {
  req: GenerateRequest;
  accessToken: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<GenerateResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/generate-itinerary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify(opts.req),
  });
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* non-JSON body */ }
    throw new ApiError(res.status, message);
  }
  return await res.json() as GenerateResult;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd mobile && npm test -- lib/api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/api.ts mobile/lib/api.test.ts mobile/package.json
git commit -m "feat(mobile): typed generate-itinerary API client + jest setup"
```

---

### Task 4: Supabase client with SecureStore session

**Files:**
- Create: `mobile/lib/supabase.ts`

**Interfaces:**
- Consumes: env via `expo-constants` (`Constants.expoConfig.extra`).
- Produces: `supabase` (a configured `SupabaseClient`).

- [ ] **Step 1: Write `mobile/lib/supabase.ts`**

```typescript
// mobile/lib/supabase.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string; supabaseAnonKey: string };

// SecureStore-backed storage adapter for the Supabase session.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // native: no URL-based session
  },
});
```

- [ ] **Step 2: Verify type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/supabase.ts
git commit -m "feat(mobile): supabase client with SecureStore session persistence"
```

---

### Task 5: Auth provider (Google + Apple via signInWithIdToken)

**Files:**
- Create: `mobile/lib/auth.tsx`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase`; env Google web/iOS client IDs via `Constants`.
- Produces:
  - `AuthProvider` (React context provider).
  - `useAuth(): { session: Session | null; user: User | null; loading: boolean; signInWithGoogle(): Promise<void>; signInWithApple(): Promise<void>; signOut(): Promise<void> }`.

- [ ] **Step 1: Write `mobile/lib/auth.tsx`**

```tsx
// mobile/lib/auth.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const extra = Constants.expoConfig?.extra as { googleWebClientId: string; googleIosClientId: string };
GoogleSignin.configure({ webClientId: extra.googleWebClientId, iosClientId: extra.googleIosClientId });

interface AuthValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithGoogle(): Promise<void>;
  signInWithApple(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken;
    if (!idToken) throw new Error("no Google idToken");
    const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
    if (error) throw error;
  }

  async function signInWithApple() {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error("no Apple identityToken");
    const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signInWithGoogle, signInWithApple, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/auth.tsx
git commit -m "feat(mobile): auth provider with native Google + Apple sign-in"
```

---

### Task 6: Navigation shell + auth gate + stub screens

**Files:**
- Modify: `mobile/app/_layout.tsx` (replace generated)
- Create: `mobile/app/(auth)/sign-in.tsx`, `mobile/app/(app)/_layout.tsx`, and stub screens `mobile/app/(app)/index.tsx`, `onboarding.tsx`, `trip-create.tsx`, `generating.tsx`, `itinerary.tsx`, `poi-detail.tsx`, `edit.tsx`, `lodging.tsx`, `saved.tsx`
- Delete: generated demo routes under `mobile/app/(tabs)` and `mobile/app/+not-found.tsx` if present (replaced by groups below)

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` from `lib/auth`.
- Produces: an auth-gated route tree. Unauthed → `(auth)/sign-in`; authed → `(app)/index`.

- [ ] **Step 1: Write the root layout `mobile/app/_layout.tsx`**

```tsx
// mobile/app/_layout.tsx
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "../lib/auth";

const queryClient = new QueryClient();

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
    else if (session && inAuthGroup) router.replace("/(app)");
  }, [session, loading, segments]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Write the sign-in screen `mobile/app/(auth)/sign-in.tsx`**

```tsx
// mobile/app/(auth)/sign-in.tsx
import { View, Text, Button, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../../lib/auth";

export default function SignIn() {
  const { signInWithGoogle, signInWithApple } = useAuth();

  async function run(fn: () => Promise<void>) {
    try { await fn(); } catch (e) {
      // user-cancellation codes vary by provider; only alert on real failures
      const msg = e instanceof Error ? e.message : "sign-in failed";
      if (!/cancel/i.test(msg)) Alert.alert("Couldn't sign in", msg);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "600", textAlign: "center" }}>Tour</Text>
      <Button title="Continue with Google" onPress={() => run(signInWithGoogle)} />
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={8}
        style={{ height: 44 }}
        onPress={() => run(signInWithApple)}
      />
    </View>
  );
}
```

- [ ] **Step 3: Write the authed layout `mobile/app/(app)/_layout.tsx`**

```tsx
// mobile/app/(app)/_layout.tsx
import { Stack } from "expo-router";

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: true }} />;
}
```

- [ ] **Step 4: Write the home stub `mobile/app/(app)/index.tsx`**

```tsx
// mobile/app/(app)/index.tsx
import { View, Text, Button } from "react-native";
import { useAuth } from "../../lib/auth";

export default function Home() {
  const { user, signOut } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
      <Text>Signed in as {user?.email ?? user?.id}</Text>
      <Text style={{ color: "#888" }}>Itinerary screens land in Phase 2b.</Text>
      <Button title="Sign out" onPress={signOut} />
    </View>
  );
}
```

- [ ] **Step 5: Write the 8 remaining stub screens**

Each file is a one-line placeholder. Create all of:
`onboarding.tsx`, `trip-create.tsx`, `generating.tsx`, `itinerary.tsx`, `poi-detail.tsx`, `edit.tsx`, `lodging.tsx`, `saved.tsx` under `mobile/app/(app)/`, each with this content (swap the name):

```tsx
// mobile/app/(app)/onboarding.tsx  (repeat per file, changing the title)
import { View, Text } from "react-native";
export default function Onboarding() {
  return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><Text>Onboarding — 2b</Text></View>;
}
```

- [ ] **Step 6: Remove generated demo routes**

```bash
cd mobile && rm -rf app/\(tabs\) app/+not-found.tsx app/modal.tsx 2>/dev/null; true
```
(Only removes files if the template created them. The groups above are the real tree.)

- [ ] **Step 7: Verify type-check + boot**

Run:
```bash
cd mobile && npx tsc --noEmit
```
Expected: no errors. (Full boot to the gate is verified on-device in Task 8 — the gate needs native auth.)

- [ ] **Step 8: Commit**

```bash
git add mobile/app
git commit -m "feat(mobile): auth-gated navigation shell + screen stubs"
```

---

### Task 7: `useGenerateItinerary` mutation hook

**Files:**
- Create: `mobile/lib/useGenerateItinerary.ts`

**Interfaces:**
- Consumes: `generateItinerary`, `GenerateRequest`, `GenerateResult` from `lib/api`; `useAuth` from `lib/auth`; `supabase` for the base URL via env.
- Produces: `useGenerateItinerary(): UseMutationResult<GenerateResult, ApiError, GenerateRequest>` — the seam 2b's Generating screen calls.

- [ ] **Step 1: Write `mobile/lib/useGenerateItinerary.ts`**

```typescript
// mobile/lib/useGenerateItinerary.ts
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import Constants from "expo-constants";
import { generateItinerary, type ApiError, type GenerateRequest, type GenerateResult } from "./api";
import { useAuth } from "./auth";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string };

export function useGenerateItinerary(): UseMutationResult<GenerateResult, ApiError, GenerateRequest> {
  const { session } = useAuth();
  return useMutation<GenerateResult, ApiError, GenerateRequest>({
    mutationFn: (req) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("not authenticated");
      return generateItinerary({ req, accessToken, baseUrl: extra.supabaseUrl });
    },
  });
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/useGenerateItinerary.ts
git commit -m "feat(mobile): useGenerateItinerary mutation hook"
```

---

### Task 8: Dev build + manual device smoke test

**Files:** none (operational). This is the real verification of the native auth path.

**Prerequisites:** Tasks 1–7 committed; `mobile/.env` filled from the Prerequisites section; Supabase Google + Apple providers enabled.

- [ ] **Step 1: Configure and create a dev build**

```bash
cd mobile
eas build:configure
eas build --profile development --platform ios   # iOS-only; needs a Mac or EAS cloud build
```

- [ ] **Step 2: Run the dev server against the build**

```bash
cd mobile && npx expo start --dev-client
```
Open the installed dev build on the device.

- [ ] **Step 3: Smoke-test the auth loop (manual checklist)**

Verify each:
- App launches → redirected to the sign-in screen (no session).
- "Continue with Google" → native Google sheet → returns to app → lands on home showing your email.
- Sign out → back to sign-in.
- "Sign in with Apple" → native Apple sheet → returns to app → home.
- Kill and relaunch the app → still signed in (SecureStore persistence).
- Cancel a sign-in sheet → stays on sign-in, no error alert.

- [ ] **Step 4: Record the result**

If all pass, 2a is functionally complete. If any fail, stop and debug before proceeding (most failures here are provider-config mismatches: wrong client ID, bundle id, or a disabled Supabase provider — not app code).

- [ ] **Step 5: Commit any config fixes** (e.g. `eas.json`)

```bash
git add mobile/eas.json
git commit -m "chore(mobile): EAS dev build config"
```

---

## Self-Review

**Spec coverage:**
- §1 Goal (sign in → empty home → wired `generateItinerary`) → Tasks 5–7 (auth + hook), Task 6 (home), Task 3 (client).
- §2 Decisions (Google+Apple `signInWithIdToken`, Expo Router, TanStack Query, dev build, `mobile/`, mirrored types) → Tasks 5, 6, 7, 8, 1, 2 respectively.
- §3 Architecture (file tree + component contracts) → Tasks 1–7 produce exactly those files; `lib/supabase`, `lib/auth`, `lib/api`, gate, hook all match the contract signatures.
- §4 Config/secrets (public anon key, no backend secrets in app, Auth provider config) → Prerequisites + Task 1 (`app.config.ts`, `.env.example`, `.gitignore`).
- §5 Testing (`api.ts` unit-tested with fake fetch; native = manual smoke) → Task 3 (jest), Task 8 (smoke).
- §6 Error handling (cancel swallow, signIn reject, no session gate, token refresh, ApiError) → Task 5 (signIn throws), Task 6 (gate + cancel swallow), Task 3 (ApiError mapping), Task 4 (autoRefresh).
- §7 Open questions (Google lib `@react-native-google-signin`) → resolved in Task 5; EAS/Apple ops → Prerequisites + Task 8.
- §8 Deferred (monorepo, offline, push, i18n, real screens, map) → not in any task (correct).

**Placeholder scan:** none — every code step has complete code. Stub screens are intentional placeholders *in the product*, not in the plan (their full content is shown). Task 8 is operational with a concrete manual checklist, not a vague "test it".

**Type consistency:** `GenerateRequest`/`GenerateResult`/`ApiError` defined in Task 3 and consumed unchanged in Task 7. `useAuth` value shape defined in Task 5 and consumed in Tasks 6 (`session`, `loading`, `signInWith*`, `signOut`, `user`) and 7 (`session.access_token`). `Prefs`/`Itinerary` from Task 2 used in Tasks 3. `Constants.expoConfig.extra` keys (`supabaseUrl`, `supabaseAnonKey`, `googleWebClientId`, `googleIosClientId`) set in Task 1 and read in Tasks 4, 5, 7 — names match.

**Known sync risk (called out):** `mobile/lib/types.ts` duplicates `supabase/_shared/types.ts`. If the backend itinerary shape changes, update both. Acceptable for ~4 interfaces; promote to a shared package only if drift becomes real (YAGNI).
