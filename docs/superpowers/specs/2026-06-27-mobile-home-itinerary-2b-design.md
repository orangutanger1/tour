# Tour Guide — Mobile Home Itinerary (Phase 2b) Design Spec

**Date:** 2026-06-27
**Status:** Design approved, ready for implementation planning
**Depends on:** Phase 2a foundation (merged, PR #1) — `lib/api.ts` (`generateItinerary`),
`lib/useGenerateItinerary.ts`, `lib/auth.tsx` (`useAuth`), `lib/supabase.ts`, mirrored
`lib/types.ts`, and the auth-gated `(app)` route group. Backend: edge function
`generate-itinerary` and the `profiles`/`trips` schema with RLS (Phase 1, project
`zhqucbpgcysxhejvbhex`).

## 1. Goal & Scope

The first user-facing vertical slice: a signed-in user fills a short onboarding flow
(travel preferences + trip parameters), the app saves their profile, generates an
itinerary via the existing edge function, and renders the result as a day-by-day list
with a map toggle. This makes the core loop real on device.

**Flow:** `home → onboarding (multi-step) → generating → itinerary`

**In scope:**
- Home launchpad screen (entry to onboarding; keeps existing sign-out).
- Multi-step onboarding collecting profile prefs (interests, budget, pace) **and** trip
  params (location, trip days), with a review/generate step.
- Profile persistence to the `profiles` table (`default_prefs`), prefilling onboarding
  when a profile already exists.
- Generating (loading) screen driven by the generate mutation, with error handling.
- Itinerary screen: day-by-day list + map toggle (Apple Maps via `expo-maps`).
- Loading / error / empty states across the flow.

**Out of scope (later slices):**
- POI detail screen (tap-through), diet/accessibility preference collection, saved-trips
  list, drag-reorder / add-remove-swap / regenerate-a-day (edit), lodging picker, offline
  cache. Their route stubs (`trip-create`, `poi-detail`, `edit`, `lodging`, `saved`) are
  left untouched.

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Screen flow | Multi-screen: onboarding bundles prefs+trip → generating → itinerary | Real navigation; reuses the 2a route group; matches the original spec's screen model |
| Profile | Persist prefs to `profiles.default_prefs` (upsert); prefill onboarding | Prefs survive across trips/sessions; "builds their own profile" |
| Map | `expo-maps` (Apple Maps on iOS, no API key, zero config) | First-party, `npx expo install`, iOS-only app → Apple Maps needs no key. Trade-off: alpha (breaking changes possible) — accepted |
| Itinerary view | List + map toggle | Product decision; map data is just stop lat/lng + lodging anchor |
| Cross-screen generate state | `TripFlow` context in `(app)/_layout` wrapping `useGenerateItinerary` + holding result | 3 screens share one mutation result; avoids JSON-in-route-params and a refetch-by-tripId |
| Prefs collected (2b) | interests (multi), budget, pace | Core loop; diet/accessibility stay typed-optional but uncollected (YAGNI) |
| Testing | Pure-helper TDD (`lib/onboarding.ts`, `lib/profile.ts`) with jest-expo; no RNTL | Matches 2a convention; components stay thin, verified by type-check + device smoke; no new dep |

## 3. Architecture

```
mobile/
  app/(app)/
    index.tsx          # home launchpad: "Plan a trip" -> onboarding; signed-in-as + sign out
    onboarding.tsx     # 3-step wizard; thin component over lib/onboarding.ts
    generating.tsx     # spinner over TripFlow status; success -> itinerary, error -> retry/edit
    itinerary.tsx      # day-by-day list + map toggle over TripFlow data
    _layout.tsx        # MODIFY: wrap children in <TripFlowProvider>
  lib/
    profile.ts         # getProfile / upsertProfile (supabase-js, RLS-guarded; injectable client)
    profile.test.ts    # unit: table/columns, error mapping
    onboarding.ts      # PURE: step validators, buildRequest(state), stateFromProfile(prefs)
    onboarding.test.ts # unit: validators + buildRequest + stateFromProfile
    tripFlow.tsx       # TripFlowProvider + useTripFlow: { generate, status, error, data, reset }
```

**Component contracts (each understandable + testable in isolation):**

- **`lib/profile.ts`** — `getProfile(supabase): Promise<Prefs | null>` reads the current
  user's `profiles.default_prefs` (null if no row). `upsertProfile(supabase, prefs):
  Promise<void>` upserts `{ id: user.id, default_prefs: prefs }`. Uses the shared
  `supabase` client (or an injected stub in tests). RLS enforces owner-only; no service
  role. Depends on `lib/types.ts` + a supabase client.
- **`lib/onboarding.ts`** — pure, framework-free. Holds the onboarding step-state shape and:
  `stateFromProfile(prefs | null)` (seed defaults), per-step validators
  (`canContinue(step, state)` — interests ≥ 1, location non-empty, tripDays in 1..N), and
  `buildRequest(state): GenerateRequest`. The main TDD target. Depends on `lib/types.ts` +
  `lib/api.ts` types only.
- **`lib/tripFlow.tsx`** — `TripFlowProvider` wraps `useGenerateItinerary` and exposes
  `useTripFlow(): { generate(req), status: 'idle'|'pending'|'success'|'error', error,
  data, reset() }`. Lives above the screens in `(app)/_layout`. Depends on
  `useGenerateItinerary`.
- **`onboarding.tsx`** — thin wizard component. Reads existing profile on mount
  (`getProfile`) to seed state via `stateFromProfile`; drives steps using the pure
  validators; on Generate calls `upsertProfile` then `tripFlow.generate(buildRequest(state))`
  and navigates to `generating`.
- **`generating.tsx`** — reads `useTripFlow().status`. `pending` → spinner + step text;
  `success` → `router.replace('/itinerary')`; `error` → message + **Try again**
  (`tripFlow.generate` with the same request) + **Edit** (back to onboarding).
- **`itinerary.tsx`** — reads `useTripFlow().data`. Renders day-by-day list (lodging anchor
  + ordered stops with name, blurb, travel-minutes) and a map toggle (`expo-maps`) showing
  stop pins + lodging anchor. Empty state if no days/stops.

**Data flow (the 2b path):**
```
home "Plan a trip"
  -> onboarding: getProfile -> seed state; collect interests/budget/pace, location, days
  -> Generate: upsertProfile(prefs); tripFlow.generate({location, tripDays, prefs})
  -> generating: status pending (spinner) -> success
  -> itinerary: render data.itinerary (list + map)
```
The generate call hits the existing edge function (saves the trip server-side, returns
`{ tripId, itinerary }`); `TripFlow` holds the result for the itinerary screen.

## 4. Configuration / Secrets

- No new client secrets. `expo-maps` on iOS uses Apple Maps — **no API key**. Profile
  read/write uses the existing Supabase URL + anon key (RLS guards the data).
- `app.config.ts` gains the `expo-maps` plugin (location permission string). No new env vars.
- Google Places/Routes + LLM keys remain backend `supabase secrets`; the app never sees them.

## 5. Testing

- **`lib/onboarding.ts`** — unit-tested (pure): `stateFromProfile` seeds correctly (incl.
  null profile), `canContinue` enforces interests ≥ 1 / non-empty location / valid tripDays,
  `buildRequest` produces a correct `GenerateRequest`.
- **`lib/profile.ts`** — unit-tested with an injected supabase stub: `getProfile` queries
  the right table/column and returns `null` for no row; `upsertProfile` upserts the right
  shape; errors map sensibly.
- **Components / native** — thin; no automated tests (no RNTL, per 2a). Verified by
  type-check (`tsc`) and **manual device smoke**: onboarding → generate → list renders, map
  toggle shows pins, error path (force a failing generate) shows retry, empty path renders
  the "limited data" message.
- No E2E harness (YAGNI).

## 6. Error & Edge-Case Handling

| Case | Handling |
|---|---|
| Generate non-2xx (`ApiError`) | Generating screen shows the message + **Try again** (re-run) + **Edit** (back to onboarding) |
| Network failure mid-generate | Same error UI as above |
| Itinerary returned with 0 days/stops (thin/rural data) | Itinerary empty state: "limited data here, try a broader location" + **Edit** |
| No profile yet (first run) | `getProfile` returns null → onboarding seeds with empty defaults |
| Profile upsert fails | Surface a non-blocking warning but still attempt generate (profile save is best-effort; the trip request carries the prefs regardless) |
| User backs out of onboarding | Returns to home; `TripFlow.reset()` clears stale state |
| `expo-maps` alpha breakage on SDK bump | Map view is isolated to `itinerary.tsx`; list view is the primary renderer and works without the map |

## 7. Open Questions (resolved before/within plan)

- `expo-maps` exact API for markers/region in SDK 56 alpha — confirmed against the
  versioned docs in the plan's map task before coding (per `mobile/AGENTS.md`).
- Interest taxonomy is a fixed in-app list for 2b: `scenic, food, history, nightlife,
  outdoors, art, shopping`. Server treats interests as free-form strings, so the list can
  grow later without a contract change.
- Max trip days bound (the `N` in tripDays 1..N) — set a sane cap in the plan (e.g. 14) to
  bound cost; backend already validates `tripDays >= 1`.

## 8. Deferred (YAGNI)

POI detail screen · diet/accessibility collection · saved-trips list · edit
(reorder/add/remove/swap/regenerate) · lodging picker · offline cache · map on Android
(iOS-only app) · React Native Testing Library · monorepo shared-types package.
