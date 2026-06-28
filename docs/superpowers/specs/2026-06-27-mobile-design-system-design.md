# Tour Guide — Mobile Design System Design Spec

**Date:** 2026-06-27
**Status:** Design approved, ready for implementation planning
**Depends on:** Phase 2a/2b mobile app (Expo SDK 56, Expo Router). Restyles the four screens
shipped in [[phase-2b-home-itinerary-state]]. Motivated by [[ui-must-be-designed-not-bare]].

## 1. Goal & Scope

The app works but looks bare-bones (raw RN primitives, inline styles, no theme). This project
stands up a **modern soft-minimal design system** — inspired by Duolingo / Discord / Saily /
Airalo — and restyles the existing screens on top of it. No new product features; this is a
visual/foundation layer that every later feature (saved trips, editing, lodging, offline)
builds on.

**Aesthetic:** large rounded corners, soft shadows, generous whitespace, a confident crimson
accent, strong type hierarchy, pill buttons, card-based layouts. Light theme.

**In scope:**
- NativeWind + gluestack-ui v2 setup, design tokens, Plus Jakarta Sans typography.
- A small set of reusable themed components (`components/ui/`).
- Restyle the 4 existing screens (`index`, `onboarding`, `generating`, `itinerary`) — same
  behaviour, new look.

**Out of scope (this project):** dark mode (tokens structured so it can drop in later), new
features/screens, and the "future polish" listed in §8.

## 2. Decisions (locked)

| Decision | Choice | Why |
|---|---|---|
| Styling engine | **gluestack-ui v2** on **NativeWind** (Tailwind for RN) | Prebuilt themeable components, low native footprint (copy-in source), works on SDK 56 New Arch |
| Accent | **Crimson** `#E11D48` (accent-2 `#FB7185`, pressed `#BE123C`) | User choice; confident, warm, premium |
| Typography | **Plus Jakarta Sans** via `expo-font`, weights 400/500/600/700/800 | Distinctive geometric sans matching the reference apps |
| Theme | **Light only** now; tokens namespaced so dark is a later drop-in | Faster; dark is future work |
| Icons | lucide (via gluestack) / `@expo/vector-icons` | Already-available, consistent set |

## 3. Design Tokens

Defined once in the Tailwind/NativeWind theme config; consumed via classNames + the `ui/`
components. Exact hex/scale values are fixed here so the plan has no ambiguity.

- **Color**
  - accent `#E11D48`, accent-2 `#FB7185`, accent-pressed `#BE123C`, accent-soft `#FFF1F3` (tinted surface)
  - bg `#FFFBFC`, surface `#FFFFFF`, surface-2 `#F7F4F5`, border `#ECE7E9`
  - text `#1A0E12`, text-muted `#6B5560`, text-inverse `#FFFFFF`
  - success `#10B981`, warning `#F59E0B`, error `#EF4444`
- **Radius** — `sm 8`, `md 12`, `lg 16`, `xl 24`, `pill 999`
- **Spacing** — Tailwind default 4px scale (1=4 … 6=24, 8=32, 12=48)
- **Shadow** — `soft` (low-opacity, large-blur, small-y) and `card` presets; subtle, not harsh
- **Type scale** (size / weight) — `display` 32/800, `title` 24/700, `heading` 18/700,
  `body` 16/500, `caption` 14/500, `label` 13/600. Family: Plus Jakarta Sans.

## 4. Architecture

```
mobile/
  tailwind.config.js          # tokens (colors/radius/shadow/fontFamily)
  global.css                  # NativeWind @tailwind directives
  babel.config.js / metro.config.js / nativewind-env.d.ts   # NativeWind wiring
  app/_layout.tsx             # MODIFY: load fonts + wrap in <GluestackUIProvider>
  components/ui/
    Screen.tsx                # SafeArea + bg + padding wrapper
    Text.tsx                  # variant-based typography (display/title/heading/body/caption/label)
    Button.tsx                # variants: primary | secondary | ghost; sizes; pressed state
    Card.tsx                  # rounded surface + soft shadow
    Chip.tsx                  # selectable pill (interests/budget/pace)
    Input.tsx                 # text field
    ListRow.tsx               # tappable row (saved trips, lists)
    EmptyState.tsx            # icon + title + subtitle + optional action
    Loading.tsx               # spinner + label
  app/(app)/index.tsx         # MODIFY: restyle (hero + primary CTA)
  app/(app)/onboarding.tsx    # MODIFY: restyle (progress, Chip, Input, day stepper)
  app/(app)/generating.tsx    # MODIFY: restyle (branded Loading)
  app/(app)/itinerary.tsx     # MODIFY: restyle (day Cards, segmented toggle, stop rows, EmptyState)
```

**Component contracts (each understandable + reusable in isolation):**

- **`Screen`** — props `{ children, scroll?, padded? }`. Wraps `SafeAreaView` + bg; optional
  `ScrollView`; consistent screen padding. Every screen's root.
- **`Text`** — props `{ variant, color?, weight?, children, ...textProps }`. Maps `variant` to
  size/weight/family from tokens. One place owns typography.
- **`Button`** — props `{ title, onPress, variant?='primary', size?='md', disabled?, loading?, leftIcon? }`.
  Primary = crimson pill, text-inverse; secondary = surface + border; ghost = text-only. Pressed
  state darkens (`accent-pressed`) / scales slightly. `loading` shows inline spinner.
- **`Chip`** — props `{ label, selected, onPress }`. Pill; selected = `accent-soft` bg +
  accent border + accent text; idle = surface + border.
- **`Card`** — props `{ children, onPress? }`. Rounded `lg`, surface bg, `card` shadow, padding.
- **`Input`** — props `{ value, onChangeText, placeholder, ...}`. Rounded `md`, border, focus ring (accent).
- **`ListRow`** — props `{ title, subtitle?, right?, onPress?, onLongPress? }`. For lists/saved trips.
- **`EmptyState`** — props `{ icon, title, subtitle?, action? }`.
- **`Loading`** — props `{ label? }`. Centered spinner (accent) + label.

Restyle keeps each screen's existing state/logic and swaps primitives for `ui/` components +
tokens. No behavioural change.

## 5. Configuration / Secrets

None. New dev dependencies only (`nativewind`, `tailwindcss`, gluestack packages,
`@expo/vector-icons`/lucide, font asset). A **new EAS dev build** is required for NativeWind's
native config to take effect on device.

## 6. Testing / Verification

A design system has ~no testable business logic, so this project has **no unit tests** — that
would be ceremony. Verification:

- **`npx tsc --noEmit`** clean (NativeWind className typing + component props).
- **Visual self-check (rough):** `npx expo start --web` renders the screens in a browser for a
  screenshot pass. Fonts/shadows/native bits differ from device — this catches layout/obvious
  breakage, not pixel fidelity.
- **Device smoke (real sign-off):** user runs an EAS dev build and confirms the look on device;
  iterate from there. The map and true native rendering only appear on the new build.

This is an honest gap: the implementer (Claude) can type-check and do a rough web check but
cannot see the device result — final visual approval is the user's.

## 7. Error & Edge-Case Handling

| Case | Handling |
|---|---|
| Fonts not yet loaded at first paint | Gate render on `useFonts` (splash held) so text never flashes in a fallback face |
| NativeWind class not applied (config miswired) | Caught in the web/device smoke; the plan's first task verifies a styled sample before proceeding |
| gluestack-ui v2 install drift vs SDK 56 | Plan's setup task verifies against current gluestack docs before building components (per `mobile/AGENTS.md`) |
| Restyle accidentally changes behaviour | Each screen restyle keeps its existing handlers/state; reviewed against the pre-restyle file |

## 8. Future Polish (deferred — planned, NOT cut)

The user explicitly wants these in a later phase, after the base system lands:
custom icon + illustration art · screen/transition animations beyond button press · premium
microinteractions (haptics, spring/gesture feedback, animated progress, confetti-style moments) ·
dark mode. Tokens and component boundaries are designed so these slot in without a rewrite.

## 9. Deferred (YAGNI, for now)

Component unit tests / Storybook · a full icon set beyond what the 4 screens use · skeleton
loaders · theming switch UI.
