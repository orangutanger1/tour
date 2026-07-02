# Sunset Soft — app-wide redesign, onboarding revamp, calendar dates

**Date:** 2026-07-01
**Status:** Approved (brainstorm complete)

## Goal

Move the app from its flat, functional design to a modern soft-minimal interface
(Duolingo / Discord / Saily / Airalo inspired): large rounded cards, generous
whitespace, oversized typography, subtle glassmorphism, restrained sunset
gradients, floating organic shapes, soft shadows, spring animations, one primary
action per screen. Restructure onboarding into one-question-per-page. Replace
day-count stepper with a date-range calendar plus a round-trip / one-way choice
that affects routing.

Decisions made during brainstorming:

- One spec, phased implementation plan (tokens → onboarding+backend → restyle sweep).
- Trip type (round / one-way) **affects routing**, not just metadata.
- Trips **store real dates** (`start_date`, `end_date`) — calendar is source of truth.
- Palette **evolves crimson** (no rebrand); sunset gradient family added.
- **Light mode only**; tokens structured so dark can come later.
- Onboarding asks **destination first**.
- Approach A: evolve existing NativeWind stack, custom calendar, zero new native
  dependencies — the entire redesign ships OTA (no EAS build).

Research notes (Wanderlog, Polarsteps, Duolingo, Saily/Airalo): quiz-style
one-question-per-screen onboarding with a top progress bar; a single bright CTA
per screen with everything else muted; 24px+ card radius with soft shadows;
oversized display type for prompts; celebratory/spring microinteractions.

## 1. Design language (tokens — `tailwind.config.js`)

- **Color**: keep `accent` crimson `#E11D48` and existing neutrals. Add:
  - Gradient stops (used via `expo-linear-gradient`, exported as constants from
    `components/ui/`): `sunset = [#E11D48, #F4526B, #FB923C]` for hero CTAs and
    hero cards; a soft variant for backgrounds/blobs.
  - Interest-category tints (soft bg + strong fg pairs): scenic teal, food amber,
    history indigo, nightlife violet, outdoors green, art pink, shopping blue.
- **Radius**: `sm 10, md 14, lg 20, xl 28, pill 999`. Cards default `xl`.
- **Type scale** (`ui/Text.tsx`): display 36/42 extrabold w/ tight tracking,
  title 28/34 bold, heading 20/26 bold; body 16, caption 14, label 13 unchanged.
- **Shadows**: `soft` / `card` / `float` (float ≈ 0 8px 24px rgba(26,14,18,0.10)).
- **Glass**: approximation only — `bg-white/75` + `border-white/60` hairline +
  soft shadow. No `expo-blur` (native dep → would force EAS build).
- **Organic shapes**: `Blobs` decor — 2–3 absolutely-positioned, low-opacity,
  giant-radius gradient Views behind hero areas. Static, cheap.

## 2. Component set (`mobile/components/ui/`)

- **Button**: spring press-scale (~0.97) via reanimated; new `gradient` variant
  (LinearGradient fill) reserved for the screen's single primary action; CTAs
  default lg (h-14/56px).
- **OptionCard** (new): icon + title + description, selected = accent ring +
  soft tint bg, spring press. Replaces inline budget/pace/transport Pressables.
- **Chip**: taller (h-11), optional leading icon, spring pop on select.
- **ProgressBar** (new): spring-animated fill; onboarding header.
- **RangeCalendar** (new): see §4.
- **Icon**: thin wrapper over `@expo/vector-icons` Ionicons (already bundled
  with expo — JS + fonts, OTA-safe). Tab bar gets real icons.
- **Screen**: optional `decor` prop rendering Blobs behind content.
- Existing components (Card, Input, TripCard, ListRow, EmptyState, Loading,
  AlbumSection, PhotoStack) restyled to new tokens.
- `ui/Stepper.tsx` no longer used by onboarding (calendar replaces it); delete
  it if nothing else imports it at implementation time.

## 3. Onboarding — one question per page

Eight pages, each: back arrow + animated ProgressBar header, display-type
prompt, one full-width pinned CTA. Slide+fade transitions between steps
(reanimated entering/exiting). Single-screen component with a step index (as
today), not eight route files — state stays in one place, transitions stay
cheap.

| # | Page | Content | Can continue when |
|---|------|---------|-------------------|
| 1 | Where to? | autocomplete cards; region-narrowing offer kept | destination chosen (typed text or placeId) |
| 2 | When? | trip-type segmented pill (Round trip / One way) + RangeCalendar; footer "Jul 12 → Jul 18 · 7 days" | valid range picked (1–30 days) |
| 3 | Interests | icon chip grid | ≥ 1 selected |
| 4 | Budget | 3 OptionCards | always (has default) |
| 5 | Pace | 3 OptionCards | always |
| 6 | Getting around | 3 OptionCards | always |
| 7 | Start point | optional autocomplete; "Skip" ghost action | always |
| 8 | Review | summary rows, each jumps back to its step; gradient "Generate my trip" | — |

Kept behaviors: profile seeding (pref steps arrive pre-selected → fast
tap-through), edit-trip rehydration via `stateFromRequest`, signed-out flow
(prepare → sign-in → generate).

`lib/onboarding.ts` changes: `OnboardingState` += `startDate`, `endDate`
(ISO `YYYY-MM-DD`), `tripType: "round" | "oneway"` (default `"round"`);
`tripDays` derived from dates (inclusive); per-step `canContinue` rewritten for
8 steps; `buildRequest` emits new fields; `stateFromRequest` restores them.

## 4. RangeCalendar

- Pure TS date math in `lib/dates.ts`: month grid generation (weeks × 7),
  range membership, inclusive day count, 30-day clamp (`MAX_TRIP_DAYS`),
  display formatting. Unit-tested; no date library.
- UI (`ui/RangeCalendar.tsx`): month header with chevron paging, weekday row,
  7-column grid. Past dates disabled, today outlined. Tap = start; tap same or
  later date = end (same date → 1-day trip); tap earlier date = new start; once
  a full range exists the next tap starts a new range. Endpoints solid accent
  circles; in-range days soft accent band; "N days" pill near footer.

## 5. Backend

- `GenerateRequest` (mobile `lib/api.ts` + `supabase/_shared/types.ts`, kept in
  sync by hand as today) += `startDate?`, `endDate?`, `tripType?`. `tripDays`
  stays (derived client-side) so the API remains backward compatible.
- **Migration `0005_trip_dates.sql`**: `trips` += `start_date date`,
  `end_date date`, `trip_type text` (nullable — old rows unaffected).
- **Sequencing** (`supabase/_shared`): round = final day's cluster is pulled
  back near the start anchor (or first-day area when no anchor); oneway = day
  clusters ordered to progress across the region away from the start. Existing
  behavior is closest to oneway; round becomes the default. Deno tests for both.
- Itinerary day headers show real dates when present: "Mon, Jul 14 · Day 1";
  fall back to "Day 1" for old trips.

## 6. App-wide restyle sweep

Token/component swap, one primary action per screen, oversized headers:

- **Tab bar**: floating pill bar (rounded, margins, shadow, real icons).
- **Trips dashboard**: display header, bigger TripCards (cover photo, date
  range, gradient placeholder when no photo), gradient "Plan a trip" CTA.
- **Signed-out landing**: Blobs hero + display copy + gradient CTA.
- **Itinerary**: dated day headers, timeline polish, glass day switcher.
- **Generating**: looping gradient/motion animation instead of static loader.
- **Sign-in, passport, discover, account, poi-detail, lodging, edit**: restyle
  pass with new tokens/components; no behavior changes.

## 7. Motion system (reanimated 4, installed)

Press-scale on all touchables (shared hook/wrapper); step slide+fade; chip
select pop; spring ProgressBar; generating loop. Springs subtle — soft-minimal,
not bouncy-cartoon.

## 8. Testing

- `lib/dates.test.ts` — grid, range selection rules, inclusive count, clamp,
  formatting.
- `lib/onboarding.test.ts` — updated: 8-step `canContinue`, new fields through
  `buildRequest`/`stateFromRequest`, tripDays derivation.
- Backend Deno tests — schema accepts new fields; sequencing round vs oneway.
- Existing jest + tsc suites stay green.

## 9. Phasing (implementation plan order)

1. **Foundation**: tokens, Text/Button/Chip/Card restyle, Icon, ProgressBar,
   OptionCard, Blobs, motion primitives.
2. **Onboarding + dates**: `lib/dates` + RangeCalendar, 8-page flow, request
   fields, migration 0005, sequencing round/oneway, dated itinerary headers.
3. **Sweep**: tab bar + all remaining screens.

Each phase lands as its own reviewable unit; all OTA-shippable (no new native
deps, no EAS build).

## Out of scope

Dark mode (tokens must not block it), expo-blur real glass, one-way explicit
end-location input, mascot/illustration system, Discover feature work.
