# Itinerary Generation & Guidance — Design

Date: 2026-06-28
Status: Approved design, pending implementation plan

## Problem

On-device testing of the current MVP surfaced three gaps:

1. **Autocomplete too broad.** Typing "Lisbon" returns streets (`Lisbon Dr`),
   businesses, and every "Lisbon" worldwide. `places.ts` sends `{input: query}`
   with no type filter and returns only the display text — the `placeId` is
   discarded.
2. **Days picker is clunky.** `onboarding.tsx` uses preset chips plus −/+
   buttons. User wants a spinning dial wheel (keeping the presets).
3. **Itinerary doesn't guide.** It lists sites with blurbs and "X min from
   previous", and the map shows bare markers for all days at once. There is no
   route line and no sense of order or a path to follow.

Underlying all three: the system never resolves *what kind of place* the
destination is (landmark vs city vs country), so it can't size the trip area or
keep the geography coherent. A country destination scatters stops nationwide; a
landmark is too narrow.

## Goals

- Destination autocomplete suggests only travel destinations (cities, regions,
  countries, landmarks).
- Generation is **granularity-aware** (resolves the real place) and
  **transport-aware** (a new user preference controls how wide an area the trip
  covers and how stops are connected).
- Itinerary guides the user: ordered/numbered stops, per-day map with a real
  route line (road/walking path).
- Days chosen via a native iOS wheel, presets retained.

## Non-goals

- Android support. The app commits to `AppleMaps` (expo-maps) = iOS-only. Map
  and wheel choices assume iOS.
- Multi-city spanning trips (country → several cities with inter-city legs).
  Out of scope; the "Far-ranging" transport level widens a *single* focus area,
  it does not split into multiple cities. Revisit later as its own project.
- Turn-by-turn live navigation. The route line is an overview, not nav.

## Key decisions

- **iOS-only** for these features (matches existing AppleMaps usage).
- **Single focus-area, hybrid by transport pref.** Every destination resolves
  to one coherent area; the transport preference sizes that area.
- **3 transport levels:** Compact / Balanced / Far-ranging (mirrors the
  existing 3-level budget & pace UI).
- **Real road/walking polyline** for the route line (from Routes API), not
  straight connectors.
- **Days wheel:** `@react-native-picker/picker` (native iOS UIPickerView).

## Architecture — 4 phases

Build in order; each is independently shippable and testable.

```
A. Destination resolution (foundation)   → unlocks C, D
B. Onboarding: days wheel + transport pref
C. Granularity + transport-aware generation   (needs A)
D. Guided itinerary + route on map            (needs C)
```

---

### Phase A — Destination resolution (foundation)

**Autocomplete (`supabase/_shared/places.ts`, `searchAutocomplete`)**
- Add to request body:
  `includedPrimaryTypes: ["locality","administrative_area_level_1","country","tourist_attraction"]`
  (Autocomplete New caps at 5 individual types; these 4 cover city / state-province /
  country / landmark and exclude `route` and `restaurant`.)
- Return `{ text: string; placeId: string }[]` instead of `string[]`. `placeId`
  comes from `suggestions[].placePrediction.placeId`.

**Place details (new helper in `places.ts`)**
- `fetchPlaceDetails(placeId)` → GET `https://places.googleapis.com/v1/places/{placeId}`
  with field mask `location,viewport,types,displayName`.
- Returns `{ center: {lat,lng}, viewport: {low,high}, types: string[], name }`.

**Data flow**
- Mobile `placesClient` + `onboarding.tsx` keep the selected suggestion's
  `placeId` in `OnboardingState` (`destinationPlaceId`).
- `GenerateRequest` gains `destinationPlaceId?: string`.
- `generate-itinerary` handler: if `destinationPlaceId` present → `fetchPlaceDetails`
  for center+viewport+types. If absent (free-typed, no selection) → fall back to
  the existing text path (searchText on the location string to derive a center).
  Backward compatible.

**Tests:** autocomplete sends `includedPrimaryTypes` and maps `{text, placeId}`
(mock httpFetch); `fetchPlaceDetails` parses center/viewport/types (mock).

---

### Phase B — Onboarding: days wheel + transport pref

**Days wheel (`onboarding.tsx` step 1)**
- Add dep: `npx expo install @react-native-picker/picker`.
- Replace the −/+ `Button` row with `<Picker>` (1..`MAX_TRIP_DAYS`), native iOS
  wheel. Keep the preset chips above; tapping a chip sets `tripDays` (wheel
  follows via its `selectedValue`).

**Transport preference**
- `Prefs` gains `transport: "compact" | "balanced" | "far"` (both
  `supabase/_shared/types.ts` and the mobile mirror `mobile/lib/types.ts`).
  No DB migration — profiles store `default_prefs` as JSON.
- `OnboardingState` gains `transport`; `stateFromProfile` defaults `"balanced"`;
  `prefsFromState`/`buildRequest` include it.
- UI: a 3-option selector (same Pressable card pattern as Budget/Pace), labels:
  - **Compact** — "Stay close. Walkable cluster, minimal transit."
  - **Balanced** — "City + nearby. Some driving."
  - **Far-ranging** — "Cover a wide region. Longer legs OK."
- Review screen (step 2) shows transport.
- Persistence: `getProfile`/`upsertProfile` already round-trip the whole `Prefs`
  JSON, so `transport` persists with no change beyond the type.

**Tests:** `buildRequest` includes `transport` + `destinationPlaceId`;
`stateFromProfile` defaults transport.

---

### Phase C — Granularity + transport-aware generation (needs A)

**Area sizing (new pure fn, backend)**
- `areaRadiusKm({ viewport, transport })`:
  - `viewportRadius` = half the geo-diagonal of the place-details viewport.
  - Compact: `clamp(viewportRadius * 0.3, 2, 5)` km
  - Balanced: `clamp(viewportRadius, 5, 25)` km
  - Far-ranging: `clamp(viewportRadius, 25, 150)` km
  - (Landmark viewport is tiny → compact ≈ 2 km; country viewport is huge →
    clamped to the ceiling, anchored on center. Tunable knobs — these are first
    cut, expect to adjust on device.)

**fetchPois (`places.ts`)**
- Add `locationBias: { circle: { center, radius: meters } }` to the searchText
  body, using the resolved center + `areaRadiusKm`. Results cluster in-area
  instead of scattering. Keep `textQuery` as the category phrase.

**Routing (`routes.ts`)**
- `travelMode` by transport: Compact → `WALK`, Balanced/Far → `DRIVE`.
- Per-leg sanity cap by transport (drop/penalize legs beyond the cap so a "day"
  stays coherent): Compact ~25 min walk, Balanced ~30 min, Far ~90 min drive.

**curate / LLM**
- Pass `transport` and the area context into the prompt so day grouping respects
  "minimize transit" vs "cover ground".

**Tests:** `areaRadiusKm` table (landmark/city/country × 3 transport levels);
`fetchPois` includes `locationBias`; `routes.ts` picks travelMode by transport.

---

### Phase D — Guided itinerary + route on map (needs C)

**Backend route polyline**
- `routes.ts` FIELD_MASK gains `routes.polyline.encodedPolyline`.
- `orderStops` returns `{ ordered: Ordered[]; polyline?: string }` (encoded).
- Thread an encoded `routePolyline?: string` onto each `ItineraryDay`
  (`types.ts` + mobile mirror).

**Mobile (`itinerary.tsx`)**
- **Per-day map:** add a day selector (segmented control). Map shows the
  selected day's stops only — fixes the current all-days-mashed markers.
- **Numbered stops:** AppleMaps `annotations` numbered in visit order; route
  drawn via `polylines` (decode the encoded polyline → coordinate array).
- **Polyline decoder:** ~15-line inline Google polyline-decode util in
  `mobile/lib/poi.ts` (no dep — standard algorithm).
- **List view:** number stops 1·2·3 in the SectionList; show travel mode + min
  per leg ("12 min walk from previous").

**Tests:** polyline decoder (known encoded string → coords); `routes.ts` parses
`encodedPolyline` (mock); map builds per-day markers from `selectedDay`.

---

## Data model changes (summary)

- `Prefs.transport: "compact" | "balanced" | "far"` (backend + mobile mirror).
- `searchAutocomplete` → `{ text, placeId }[]`.
- New `fetchPlaceDetails` → `{ center, viewport, types, name }`.
- `GenerateRequest.destinationPlaceId?: string`.
- `ItineraryDay.routePolyline?: string` (encoded).
- No DB migration (profiles use a `default_prefs` JSON column).

## Risks / open knobs

- **Area radius constants** are first-cut guesses; tune on device (the physical
  world needs calibration a minimal model can't see).
- **Country destinations** with a single focus area will still feel limited
  ("Italy" → one anchored area). Acceptable per non-goals; multi-city is the
  future upgrade path.
- **Place Details cost** — one extra Places call per generation. Cheap; only on
  generate, not per keystroke.
- **Polyline length** — `WALK`/`DRIVE` polylines can be long; AppleMaps handles
  it, but verify render perf with a packed day.

## Testing approach

Unit tests with mocked `httpFetch` for all backend changes (existing pattern).
Pure functions (`areaRadiusKm`, polyline decode) get direct assertion tests.
Final verification on device (sign in → generate across landmark/city/country ×
3 transport levels).
