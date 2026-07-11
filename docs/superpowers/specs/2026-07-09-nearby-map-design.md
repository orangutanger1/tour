# Nearby map — current location → nearby attractions — design

**Date:** 2026-07-09
**Status:** Approved, ready for plan
**Build order:** 3 of 3 (A → B → C). Last because it adds a new native
dependency (`expo-location`) that requires a fresh EAS build.

## Purpose

A traveler standing somewhere wants to know what's worth seeing right around
them, right now. This adds a lightweight "explore near me" surface: a map
centered on the user's GPS location with nearby attraction markers.

## Placement — button on Trips, not a tab

No new tab. The Trips screen (`mobile/app/(app)/(tabs)/index.tsx`) gets a
compact map card / button ("Explore near me" / small map preview). Tapping it
opens a full-screen `mobile/app/(app)/nearby.tsx`. Tab bar is unchanged.

## Scope — v1 is view-only

Primary (and only) action on a result: **view detail** via the existing
`poi-detail` screen. No add-to-trip, no directions, no interest/diet filtering
in v1 — those are explicit follow-ups.

## Components

### 1. Entry point — `(tabs)/index.tsx` (extend)

A compact card near the top or bottom of the Trips list: small static map-styled
button labeled "Explore near me". Routes to `/nearby`. Uses existing `Card` /
design-system primitives; no logic beyond navigation.

### 2. Nearby screen — `mobile/app/(app)/nearby.tsx` (new)

- On mount, request foreground location permission via `expo-location`
  (`requestForegroundPermissionsAsync`). Get current position
  (`getCurrentPositionAsync`).
- Call `nearby-attractions` edge fn with `{ lat, lng, radiusKm }` (default
  radius ~5 km). Receive `Poi[]`.
- Render full-screen `AppleMaps.View` (same component the itinerary map uses)
  centered on the user, one marker per attraction, plus a scrollable list
  (bottom sheet or list below the map) of the same POIs.
- Tap a marker or list row → navigate to `poi-detail` with the place id (screen
  already exists).

### 3. Backend — `supabase/functions/nearby-attractions/index.ts` (new)

Auth-gated edge fn. Request `{ lat, lng, radiusKm }`. Reuses
`fetchPois({ kind:"attraction", location: "<reverse-geocoded or lat,lng>",
locationBias:{ center:{lat,lng}, radiusKm } })` from `supabase/_shared/places.ts`.
Returns the `Poi[]` (id, name, coords, rating, price, address). No persistence.
Keeps the Google key server-side (same pattern as every other edge fn).

### 4. Dependency + config

- Add `expo-location` (Expo SDK 56 — check exact version at
  https://docs.expo.dev/versions/v56.0.0/).
- Add the iOS location usage string (`NSLocationWhenInUseUsageDescription`) via
  app config / plugin.
- **New native dep → a new EAS build is required** before device smoke; OTA
  will not pick it up (documented pattern in project memory).

## Data flow

Trips button → `/nearby` → `expo-location` permission + GPS → `nearby-attractions`
edge fn → `fetchPois` (Google Places, location-biased) → `Poi[]` → map markers +
list → tap → `poi-detail`.

## Error handling

- **Permission denied** → explanatory empty state with a button to open Settings
  and a "Back" action. No crash.
- **Location unavailable / timeout** → retry affordance + message.
- **No attractions within radius** → empty state suggesting a wider area (radius
  is a v1 constant; widening UI is a follow-up).
- **Edge fn / network failure** → error state with retry; map still shows the
  user's location.

## Testing

- `nearby-attractions/handler_test.ts` (deno): valid lat/lng → `fetchPois`
  called with the right `locationBias`; returns `Poi[]`; bad/missing coords →
  400.
- Mobile: permission-denied path renders the settings empty state; a mocked
  `Poi[]` renders markers + list; row tap routes to `poi-detail`.
- Device smoke (after EAS build): real GPS returns nearby spots, marker tap
  opens detail.

## Out of scope (v1)

Add-to-trip from a nearby result (ties to Spec B; follow-up), directions /
turn-by-turn handoff, interest/diet filtering, adjustable radius UI, background
location, caching results across sessions.
