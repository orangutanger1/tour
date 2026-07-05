# Onboarding Growth Funnel (Hook → Qualify → Convert) — Design

**Date:** 2026-07-04
**Status:** Approved

## Goal

Insert a pre-onboarding growth funnel — inspired by Wanderlog's onboarding structure but
rewritten around Beacon's actual product (not copied verbatim) — between the existing
branded intro screen and the trip-builder wizard (destination/dates/interests/etc). The
funnel qualifies the user, primes them with relate-statements, showcases Beacon's real
differentiators, asks for notification permission and acquisition source, and ends in a
soft trial paywall with a downsell fallback. It does not change the existing 1-free-trip
gate.

## Decisions (user-approved)

| Decision | Choice |
|---|---|
| Placement | Prepended into the existing `/onboarding` step machine, between `intro` and `destination`. No new route. |
| Social proof | No fabricated stats (no "recommended by 100+ publications" style claims) — reframed as honest, aspirational value-prop copy and a comparison-to-manual-planning card, not a comparison to a competitor's user base. |
| Trial paywall | Soft-sell only. "Not now" always continues to the existing free-trip wizard — no change to the 1-free-trip gate. |
| Trial/discount products | Out of scope here — separate follow-up using `asc-revenuecat-catalog-sync`/`asc-ppp-pricing`. Screen copy is driven by what RevenueCat actually returns, so it's honest today and activates automatically once configured. |
| Feature showcase content | Beacon's real differentiators (anti-backtracking routing, live map/hours data) — no invented features (e.g. no Gmail-import/flight-tracking screen; Beacon has neither). |
| Relate statements | Original, tied to Beacon's actual pain points (routing/backtracking, live data) — not reworded Wanderlog lines. |

## 1. Architecture

`app/(app)/onboarding.tsx` is a single-file step machine: `STEPS` (an ordered tuple of
step keys, `lib/onboarding.ts`) + `useState<number>` step index; the visible step is
`STEPS[step]`, rendered inside one `Animated.View`, advanced by the pinned footer's
Continue button gated by `canContinue(step, state)`.

Going from 14 steps to ~26 makes the current single-file render block (already 480
lines) unmanageable. Refactor as part of this work:
- `onboarding.tsx` becomes the orchestrator only: step machine, header/back, progress
  bar, footer. No per-step JSX inline.
- Each step's render logic moves to `mobile/components/onboarding/steps/<StepName>.tsx`,
  taking `state`/`setState` (and any step-specific callbacks) as props.
- `STEPS`, `canContinue`, `OnboardingState`, `buildRequest`, `prefsFromState` all stay in
  `lib/onboarding.ts` as today — this refactor only moves rendering, not the step-machine
  contract, so the existing `STEPS.indexOf`-keyed tests keep working unmodified apart from
  new entries.

No new route, no new screen family — `postAuthRoute` still sends new users to
`/onboarding` unchanged.

## 2. New steps (inserted between `intro` and `destination`)

| # | key | type | content |
|---|-----|------|---------|
| 1 | `planningCheck` | single-select (`OptionCard`) | "How's trip planning working for you?" — Great / Could be better / I don't really plan |
| 2 | `hardestParts` | multi-select (`Chip`), non-gating | "What's the hardest part of planning a trip?" — realistic daily pacing, hidden gems vs. tourist traps, keeping stops in a sane order, fitting in food/breaks, coordinating with a group |
| 3 | `goals` | multi-select (`Chip`), non-gating | "What do you want out of Beacon?" — save time, avoid backtracking, discover local spots, stay flexible, less stress |
| 4 | `goodPlace` | ethos transition | "You're in a good place." — short segue into the showcase pair below |
| 5 | `relateA1` | Y/N (`RelateStatement`) | "My last itinerary had me crossing back through the same neighborhood twice in one day." |
| 6 | `relateA2` | Y/N | "I spend more time figuring out what order to visit places than actually picking them." |
| 7 | `showcaseRouting` | ethos | Reuses existing `craft` step content ("Routed like a local"), moved here from its current mid-wizard slot |
| 8 | `relateB1` | Y/N | "I've shown up somewhere only to find out it's closed." |
| 9 | `relateB2` | Y/N | "Half my planning is just double-checking hours and travel times." |
| 10 | `showcaseMaps` | ethos | Reuses existing `trust` step content ("Built on real map data"), moved here |
| 11 | `notifications` | permission prompt | "Never miss a change" — `expo-notifications` request, "Not now" skip |
| 12 | `attribution` | single-select | "How'd you hear about us?" — App Store search, friend/family, Instagram/TikTok, Google search, other |
| 13 | `compare` | ethos, new comparison card | "You're in the right place" — Beacon's approach vs. manual/spreadsheet planning (no competitor-user stats) |
| 14 | `trialOffer` | soft paywall | See §4 |

`craft` and `trust` are removed from their old mid-wizard position (now redundant).
`classics` and `midway` stay where they are — brand flavor, not feature pitches.

All new quiz/relate/ethos steps are non-gating (Continue always enabled), matching the
existing ethos-step convention, to keep the funnel low-friction.

## 3. Data, persistence, component reuse

- `planningCheck` / `hardestParts` / `goals` / `attribution` answers merge into
  `profiles.default_prefs` jsonb (new keys: `planning_check`, `hardest_parts`, `goals`,
  `attribution_source`) via the existing `upsertProfile`/`prefsFromState` pattern — no
  migration needed, jsonb already supports arbitrary keys.
- Relate-statement (`relateA1/A2/B1/B2`) answers are **not persisted** — pure engagement
  priming, same precedent as the existing `travelParty` step.
- New components: generic `RelateStatement` (Yes/No, reused 4x), `notifications`
  permission screen (wraps `expo-notifications`), `compare` 2-column comparison card. All
  built from existing primitives (`Button`, `Chip`, `OptionCard`, `Card`, `gradients.ts`)
  — no new asset/video/Lottie pipeline.
- `PlanCard` (currently local to `paywall.tsx:21-39`) is promoted to
  `components/ui/PlanCard.tsx` since both `/paywall` and the new `trialOffer` step need
  it — avoids duplicating plan-selection UI.
- `expo-notifications` is a new native dependency → requires a new EAS build. Several
  other pending items already need one, so this rides along rather than forcing an extra
  build cycle.

## 4. Trial paywall + downsell (honesty mechanism)

No RevenueCat/ASC product configuration happens in this spec — that's a separate
follow-up task using `asc-revenuecat-catalog-sync`/`asc-ppp-pricing`. Instead, the
`trialOffer` step reads whatever RevenueCat actually returns for the fetched package:

- If `pkg.product.introPrice` (or an equivalent free-trial intro offer) is present →
  render "Start your 7-day free trial" copy.
- If absent (the case today) → render the existing plain "Go Pro" copy, identical to
  `/paywall`.

Dismissing `trialOffer` ("Not now" / X) shows a downsell overlay ("Not yet convinced?
One-time offer") **only if** a win-back/promotional package is actually present in
RevenueCat; otherwise the overlay is skipped entirely and the flow continues straight to
`destination`. Either way, declining always continues into the existing free-trip wizard
— the 1-free-trip gate (`lib/gate.ts`) is unchanged.

## Error handling

- `notifications` step: permission denial is not an error — continue regardless of OS
  response, same as other non-gating steps.
- `trialOffer`/downsell purchase errors: identical handling to existing `/paywall`
  (`userCancelled` silent return, other errors inline text).
- RevenueCat package fetch failure on `trialOffer`: same loading/error states as
  `/paywall` today (inline error, no alert).

## Testing

- **jest** (pure logic only, per repo convention): extended `STEPS` shape/order test;
  `canContinue` matrix (already keyed by `STEPS.indexOf`, so new entries slot in without
  hardcoded indices); `prefsFromState` includes the four new profile keys;
  `buildRequest`/`stateFromRequest` round-trip unaffected (new fields aren't part of
  `GenerateRequest`).
- **Device (manual):** full funnel walkthrough, notification permission prompt,
  trial/downsell copy fallback (no intro offer configured yet → should show plain "Go
  Pro" copy, not false trial claims), confirm declining always reaches the free-trip
  wizard. Requires the new EAS build (native `expo-notifications` dep).

## Out of scope

- RevenueCat/ASC trial intro offer + win-back/promotional discount product setup
  (separate follow-up task).
- Any analytics/event-tracking SDK — no such SDK exists in the app today; quiz/attribution
  answers are stored as profile prefs only, not event-tracked.
- Android, real user-review/App-Store-rating display (revisit once Beacon has reviews),
  Gmail import / flight tracking (feature doesn't exist).
