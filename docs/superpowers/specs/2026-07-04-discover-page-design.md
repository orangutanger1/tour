# Discover Page (Home Phase 3) — Design

**Date:** 2026-07-04
**Status:** Approved (brainstorm) → ready for writing-plans
**Supersedes:** `2026-06-30-home-phase3-discover-design.md` (saved-POIs/Surprise-Me scope
was never implemented; this redesign replaces the Discover-tab portion. Saved POIs,
poi-detail, and Surprise Me remain future candidates, out of scope here.)

## Problem

The Discover tab is a placeholder (`EmptyState` "coming soon"). Goal: a
Polarsteps-style explore surface — curated destinations with images, browsable by
recommendation ("For you"), tag (popular / trending / under the radar), travel theme,
and continent — that feeds the app's core loop (tap destination → plan a trip).

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Data source | Hybrid: bundled static dataset (instant, day-1 content) + `destinations` Supabase table read directly via supabase-js; non-empty remote result replaces bundle. Content updates = SQL insert, no app release. No edge function. |
| Tap action | Destination **detail screen** (hero, blurb, highlights) with "Plan a trip" CTA → onboarding prefilled. |
| Globe header | **Flag strip**: horizontal emoji-flag country chips; tap → filtered list. No 3D globe. |
| "Trips from other users" | Impossible (no shared trips). Substituted by curated destination sections. |
| Glass look | `expo-blur` BlurView surfaces (new native dep — a new EAS build is already pending for other reasons). |
| Press animation | Core RN `Animated` timing (no reanimated on touchables — cssInterop device bug), smooth non-bouncy. |

## Data model

### `Destination` type (`mobile/lib/destinations.ts`)

```ts
export type Theme = "nature" | "adventure" | "culture" | "food" | "wildlife" | "city" | "beach";
export type Tag = "popular" | "trending" | "underRadar";

export interface Destination {
  id: string;             // slug, e.g. "kyoto-japan"
  name: string;           // "Kyoto"
  country: string;        // "Japan"
  countryCode: string;    // "JP" (drives emoji flag)
  continent: "africa" | "asia" | "europe" | "north-america" | "oceania" | "south-america";
  themes: Theme[];        // 1–3 per destination
  tags: Tag[];            // 0–2 per destination
  blurb: string;          // 1–2 sentences
  highlights: string[];   // 3–5 short strings
  imageUrl: string;       // Wikimedia/Unsplash hotlink; rendered via expo-image (cached)
  lat: number;
  lng: number;
}

export const DESTINATIONS: Destination[] = [ /* ~48 curated */ ];
```

Dataset coverage requirements: every theme ≥ 5 destinations, every continent ≥ 4,
each tag ≥ 8, ≥ 12 distinct countries (flag strip needs variety).

### Remote override — migration `0008_destinations.sql`

Table `public.destinations` mirroring the type (snake_case columns, `themes text[]`,
`tags text[]`, `highlights text[]`). RLS enabled, **select-only policy for
authenticated users**; no insert/update/delete policies (content managed via SQL as
service role). Seeded empty.

### Merge logic — `mobile/lib/discover.ts` (pure, unit-tested)

- `fetchDestinations(client)` → select all rows, map snake_case → `Destination`.
  Rows with unknown theme/tag/continent values are dropped (forward-compat guard).
- Screen uses react-query: `initialData` = bundled `DESTINATIONS`; query fn returns
  remote rows **if ≥ 1 row**, else bundle. Fetch error → bundle (react-query keeps
  initialData). Full replace, no per-row merging.

### Selection logic — `mobile/lib/discover.ts`

- `INTEREST_THEMES: Record<string, Theme[]>` — maps onboarding `INTERESTS` to themes:
  `scenic→[nature, beach]`, `outdoors→[adventure, nature]`, `food→[food]`,
  `history→[culture]`, `art→[culture, city]`, `nightlife→[city]`, `shopping→[city]`.
- `forYou(destinations, interests, n=8)` — score = |destination.themes ∩ mapped themes|,
  tie-break: tagged (popular/trending) first, then stable dataset order. Zero
  interests or zero matches → popular-tagged fallback. Each returned card shows its
  first tag as badge; untagged shows no badge.
- `byTag(destinations, tag)`, `byTheme(destinations, theme)`,
  `byContinent(destinations, continent)`, `byCountry(destinations, countryCode)` — filters.
- `countries(destinations)` — unique `{country, countryCode}` list, dataset order.
- `flagEmoji(countryCode)` — regional-indicator conversion, pure function.

User interests come from the existing profile (`lib/profile.ts` prefs); signed-in-but-
never-onboarded users have none → popular fallback.

## Screens

### Discover tab — `app/(app)/(tabs)/discover.tsx` (replace stub)

Single vertical `ScrollView` (dataset is small; no virtualization needed), sections
as horizontal `FlatList` carousels:

1. **Header** — comet logo (asset) + "Discover" title; flag strip below (horizontal
   emoji-flag country chips, glass style) → `/discover-list?type=country&value=JP`.
2. **For you** — large cards (image, glass tag badge, name, country) from `forYou(...)`.
3. **Under the radar** — medium cards, `byTag(underRadar)`.
4. **Browse by theme** — 7 theme tiles (image from first destination of that theme,
   theme label) → `/discover-list?type=theme&value=nature`.
5. **Popular** — medium cards, `byTag(popular)`.
6. **Trending this month** — medium cards, `byTag(trending)`.
7. **Browse by continent** — 6 tiles → `/discover-list?type=continent&value=asia`.

Destination cards → `/destination-detail?id=kyoto-japan`.

### Filtered list — `app/(app)/discover-list.tsx` (new)

Params `{ type: "country" | "theme" | "continent" | "tag", value }`. Title derived
from params (e.g. "🇯🇵 Japan", "Nature", "Asia"). 2-column grid of destination
cards using the corresponding filter. Unknown/empty filter → existing `EmptyState`.

### Destination detail — `app/(app)/destination-detail.tsx` (new)

Param `id`; destination looked up from the same react-query data. Layout: full-bleed
hero image (gradient scrim), name + flag + country, tag badge, blurb, highlight
chips, theme chips, sticky bottom glass CTA bar with **"Plan a trip"** button →
`router.push({ pathname: "/onboarding", params: { destination: "Kyoto, Japan" } })`.
Unknown id → `EmptyState`.

### Onboarding prefill (small change to `onboarding.tsx`)

Accept optional `destination` route param: when present and no `tripFlow.lastRequest`
seed, initial state gets `location = destination` (no placeId — generation already
handles free-text locations). Nothing else changes; existing edit-trip rehydrate
path takes precedence.

## Glass + press animation

### `components/ui/GlassPress.tsx` (new)

Core RN `Pressable` + core `Animated.View` (NOT reanimated — cssInterop device bug,
see `noAnimatedClassName` guard): `Animated.timing` on press-in to scale 0.97 +
opacity 0.9 (~120ms, `Easing.out(Easing.quad)`), press-out back (~180ms). Native
driver. No spring, no bounce. Used by all Discover touchables; existing
`PressableScale` elsewhere untouched.

The `noAnimatedClassName` guard test must not flag GlassPress: className goes on a
plain wrapper `View`/`Pressable`, animated node styles via `style` only.

### Glass surfaces

`expo-blur` `BlurView` (new dependency, `npx expo install expo-blur`) for: tag
badges on cards, flag chips, detail-screen sticky CTA bar. Subtle tint per design
system (sunset-soft palette from `ui/gradients.ts`). Everything else stays on
existing `Card`/`Text`/`Chip` components.

### Logo

Copy provided `logo.png` → `mobile/assets/images/logo.png`; render in Discover
header (~28pt). App-icon replacement is a separate decision, not in scope.

## Error / empty / edge states

- Remote fetch fails or empty → bundled dataset (silent; log only).
- Image fails to load → `expo-image` placeholder: gradient block (existing pattern).
- No profile interests → For You = popular fallback (badge still shows tag).
- Filter yields zero (possible with future remote data) → `EmptyState`.
- Unknown detail id → `EmptyState`.
- Offline → bundle + expo-image disk cache; no spinners blocking render (initialData).

## Testing (TDD per task)

- `lib/discover.ts` — unit: forYou scoring/tie-break/fallbacks, all four filters,
  `countries`, `flagEmoji`, remote-row mapping incl. unknown-enum drop.
- `lib/destinations.ts` — dataset invariants test: unique ids, coverage requirements
  (themes/continents/tags/countries minimums), all fields non-empty, valid enums.
- `onboarding` — unit: pure `destination`-param seeding helper; lastRequest wins.
- Screens: no render-test infra in repo (project pattern = logic tests + tsc +
  device smoke); screens verified by tsc and device smoke.
- Image URLs: scripted HTTP check that every `imageUrl` returns 200.
- `GlassPress` — passes the `noAnimatedClassName` guard (no className on Animated).
- Migration RLS: authenticated select-only (verified at deploy time).

## Out of scope (YAGNI)

- Search bar, favorites/wishlist on Discover, pagination, poi-detail, Surprise Me.
- 3D globe. Per-destination Google placeIds. CMS/admin for content.
- App icon change.
