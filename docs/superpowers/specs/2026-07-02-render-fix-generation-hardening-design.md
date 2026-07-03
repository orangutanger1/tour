# Render fix + generation hardening + dates UX

**Date:** 2026-07-02
**Status:** Draft — awaiting user review

## Context

Device smoke (2026-07-02) showed the app looking unstyled: invisible Continue
button, collapsed gradient CTAs, uncontained option rows, bare interest chips,
markers stacked above autocomplete text, progress bar never filling, unclear
selection states. Separately, itinerary generation fails for 12-day trips to
sparse destinations (Portola Valley CA, Paro Bhutan) with either
"fetch failed: The request timed out." or "could not build itinerary".

### Diagnosis 1 — one rendering bug, not missing design

NativeWind classNames are silently dropped on device for every component that
goes through reanimated's `createAnimatedComponent` + `cssInterop`
(`PressableScale`, `AnimatedPressable`, `AnimatedView` in
`mobile/components/ui/PressableScale.tsx`). Plain core `Pressable`/`View`
classNames render correctly in the same build (Segmented, RangeCalendar, back
button, Input all styled). Every visual complaint traces to this:

| Symptom | Dropped styling |
|---|---|
| Invisible Continue | Button `bg-accent h-14 rounded-pill` → white text on cream |
| Gradient CTA = thin bar | `h-14 px-6` → collapses to text height (gradient itself renders — it's a style prop) |
| Options uncontained / selection unclear | OptionCard `border-2 p-4 bg-surface` + selected `bg-accent-soft border-accent` |
| Chips bare | Chip `h-11 px-4 rounded-pill border` |
| Marker above suggestion text | row `flex-row items-center gap-3 p-4 border` |
| Progress bar empty | fill `h-full bg-accent` on `AnimatedView` |
| Review rows: chevron floats below | `flex-row justify-between p-4 border` |

The Sunset Soft design exists in code and was never rendered on device
(memory: it was merged without visual verification because the EAS build was
pending).

### Diagnosis 2 — generation failures, two distinct modes

1. **Client timeout.** iOS fetch aborts at ~60s. A 12-day trip splits into 2
   legs → 2 parallel LLM curations (30s timeout × up to 2 attempts each) +
   Places fetches + per-day routing. The edge function keeps working past the
   client's 60s cap → "fetch failed: The request timed out."
2. **CurationError 502.** Sparse destinations return small POI pools (~10–20
   attractions). 12 days × 4–5 stops/day needs 50+ unique places;
   `validateItinerary(expectedDays)` can never pass → "could not build
   itinerary". Multi-leg splitting makes it worse by partitioning a tiny pool.

### Diagnosis 3 — dates UX

Both trip types use the same start+end range picker; "One way · Jul 3 → Jul 10"
reads like a flight-search mistake. The screen also shows the day count twice
(pill under calendar + summary line).

## Goals

1. Styled UI actually renders on device — no className path through cssInterop.
2. Generation never dies to a client timeout; long trips complete.
3. Sparse destinations degrade gracefully instead of erroring.
4. Dates step communicates trip-type semantics clearly.
5. CTA always visible and anchored.

## Non-goals

- Destination imagery (Places photos on trip cards / review hero). That is the
  single biggest visual gap vs. polished travel apps, but it adds backend
  surface (photo field masks, media proxy, caching) — **next spec**.
- Full re-theme. Palette, typography, spacing scale stay as-is.

## Open question (assumed, user AFK)

One-way date semantics. **Assumed: keep start+end range for both types**,
fix it with copy: calendar subtitle per type (Round trip: "Pick start and end
days — you'll loop back."; One way: "Pick start and end days — you'll end in a
different area."). If the user wants flysoar-style single-date one-ways or
wants the toggle dropped, Phase 3 changes accordingly.

## Design

### Phase 1 — render fix (mobile only)

**PressableScale** becomes a plain core `Pressable`:

```tsx
export function PressableScale({ style, className, ...props }: PressableProps & { className?: string }) {
  return (
    <Pressable
      {...props}
      className={className}
      style={(state) => [
        typeof style === "function" ? style(state) : style,
        state.pressed && { transform: [{ scale: 0.97 }] },
      ]}
    />
  );
}
```

- No reanimated, no `cssInterop`. Core-component className interop is proven
  working on device. Press feedback = instant 0.97 scale (spring lost —
  acceptable; can revisit with reanimated via style-prop-only animation later).
- `Chip` switches from `AnimatedPressable` to `PressableScale`; its pop
  animation goes (same trade).
- `ProgressBar` fill: keep `Animated.View` for the width spring but move ALL
  visual styling to the style prop (`backgroundColor`, `height: "100%"`,
  `borderRadius`) — style props on animated components work; only className
  doesn't.
- Repo-wide audit: every `AnimatedView`/`AnimatedPressable`/`Animated.View`
  usage with a className moves those classes to a style prop or to a nested
  plain `View` (known: `onboarding.tsx` step container `gap-5`,
  `generating.tsx` pulse wrapper `rounded-pill overflow-hidden`, itinerary/tab
  screens to be swept).
- `cssInterop` calls deleted; `AnimatedPressable`/`AnimatedView` exports remain
  (style-prop use only) or are dropped if unused after the sweep.

**Verification:** jest cannot catch this (it's native-runtime behavior). Add a
lint-style guard test: grep test asserting no `className=` on
`AnimatedView|AnimatedPressable|Animated\.` in `mobile/` — keeps the failure
class from creeping back. Device smoke confirms visually.

### Phase 2 — generation hardening (backend + client)

**2a. Async generation (kills client timeout).**

- Migration `0006_trip_status.sql`: `alter table trips alter column itinerary
  drop not null; alter table trips add column status text not null default
  'ready' check (status in ('generating','ready','failed')); add column
  error_message text;` Existing rows keep `ready`.
- `generate-itinerary` handler: validate request + daily cap synchronously,
  insert trip row with `status='generating'` and the request, return
  `{ tripId }` immediately (202). Heavy pipeline (resolve → fetch → curate →
  route → schedule) runs in `EdgeRuntime.waitUntil(...)`; on success writes
  itinerary + `status='ready'`, on failure `status='failed'` +
  `error_message` (user-readable: "could not build itinerary" etc.).
- Client `tripFlow.generate`: POST returns fast; generating screen polls the
  trip row every 3s (up to ~5 min) until `ready` → itinerary, or `failed` →
  existing error UI with the row's message. Poll = plain supabase select; no
  realtime subscription needed.
- Daily-cap counting updates to ignore `failed` rows so failed attempts don't
  eat the cap.

**2b. Sparse-pool degradation (kills CurationError for small places).**

Before curation, size reality check per leg:

- `minStopsPerDay` by pace (relaxed 2, balanced 4, packed 6).
- If `pool.size < tripDays × minStopsPerDay`, first reduce stops/day toward 2;
  if even `tripDays × 2 > pool.size`, cap `effectiveDays =
  floor(pool.size / 2)` (min 1) and curate that many days.
- Multi-leg only when the pooled attractions support it: if
  `pool.size / legs < 8`, collapse to a single leg (no partition of tiny
  pools).
- Result surfaces honestly: response/trip row carries
  `plannedDays < requestedDays` note; itinerary screen shows a one-line notice
  ("Only enough highlights here for N full days.").
- `validateItinerary` gets `expectedDays` = the degraded value, so validation
  matches what was asked of the LLM.

**2c. Autocomplete blank rows.** Filter with `s.text.trim()` in
`placesClient.ts` and in the edge handler's mapping. (Marker-above-text was
Phase 1's flex-row drop; this kills the truly-empty rows.)

### Phase 3 — dates UX + CTA anchoring + accent discipline

- **Dates step:** per-type subtitle copy (see Open question). Remove the
  duplicate day-count: keep the pill under the calendar, drop the summary
  text line. Segmented stays.
- **Pinned CTA bar:** onboarding footer gets `bg-bg` + top hairline
  (`border-t border-border`) + bottom safe-area padding so Continue reads as
  an anchored bar, never floating over content. Same treatment on generating
  error screen and review.
- **Accent discipline:** gradient variant reserved for the single hero action
  per flow ("Generate my trip", welcome CTA). All other primaries = solid
  crimson `bg-accent`. Blobs stay ≤ current opacity, decor-only. No new
  gradients.

## Testing

- Phase 1: existing jest suites stay green; new grep-guard test; device smoke
  checklist (Continue visible, cards contained, chips pilled, selection state,
  progress fill, suggestion rows horizontal).
- Phase 2: handler tests for 202 + row lifecycle (generating→ready,
  generating→failed), degradation math unit tests (pool 10 / 12 days →
  effectiveDays 5, stops/day 2; legs collapse), cap-ignores-failed test,
  poll logic test on client (mock supabase).
- Phase 3: snapshot/behavior tests for per-type copy; manual smoke.

## Rollout

Requires ONE new EAS build (expo-updates already in the binary after this
build; later JS fixes ship via `eas update`). Edge fn deploy + migration 0006
before the build reaches the device — old clients treat the new 202 body as an
error, so ship handler change and client change together, then build.
