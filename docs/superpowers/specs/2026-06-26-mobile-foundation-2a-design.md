# Tour Guide — Mobile Foundation (Phase 2a) Design Spec

**Date:** 2026-06-26
**Status:** Design approved, ready for implementation planning
**Depends on:** Phase 1 curation pipeline (edge function `generate-itinerary`, `trips`/`profiles`/`cached_pois` schema with RLS — live on Supabase project `zhqucbpgcysxhejvbhex`).

## 1. Goal & Scope

The first vertical slice of the React Native mobile app: the **skeleton everything
else hangs on**. When 2a is done, a user can sign in with Google or Apple, lands on
an empty authenticated home, and the codebase has one typed `generateItinerary()`
call wired to the edge function — ready for 2b to render real screens against.

**In scope:** Expo scaffold, Supabase client, native Google/Apple auth, navigation
shell with auth gating, typed API client, shared itinerary types.

**Out of scope (later slices):**
- 2b — onboarding form, trip create, generating, itinerary (map+list), POI detail.
- 2c — drag-reorder, add/remove/swap, regenerate-a-day, lodging picker, saved trips, offline cache.

No product screen renders real content in 2a; the 8 spec screens exist as **empty stubs**
so routing is wired but blank.

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Auth | Google + Apple via `supabase.auth.signInWithIdToken` (native flow, no web redirect) | Store-ready UX; Apple required by App Store when other social logins exist |
| Navigation | Expo Router (file-based) | Least boilerplate for 8 screens; built-in deep linking; auth-gated route groups |
| Server data | TanStack Query | Loading/error/retry/cache for the generate call + trip reads; pairs with 2c offline cache |
| Build | Expo **dev build** (EAS), not Expo Go | Native auth modules (`expo-apple-authentication`, native Google) aren't in Expo Go |
| App location | `mobile/` at repo root | Alongside `docs/`, `supabase/` |
| Shared types | Mirror backend `supabase/_shared/types.ts` into `mobile/lib/types.ts` | ~4 interfaces; monorepo shared package deferred (YAGNI) |

## 3. Architecture

```
mobile/
  app.config.ts            # reads env: Supabase URL+anon key, Google/Apple client IDs
  app/                     # Expo Router routes
    _layout.tsx            # root: providers (QueryClient, AuthProvider) + auth gate
    (auth)/sign-in.tsx     # Google + Apple buttons
    (app)/                 # authed group (gated)
      _layout.tsx          # stack/tabs for the 8 screens
      index.tsx            # empty authed home (stub)
      onboarding.tsx       # stub
      trip-create.tsx      # stub
      generating.tsx       # stub
      itinerary.tsx        # stub
      poi-detail.tsx       # stub
      edit.tsx             # stub
      lodging.tsx          # stub
      saved.tsx            # stub
  lib/
    supabase.ts            # supabase-js client, SecureStore session, auto-refresh
    auth.tsx               # AuthProvider + useAuth; signInWithGoogle/Apple; onAuthStateChange
    api.ts                 # generateItinerary(req) -> typed result; attaches access token
    useGenerateItinerary.ts# TanStack Query mutation wrapping api.ts
    types.ts               # mirror of backend Prefs/Itinerary/Stop/ItineraryDay
  lib/api_test.ts          # unit test: request shape, auth header, error mapping (fake fetch)
```

**Component contracts (each understandable + testable in isolation):**

- **`lib/supabase.ts`** — exports a configured `supabase` client. Session persisted in
  `expo-secure-store`. Depends on env (URL + anon key). No other module constructs a client.
- **`lib/auth.tsx`** — `AuthProvider` holds `{ session, user, loading }`; `useAuth()` reads it.
  `signInWithGoogle()` / `signInWithApple()` run the native flow, exchange the returned
  `idToken` via `supabase.auth.signInWithIdToken`, and `signOut()`. Subscribes to
  `onAuthStateChange`. Depends on `lib/supabase.ts`.
- **`lib/api.ts`** — `generateItinerary(req: GenerateRequest, accessToken: string)`.
  POSTs to `${SUPABASE_URL}/functions/v1/generate-itinerary` with `Authorization: Bearer`.
  Maps 400/429/502/other → typed `ApiError`. Pure-ish (takes an injectable `fetch` for tests).
  Depends on `lib/types.ts` only.
- **`lib/useGenerateItinerary.ts`** — TanStack mutation: pulls the access token from `useAuth`,
  calls `api.ts`. The seam 2b's "Generating" screen consumes.
- **Auth gate** (root `_layout.tsx`) — if `loading` show splash; if no session redirect to
  `(auth)/sign-in`; else render `(app)`.

**Data flow (the one real path in 2a):**
```
sign-in button -> native Google/Apple -> idToken -> supabase.auth.signInWithIdToken
  -> session in SecureStore -> auth gate renders (app) -> (empty home)
```
`generateItinerary()` exists and is unit-tested but isn't called by any screen yet (2b wires it).

## 4. Configuration / Secrets

- **Mobile (public, in-app):** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
  Google iOS/Android client IDs, Apple Services ID. The anon key is public by design (RLS guards data).
- **Supabase Dashboard → Auth providers:** Google (Web client ID + secret), Apple (Services ID + key).
- **Not in 2a:** Google Places/Routes keys and LLM keys are backend `supabase secrets` for the
  edge function, set when 2b deploys the generate flow. 2a never sees them.

Env handled via `app.config.ts` + an untracked `.env` (gitignored) for local; EAS env for builds.

## 5. Testing

- **`lib/api.ts`** — unit-tested with a fake `fetch`: sends the access token, shapes the body,
  maps each error status to the right `ApiError`. Mirrors the backend's injectable-seam pattern.
- **Native auth** — can't unit-test the native idToken flow; verified by **manual device smoke**
  (sign in with Google, sign in with Apple, sign out, session survives app restart).
- No E2E harness in 2a (YAGNI).

## 6. Error Handling

| Case | Handling |
|---|---|
| User cancels native sign-in | Swallow cancellation, stay on sign-in screen, no error toast |
| `signInWithIdToken` rejects | Surface a generic "couldn't sign in" message; log detail |
| No session on launch | Auth gate redirects to sign-in (not an error) |
| Expired/refreshed token | `supabase-js` auto-refresh; `onAuthStateChange` updates context |
| `generateItinerary` non-2xx | Typed `ApiError` (status + message) for 2b screens to render — defined now, consumed later |

## 7. Open Questions (resolved before/within plan)

- Google native sign-in lib: `@react-native-google-signin/google-signin` (idToken support) vs
  `expo-auth-session`. **Default: `@react-native-google-signin`** (cleaner idToken for
  `signInWithIdToken`); confirmed in the plan's first task.
- EAS account / dev-build provisioning and the Apple Developer account are operational
  prerequisites called out in the plan, not code.

## 8. Deferred (YAGNI)

Monorepo shared-types package · offline cache · push · i18n · any real screen content ·
map SDK choice (2b decision) · onboarding form logic (2b).
