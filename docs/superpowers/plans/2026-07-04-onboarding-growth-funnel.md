# Onboarding Growth Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a pre-onboarding growth funnel (qualify → relate → showcase → notification permission → attribution → compare → soft trial paywall) between the existing `intro` hero and the `destination` step of the trip-builder wizard, without changing the 1-free-trip gate and without any fabricated marketing claims.

**Architecture:** Extends the existing single-file step machine (`mobile/app/(app)/onboarding.tsx` + `mobile/lib/onboarding.ts`) — 14 steps become 26, `STEPS` grows and a few existing steps (`craft`, `trust`) get repositioned. Most new steps reuse the existing `PROMPTS` (title/sub) and `INFO` (ethos hero) lookups; only genuinely new/reusable/complex pieces get their own component files under `mobile/components/onboarding/`. Funnel answers (quiz + attribution) live in a new `FunnelState`, kept separate from `OnboardingState` so the `buildRequest`/`stateFromRequest` trip-generation contract is untouched, and persist into `profiles.default_prefs` jsonb via a new helper mirroring the existing `getGalleryStyle`/`setGalleryStyle` pattern. The trial paywall step reads RevenueCat's actual intro-price/win-back-offer data so its copy is honest whether or not those products are configured yet (separate follow-up).

**Tech Stack:** Expo SDK 56 / expo-router, NativeWind (Sunset Soft design system), react-native-purchases (RevenueCat), expo-notifications (new), Supabase (Postgres — `profiles.default_prefs` jsonb, no migration), jest (`jest-expo` preset).

**Spec:** `docs/superpowers/specs/2026-07-04-onboarding-growth-funnel-design.md`

## Global Constraints

- Expo SDK 56: consult https://docs.expo.dev/versions/v56.0.0/ before using unfamiliar Expo APIs (repo `mobile/AGENTS.md` rule).
- All UI uses the existing design system (`mobile/components/ui`), never raw RN primitives with ad-hoc styles.
- No fabricated stats or claims (no "recommended by X publications," no competitor-user comparisons) — see spec §"Social proof" decision.
- The 1-free-trip gate (`mobile/lib/gate.ts`) does not change. The new trial paywall step is soft-sell only — declining always continues to the existing free-trip wizard.
- Trial/win-back paywall copy is derived from what RevenueCat actually returns (`introPrice`, win-back offers) — never hardcode "7-day free trial" or "20% off" as static strings.
- Funnel quiz/attribution answers persist to `profiles.default_prefs` jsonb using **camelCase** keys (matching the existing `galleryStyle` key), via a new helper — **not** the `Prefs`-typed `upsertProfile`/`prefsFromState` path, which mirrors the backend generation contract.
- `OnboardingState` (and `buildRequest`/`stateFromRequest`) stays exactly as today — new funnel data lives in a separate `FunnelState`.
- Do not extract the 10 existing bespoke step blocks (destination/dates/interests/classics/travelParty/budget/pace/transport/start/review) into files — out of scope, per the corrected spec.
- `expo-notifications` is a new native dependency → requires a new EAS build before device testing (already-pending build, per project state — this rides along).
- Commands: `cd mobile && npm test`, `cd mobile && npx tsc --noEmit`.
- Commit after each task. Do not push.

---

### Task 1: Funnel foundations + qualifying quiz (planningCheck, hardestParts, goals)

Adds `FunnelState` and taxonomies to `lib/onboarding.ts`, two new reusable components (`OptionList`, `ChipMultiSelect`), and the first 3 new steps.

**Files:**
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Create: `mobile/components/onboarding/OptionList.tsx`
- Create: `mobile/components/onboarding/ChipMultiSelect.tsx`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (from `lib/onboarding.ts`, consumed by Tasks 2–7, 10): `PLANNING_CHECK`, `HARDEST_PARTS`, `GOALS`, `ATTRIBUTION_SOURCES` (readonly string-tuple consts), `FunnelState` interface (`{ planningCheck?: string; hardestParts: string[]; goals: string[]; attributionSource?: string }`), `EMPTY_FUNNEL: FunnelState`, `funnelPrefs(f: FunnelState): Record<string, unknown>`. Produces `OptionList` (`{ options: { value, label, desc, icon }[]; selected: string | undefined; onSelect(value: string): void }`) and `ChipMultiSelect` (`{ options: { value, label }[]; selected: string[]; onToggle(value: string): void }`) from `components/onboarding/`, reused by Task 6 (`attribution`).

- [ ] **Step 1: Write failing tests**

In `mobile/lib/onboarding.test.ts`, extend the top import:

```ts
import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  prefsFromState, buildRequest, tripDaysOf, shouldOfferRegions, withDestination,
  funnelPrefs, EMPTY_FUNNEL, type OnboardingState, type FunnelState,
} from "./onboarding";
```

Replace the `"STEPS is the destination-first flow..."` test:

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals",
    "destination", "dates", "classics", "interests", "travelParty", "craft",
    "budget", "pace", "transport", "trust", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(17);
});
```

Replace the `"canContinue: filler pages + choice steps always pass"` test:

```ts
test("canContinue: filler pages + choice steps always pass (defaults exist)", () => {
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals",
    "classics", "travelParty", "craft", "budget", "pace", "transport", "trust",
    "start", "midway", "review",
  ] as const;
  for (const key of alwaysPass) expect(canContinue(STEPS.indexOf(key), base)).toBe(true);
});
```

Append new tests:

```ts
test("funnelPrefs extracts camelCase keys for the profile jsonb merge", () => {
  const f: FunnelState = {
    planningCheck: "improving", hardestParts: ["pacing", "stopOrder"], goals: ["saveTime"],
  };
  expect(funnelPrefs(f)).toEqual({
    planningCheck: "improving", hardestParts: ["pacing", "stopOrder"], goals: ["saveTime"],
    attributionSource: undefined,
  });
});

test("EMPTY_FUNNEL starts with no selections", () => {
  expect(EMPTY_FUNNEL).toEqual({ hardestParts: [], goals: [] });
  expect(funnelPrefs(EMPTY_FUNNEL)).toEqual({
    planningCheck: undefined, hardestParts: [], goals: [], attributionSource: undefined,
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL — `STEPS` doesn't match (still 14 entries), `funnelPrefs`/`EMPTY_FUNNEL`/`FunnelState` not exported.

- [ ] **Step 3: Extend `lib/onboarding.ts`**

Replace the `STEPS` declaration (currently lines 13-16):

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals",
  "destination", "dates", "classics", "interests", "travelParty", "craft",
  "budget", "pace", "transport", "trust", "start", "midway", "review",
] as const;
export const STEP_COUNT = STEPS.length;

// Growth-funnel qualifying quiz taxonomies (bare values; labels/descriptions/
// icons live in onboarding.tsx next to INTEREST_ICONS et al).
export const PLANNING_CHECK = ["great", "improving", "notPlanning"] as const;
export const HARDEST_PARTS = ["pacing", "hiddenGems", "stopOrder", "foodBreaks", "coordinating"] as const;
export const GOALS = ["saveTime", "avoidBacktracking", "discoverSpots", "stayFlexible", "lessStress"] as const;
export const ATTRIBUTION_SOURCES = ["appStore", "friend", "social", "google", "other"] as const;

// Funnel answers are segmentation/personalization data, not trip-generation
// inputs — kept separate from OnboardingState so buildRequest/stateFromRequest
// (the trip-generation contract) never has to know about them.
export interface FunnelState {
  planningCheck?: (typeof PLANNING_CHECK)[number];
  hardestParts: string[];
  goals: string[];
  attributionSource?: (typeof ATTRIBUTION_SOURCES)[number];
}

export const EMPTY_FUNNEL: FunnelState = { hardestParts: [], goals: [] };

// Shape merged into profiles.default_prefs (camelCase, matching the existing
// galleryStyle key) via lib/profile.ts's saveFunnelAnswers — never through
// upsertProfile/prefsFromState, which are the Prefs-typed generation contract.
export function funnelPrefs(f: FunnelState): Record<string, unknown> {
  return {
    planningCheck: f.planningCheck,
    hardestParts: f.hardestParts,
    goals: f.goals,
    attributionSource: f.attributionSource,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `OptionList`**

Create `mobile/components/onboarding/OptionList.tsx`:

```tsx
// mobile/components/onboarding/OptionList.tsx
import { View } from "react-native";
import { OptionCard, Icon, type IconName } from "../ui";

export interface Option { value: string; label: string; desc: string; icon: IconName }

export function OptionList({ options, selected, onSelect }: {
  options: Option[]; selected: string | undefined; onSelect: (value: string) => void;
}) {
  return (
    <View className="gap-3">
      {options.map((o) => (
        <OptionCard
          key={o.value}
          icon={<Icon name={o.icon} size={20} color={selected === o.value ? "#E11D48" : "#6B5560"} />}
          title={o.label}
          description={o.desc}
          selected={selected === o.value}
          onPress={() => onSelect(o.value)}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 6: Create `ChipMultiSelect`**

Create `mobile/components/onboarding/ChipMultiSelect.tsx`:

```tsx
// mobile/components/onboarding/ChipMultiSelect.tsx
import { View } from "react-native";
import { Chip } from "../ui";

export interface ChipOption { value: string; label: string }

export function ChipMultiSelect({ options, selected, onToggle }: {
  options: ChipOption[]; selected: string[]; onToggle: (value: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={selected.includes(o.value)} onPress={() => onToggle(o.value)} />
      ))}
    </View>
  );
}
```

- [ ] **Step 7: Wire the 3 new steps into `onboarding.tsx`**

Extend the `lib/onboarding` import (currently lines 16-19):

```tsx
import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  buildRequest, tripDaysOf, shouldOfferRegions, withDestination,
  PLANNING_CHECK, HARDEST_PARTS, GOALS, EMPTY_FUNNEL, funnelPrefs,
  type OnboardingState, type FunnelState,
} from "../../lib/onboarding";
```

Add an import for the two new components, next to the `components/ui` import:

```tsx
import { OptionList, type Option } from "../../components/onboarding/OptionList";
import { ChipMultiSelect, type ChipOption } from "../../components/onboarding/ChipMultiSelect";
```

Add new option/taxonomy consts next to `BUDGETS`/`PACES`/`TRANSPORTS`:

```tsx
const PLANNING_CHECK_OPTIONS: (Option & { value: (typeof PLANNING_CHECK)[number] })[] = [
  { value: "great", label: "Great", desc: "I've got a system that works", icon: "happy" },
  { value: "improving", label: "Could be better", desc: "It works, but takes a lot of manual effort", icon: "trending-up" },
  { value: "notPlanning", label: "I don't really plan", desc: "I wing it or skip planning entirely", icon: "help-circle" },
];
const HARDEST_PARTS_OPTIONS: ChipOption[] = [
  { value: "pacing", label: "Knowing what's realistic in a day" },
  { value: "hiddenGems", label: "Finding hidden gems, not just tourist traps" },
  { value: "stopOrder", label: "Keeping stops in a sane order" },
  { value: "foodBreaks", label: "Fitting in food and breaks" },
  { value: "coordinating", label: "Coordinating with the group" },
];
const GOALS_OPTIONS: ChipOption[] = [
  { value: "saveTime", label: "Save time planning" },
  { value: "avoidBacktracking", label: "Stop backtracking across town" },
  { value: "discoverSpots", label: "Discover great local spots" },
  { value: "stayFlexible", label: "Stay flexible on the day" },
  { value: "lessStress", label: "Less stress, more trip" },
];
```

Add to the `PROMPTS` record (right after the `intro` entry):

```tsx
  planningCheck: { title: "How's trip planning working for you?" },
  hardestParts: { title: "What's the hardest part of planning a trip?", sub: "Pick as many as apply." },
  goals: { title: "What do you want out of Beacon?", sub: "Pick as many as apply." },
```

Add a `funnel` state hook next to `party` (in the `Onboarding()` component):

```tsx
  const [funnel, setFunnel] = useState<FunnelState>(EMPTY_FUNNEL);
```

Add a toggle helper next to `toggleInterest`:

```tsx
  function toggleFunnelMulti(key: "hardestParts" | "goals", value: string) {
    setFunnel((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
    }));
  }
```

Add render blocks to the bespoke-content chain (after the `classics` block, before `travelParty`, matching STEPS order is irrelevant here — the chain is just a flat list of `{page === "x" ? ... : null}`):

```tsx
        {page === "planningCheck" ? (
          <OptionList
            options={PLANNING_CHECK_OPTIONS}
            selected={funnel.planningCheck}
            onSelect={(v) => setFunnel((f) => ({ ...f, planningCheck: v as FunnelState["planningCheck"] }))}
          />
        ) : null}

        {page === "hardestParts" ? (
          <ChipMultiSelect options={HARDEST_PARTS_OPTIONS} selected={funnel.hardestParts} onToggle={(v) => toggleFunnelMulti("hardestParts", v)} />
        ) : null}

        {page === "goals" ? (
          <ChipMultiSelect options={GOALS_OPTIONS} selected={funnel.goals} onToggle={(v) => toggleFunnelMulti("goals", v)} />
        ) : null}
```

- [ ] **Step 8: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts mobile/components/onboarding/OptionList.tsx mobile/components/onboarding/ChipMultiSelect.tsx "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): add qualifying quiz steps (planningCheck, hardestParts, goals)"
```

---

### Task 2: "You're in a good place" transition

Trivial ethos step — pure content, reuses the existing `INFO`/`InfoHero` mechanism.

**Files:**
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (pure content step).

- [ ] **Step 1: Update the failing STEPS test**

In `mobile/lib/onboarding.test.ts`, update the STEPS test:

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "destination", "dates", "classics", "interests", "travelParty", "craft",
    "budget", "pace", "transport", "trust", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(18);
});
```

Add `"goodPlace"` to the `alwaysPass` list in `"canContinue: filler pages + choice steps always pass"`:

```ts
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "classics", "travelParty", "craft", "budget", "pace", "transport", "trust",
    "start", "midway", "review",
  ] as const;
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL — `STEPS` missing `"goodPlace"`.

- [ ] **Step 3: Insert `goodPlace` into `STEPS`**

In `mobile/lib/onboarding.ts`, update the `STEPS` array:

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "destination", "dates", "classics", "interests", "travelParty", "craft",
  "budget", "pace", "transport", "trust", "start", "midway", "review",
] as const;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 5: Add PROMPTS + INFO entries**

In `mobile/app/(app)/onboarding.tsx`, add to `PROMPTS` (after the `goals` entry from Task 1):

```tsx
  goodPlace: { title: "You're in a good place." },
```

Add to the `INFO` record (after `intro`):

```tsx
  goodPlace: { icon: "sparkles", blurb: "Here's what makes Beacon different." },
```

(No `image` — falls back to the existing Ionicons-in-a-circle placeholder, same as any `INFO` entry without one.)

- [ ] **Step 6: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): add goodPlace transition into the feature showcase"
```

---

### Task 3: Relate pair A + reposition `craft` (routing showcase)

Two Yes/No priming statements about backtracking/stop-ordering, followed by the existing "Routed like a local" ethos page moved up from its old mid-wizard slot.

**Files:**
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Create: `mobile/components/onboarding/RelateStatement.tsx`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RelateStatement` component (no props) from `components/onboarding/`, reused by Task 4.

- [ ] **Step 1: Update the failing STEPS test**

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft",
    "destination", "dates", "classics", "interests", "travelParty",
    "budget", "pace", "transport", "trust", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(20);
});
```

Update `alwaysPass` (add `relateA1`, `relateA2`; `craft` stays in the list, just moved):

```ts
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft",
    "classics", "travelParty", "budget", "pace", "transport", "trust",
    "start", "midway", "review",
  ] as const;
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL — `STEPS` doesn't match (relateA1/relateA2 missing, craft still in its old slot).

- [ ] **Step 3: Reorder `STEPS`**

In `mobile/lib/onboarding.ts`, update `STEPS` — note `craft` is removed from between `travelParty` and `budget`, and reinserted after `relateA2`:

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "relateA1", "relateA2", "craft",
  "destination", "dates", "classics", "interests", "travelParty",
  "budget", "pace", "transport", "trust", "start", "midway", "review",
] as const;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `RelateStatement`**

Create `mobile/components/onboarding/RelateStatement.tsx`:

```tsx
// mobile/components/onboarding/RelateStatement.tsx
// Pure engagement priming, same precedent as onboarding's travelParty step —
// the Yes/No answer is screen-local and never persisted or sent anywhere.
// The statement text itself is shown by the shared PROMPTS title/sub block
// in onboarding.tsx (this component is just the two buttons).
import { useState } from "react";
import { View } from "react-native";
import { Button } from "../ui";

export function RelateStatement() {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  return (
    <View className="flex-row gap-3">
      <Button
        title="Yes"
        className="flex-1"
        variant={answer === "yes" ? "gradient" : "secondary"}
        onPress={() => setAnswer("yes")}
      />
      <Button
        title="No"
        className="flex-1"
        variant={answer === "no" ? "gradient" : "secondary"}
        onPress={() => setAnswer("no")}
      />
    </View>
  );
}
```

- [ ] **Step 6: Wire into `onboarding.tsx`**

Add an import next to the other new component imports:

```tsx
import { RelateStatement } from "../../components/onboarding/RelateStatement";
```

Add to `PROMPTS` (after `goodPlace`):

```tsx
  relateA1: { title: "Sound familiar?", sub: "My last itinerary had me crossing back through the same neighborhood twice in one day." },
  relateA2: { title: "Sound familiar?", sub: "I spend more time figuring out what order to visit places than actually picking them." },
```

Add render lines to the bespoke-content chain (anywhere in the chain — order doesn't matter, `page` gates it):

```tsx
        {page === "relateA1" ? <RelateStatement /> : null}
        {page === "relateA2" ? <RelateStatement /> : null}
```

No change to the `craft` entry in `INFO`/`PROMPTS` — its content is unchanged, only its position in `STEPS` moved.

- [ ] **Step 7: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts mobile/components/onboarding/RelateStatement.tsx "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): relate-statement pair A + move craft into the showcase"
```

---

### Task 4: Relate pair B + reposition `trust` (live-data showcase)

Same shape as Task 3, for the "Built on real map data" ethos page.

**Files:**
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `RelateStatement` from Task 3.
- Produces: nothing new consumed later.

- [ ] **Step 1: Update the failing STEPS test**

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "destination", "dates", "classics", "interests", "travelParty",
    "budget", "pace", "transport", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(22);
});
```

Update `alwaysPass` (add `relateB1`, `relateB2`; `trust` stays in the list, just moved):

```ts
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "classics", "travelParty", "budget", "pace", "transport",
    "start", "midway", "review",
  ] as const;
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL.

- [ ] **Step 3: Reorder `STEPS`**

In `mobile/lib/onboarding.ts`, update `STEPS` — `trust` is removed from between `transport` and `start`, reinserted after `relateB2`:

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
  "destination", "dates", "classics", "interests", "travelParty",
  "budget", "pace", "transport", "start", "midway", "review",
] as const;
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `onboarding.tsx`**

Add to `PROMPTS` (after `relateA2`):

```tsx
  relateB1: { title: "Sound familiar?", sub: "I've shown up somewhere only to find out it's closed." },
  relateB2: { title: "Sound familiar?", sub: "Half my planning is just double-checking hours and travel times." },
```

Add render lines to the bespoke-content chain:

```tsx
        {page === "relateB1" ? <RelateStatement /> : null}
        {page === "relateB2" ? <RelateStatement /> : null}
```

No change to the `trust` entry in `INFO`/`PROMPTS` — content unchanged, only its `STEPS` position moved.

- [ ] **Step 6: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): relate-statement pair B + move trust into the showcase"
```

---

### Task 5: Notification permission step

New native dependency (`expo-notifications`) + a small permission-prompt step.

**Files:**
- Modify: `mobile/package.json` (new dependency)
- Create: `mobile/lib/notifications.ts`
- Create: `mobile/components/onboarding/NotificationsStep.tsx`
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `requestNotificationPermission(): Promise<boolean>` from `lib/notifications.ts` (not consumed elsewhere — used only inside `NotificationsStep`).

- [ ] **Step 1: Install the SDK**

Run: `cd mobile && npx expo install expo-notifications`
Expected: dependency added to `package.json`/`package-lock.json`. (Native module — device testing needs a new EAS build; nothing else in dev breaks. No config-plugin entry or `app.config.ts` change is needed for a local permission-only prompt — confirmed against the SDK 56 docs.)

- [ ] **Step 2: Create the notifications wrapper**

Create `mobile/lib/notifications.ts`:

```ts
// mobile/lib/notifications.ts
// Local permission prompt only — no push token registration, no remote
// notifications setup. Denial is not an error: the onboarding funnel
// continues regardless of the OS response (see canContinue — notifications
// is a non-gating step).
import * as Notifications from "expo-notifications";

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { granted } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    return granted;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Create `NotificationsStep`**

Create `mobile/components/onboarding/NotificationsStep.tsx`:

```tsx
// mobile/components/onboarding/NotificationsStep.tsx
import { useState } from "react";
import { Button } from "../ui";
import { requestNotificationPermission } from "../../lib/notifications";

export function NotificationsStep() {
  const [asked, setAsked] = useState(false);
  return (
    <Button
      title={asked ? "Thanks!" : "Enable Notifications"}
      variant="gradient"
      disabled={asked}
      onPress={async () => {
        setAsked(true);
        await requestNotificationPermission();
      }}
    />
  );
}
```

- [ ] **Step 4: Update the failing STEPS test**

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "notifications",
    "destination", "dates", "classics", "interests", "travelParty",
    "budget", "pace", "transport", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(23);
});
```

Update `alwaysPass`:

```ts
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust", "notifications",
    "classics", "travelParty", "budget", "pace", "transport",
    "start", "midway", "review",
  ] as const;
```

- [ ] **Step 5: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL — `STEPS` missing `"notifications"`.

- [ ] **Step 6: Insert `notifications` into `STEPS`**

In `mobile/lib/onboarding.ts`:

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
  "notifications",
  "destination", "dates", "classics", "interests", "travelParty",
  "budget", "pace", "transport", "start", "midway", "review",
] as const;
```

- [ ] **Step 7: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 8: Wire into `onboarding.tsx`**

Add an import:

```tsx
import { NotificationsStep } from "../../components/onboarding/NotificationsStep";
```

Add to `PROMPTS` (after `relateB2`):

```tsx
  notifications: { title: "Never miss a change" },
```

Add to `INFO` (after `goodPlace`):

```tsx
  notifications: { icon: "notifications", blurb: "We'll nudge you if your plan changes — nothing else." },
```

Add a render line to the bespoke-content chain:

```tsx
        {page === "notifications" ? <NotificationsStep /> : null}
```

- [ ] **Step 9: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/lib/notifications.ts mobile/components/onboarding/NotificationsStep.tsx mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): notification permission step (expo-notifications)"
```

---

### Task 6: Attribution step + funnel-answer persistence

Adds the "how'd you hear about us" step and saves all funnel answers (planningCheck/hardestParts/goals/attributionSource) into `profiles.default_prefs`.

**Files:**
- Modify: `mobile/lib/profile.ts`
- Modify: `mobile/lib/profile.test.ts`
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `OptionList` from Task 1; `FunnelState`/`funnelPrefs` from Task 1.
- Produces: `saveFunnelAnswers(client: SupabaseClient, answers: Record<string, unknown>): Promise<void>` from `lib/profile.ts` (not consumed by later tasks — called directly at the point of leaving the `attribution` step).

- [ ] **Step 1: Write failing tests for `saveFunnelAnswers`**

In `mobile/lib/profile.test.ts`, replace the top `./profile` import (currently line 1):

```ts
import { getProfile, upsertProfile, getGalleryStyle, displayName, generateUsername, ensureUsername, saveFunnelAnswers } from "./profile";
```

Then append (this mirrors the existing `usernameClient`-style fake-`SupabaseClient` pattern already used in this file for `ensureUsername`):

```ts
function profileMergeClient(opts: { existing?: Record<string, unknown>; onUpsert?: (row: unknown) => void }): SupabaseClient {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { default_prefs: opts.existing ?? {} }, error: null }) }) }),
      upsert: async (row: unknown) => { opts.onUpsert?.(row); return { error: null }; },
    }),
  } as unknown as SupabaseClient;
}

test("saveFunnelAnswers merges new keys into existing default_prefs", async () => {
  let row: unknown;
  const client = profileMergeClient({ existing: { interests: ["food"] }, onUpsert: (r) => { row = r; } });
  await saveFunnelAnswers(client, { planningCheck: "great", hardestParts: [], goals: [] });
  expect(row).toEqual({
    id: "u1",
    default_prefs: { interests: ["food"], planningCheck: "great", hardestParts: [], goals: [] },
  });
});

test("saveFunnelAnswers is a no-op when signed out", async () => {
  let wrote = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({ upsert: async () => { wrote = true; return { error: null }; } }),
  } as unknown as SupabaseClient;
  await saveFunnelAnswers(client, { goals: ["saveTime"] });
  expect(wrote).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/profile.test.ts`
Expected: FAIL — `saveFunnelAnswers` not exported.

- [ ] **Step 3: Implement `saveFunnelAnswers`**

Append to `mobile/lib/profile.ts` (mirrors the existing `getGalleryStyle`/`setGalleryStyle` loose-merge pattern — deliberately bypasses the strict `Prefs` type, which is the trip-generation contract shared with the backend):

```ts
// Funnel/segmentation answers (onboarding quiz + attribution) — merged into
// default_prefs as extra camelCase keys, same as galleryStyle. Not part of
// Prefs: these never feed a GenerateRequest.
export async function saveFunnelAnswers(client: SupabaseClient, answers: Record<string, unknown>): Promise<void> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const { data } = await client.from("profiles").select("default_prefs").eq("id", user.id).maybeSingle();
  const prefs = (data?.default_prefs as Record<string, unknown>) ?? {};
  const { error } = await client.from("profiles").upsert({ id: user.id, default_prefs: { ...prefs, ...answers } });
  if (error) throw error;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/profile.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the failing STEPS test**

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "notifications", "attribution",
    "destination", "dates", "classics", "interests", "travelParty",
    "budget", "pace", "transport", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(24);
});
```

Update `alwaysPass`:

```ts
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "notifications", "attribution",
    "classics", "travelParty", "budget", "pace", "transport",
    "start", "midway", "review",
  ] as const;
```

- [ ] **Step 6: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL.

- [ ] **Step 7: Insert `attribution` into `STEPS`**

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
  "notifications", "attribution",
  "destination", "dates", "classics", "interests", "travelParty",
  "budget", "pace", "transport", "start", "midway", "review",
] as const;
```

- [ ] **Step 8: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 9: Wire into `onboarding.tsx`**

Extend the `lib/onboarding` import (from Task 1) with `ATTRIBUTION_SOURCES`:

```tsx
import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  buildRequest, tripDaysOf, shouldOfferRegions, withDestination,
  PLANNING_CHECK, HARDEST_PARTS, GOALS, ATTRIBUTION_SOURCES, EMPTY_FUNNEL, funnelPrefs,
  type OnboardingState, type FunnelState,
} from "../../lib/onboarding";
```

Extend the `lib/profile` import with `saveFunnelAnswers`:

```tsx
import { getProfile, saveFunnelAnswers } from "../../lib/profile";
```

Add an option const next to `PLANNING_CHECK_OPTIONS`:

```tsx
const ATTRIBUTION_OPTIONS: (Option & { value: (typeof ATTRIBUTION_SOURCES)[number] })[] = [
  { value: "appStore", label: "App Store search", desc: "Searching for a trip planner", icon: "logo-apple" },
  { value: "friend", label: "Friend or family", desc: "Someone told me about it", icon: "people" },
  { value: "social", label: "Social media", desc: "Instagram, TikTok, or similar", icon: "share-social" },
  { value: "google", label: "Google search", desc: "Search results or an ad", icon: "logo-google" },
  { value: "other", label: "Something else", desc: "Not listed above", icon: "ellipsis-horizontal" },
];
```

Add to `PROMPTS`:

```tsx
  attribution: { title: "How'd you hear about us?" },
```

Add a render line to the bespoke-content chain:

```tsx
        {page === "attribution" ? (
          <OptionList
            options={ATTRIBUTION_OPTIONS}
            selected={funnel.attributionSource}
            onSelect={(v) => setFunnel((f) => ({ ...f, attributionSource: v as FunnelState["attributionSource"] }))}
          />
        ) : null}
```

Wire the fire-and-forget save into the footer's Continue handler — replace the footer's `else` branch (currently `<Button title="Continue" size="lg" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} />`):

```tsx
          <Button
            title="Continue"
            size="lg"
            disabled={!canContinue(step, state)}
            onPress={() => {
              if (page === "attribution") saveFunnelAnswers(supabase, funnelPrefs(funnel)).catch(() => {});
              setStep((s) => s + 1);
            }}
          />
```

(`funnelPrefs` is already in the `lib/onboarding` import from Task 1 — no further change needed there.)

- [ ] **Step 10: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add mobile/lib/profile.ts mobile/lib/profile.test.ts mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): attribution step + persist funnel answers to default_prefs"
```

---

### Task 7: Comparison step

"You're in the right place" — Beacon's approach vs. manual/spreadsheet planning. No competitor-user stats (per spec decision).

**Files:**
- Create: `mobile/components/onboarding/CompareStep.tsx`
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CompareStep` component (no props), not reused elsewhere.

- [ ] **Step 1: Create `CompareStep`**

Create `mobile/components/onboarding/CompareStep.tsx`:

```tsx
// mobile/components/onboarding/CompareStep.tsx
// Beacon's approach vs. planning it yourself — no competitor-user stats
// (Wanderlog's "vs. other users" framing was explicitly ruled out; see spec
// "Social proof" decision).
import { View } from "react-native";
import { Card, Text, Icon } from "../ui";

const ROWS: { label: string; beacon: boolean; solo: boolean }[] = [
  { label: "Routes ordered by real distance", beacon: true, solo: false },
  { label: "Live opening hours + travel times", beacon: true, solo: false },
  { label: "Meals slotted where they fit", beacon: true, solo: false },
  { label: "Hours spent in spreadsheets", beacon: false, solo: true },
];

function Mark({ on }: { on: boolean }) {
  return on
    ? <Icon name="checkmark-circle" size={20} color="#E11D48" />
    : <Icon name="close-circle" size={20} color="#6B5560" />;
}

export function CompareStep() {
  return (
    <Card className="gap-4">
      <View className="flex-row justify-end gap-6 pr-1">
        <Text variant="label" className="w-14 text-center">Beacon</Text>
        <Text variant="label" className="w-14 text-center text-ink-muted">Solo</Text>
      </View>
      {ROWS.map((r) => (
        <View key={r.label} className="flex-row items-center gap-3">
          <Text variant="body" className="flex-1">{r.label}</Text>
          <View className="w-14 items-center"><Mark on={r.beacon} /></View>
          <View className="w-14 items-center"><Mark on={r.solo} /></View>
        </View>
      ))}
    </Card>
  );
}
```

- [ ] **Step 2: Update the failing STEPS test**

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "notifications", "attribution", "compare",
    "destination", "dates", "classics", "interests", "travelParty",
    "budget", "pace", "transport", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(25);
});
```

Update `alwaysPass`:

```ts
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "notifications", "attribution", "compare",
    "classics", "travelParty", "budget", "pace", "transport",
    "start", "midway", "review",
  ] as const;
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL.

- [ ] **Step 4: Insert `compare` into `STEPS`**

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
  "notifications", "attribution", "compare",
  "destination", "dates", "classics", "interests", "travelParty",
  "budget", "pace", "transport", "start", "midway", "review",
] as const;
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire into `onboarding.tsx`**

Add an import:

```tsx
import { CompareStep } from "../../components/onboarding/CompareStep";
```

Add to `PROMPTS`:

```tsx
  compare: { title: "You're in the right place", sub: "Here's the difference." },
```

Add a render line to the bespoke-content chain:

```tsx
        {page === "compare" ? <CompareStep /> : null}
```

(`compare` is intentionally **not** added to `INFO` — it has its own comparison-card visual instead of the floating ethos hero, so it falls through to the plain title/sub branch already in place.)

- [ ] **Step 7: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add mobile/components/onboarding/CompareStep.tsx mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): comparison step (Beacon vs. planning it yourself)"
```

---

### Task 8: Trial-offer pure helpers + RevenueCat win-back wrapper (TDD)

Pure copy-derivation logic first (jest-testable, no native import), then the RevenueCat SDK wrapper additions (untested here, per repo convention — native-touching code is manually smoke-tested).

**Files:**
- Create: `mobile/lib/trialOffer.ts`
- Create: `mobile/lib/trialOffer.test.ts`
- Modify: `mobile/lib/purchases.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `trialDays(intro: IntroPriceInfo | null): number | null` from `lib/trialOffer.ts`; `getWinBackOffer(pkg: PurchasesPackage): Promise<PurchasesWinBackOffer | null>` and `purchaseWithWinBackOffer(pkg: PurchasesPackage, offer: PurchasesWinBackOffer): Promise<boolean>` from `lib/purchases.ts`. All consumed by Task 10 (`TrialOfferStep`).

- [ ] **Step 1: Write failing tests for `trialDays`**

Create `mobile/lib/trialOffer.test.ts`:

```ts
import { trialDays } from "./trialOffer";

test("trialDays is null when there's no intro offer", () => {
  expect(trialDays(null)).toBeNull();
});

test("trialDays is null when the intro offer is a discount, not a free trial", () => {
  expect(trialDays({ price: 1.99, periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 3 })).toBeNull();
});

test("trialDays computes days for a 7-day free trial (1 week, price 0)", () => {
  expect(trialDays({ price: 0, periodUnit: "WEEK", periodNumberOfUnits: 1, cycles: 1 })).toBe(7);
});

test("trialDays computes days for a 1-month free trial", () => {
  expect(trialDays({ price: 0, periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 1 })).toBe(30);
});

test("trialDays multiplies periodNumberOfUnits and cycles", () => {
  expect(trialDays({ price: 0, periodUnit: "DAY", periodNumberOfUnits: 3, cycles: 2 })).toBe(6);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd mobile && npx jest lib/trialOffer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `trialDays`**

Create `mobile/lib/trialOffer.ts`:

```ts
// mobile/lib/trialOffer.ts
// Pure copy-derivation for the onboarding trial paywall — deliberately free
// of any react-native-purchases import so it's jest-testable without the
// native module (repo convention: lib/*.ts pure logic is unit-tested,
// screens that touch the native SDK are smoke-tested manually).
export interface IntroPriceInfo {
  price: number;
  periodUnit: string;
  periodNumberOfUnits: number;
  cycles: number;
}

const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

// Null unless the intro offer is a genuine free trial (price 0) — a
// discounted (non-zero) intro price is not a "free trial" and must not be
// labeled as one. This is what keeps the paywall copy honest whether or not
// RevenueCat has a trial offer configured yet.
export function trialDays(intro: IntroPriceInfo | null): number | null {
  if (!intro || intro.price !== 0) return null;
  const days = (UNIT_DAYS[intro.periodUnit] ?? 0) * intro.periodNumberOfUnits * intro.cycles;
  return days > 0 ? days : null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd mobile && npx jest lib/trialOffer.test.ts`
Expected: PASS.

- [ ] **Step 5: Add win-back wrapper functions to `lib/purchases.ts`**

Extend the `react-native-purchases` import (currently `import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";`):

```ts
import Purchases, { type CustomerInfo, type PurchasesPackage, type PurchasesWinBackOffer } from "react-native-purchases";
```

Append to `mobile/lib/purchases.ts`:

```ts
// Win-back (downsell) offers — iOS 18+ with StoreKit 2 only. Null/false on
// any unsupported platform/OS version so the downsell step just skips itself
// instead of showing a made-up discount (see lib/trialOffer.ts's honesty note).
export async function getWinBackOffer(pkg: PurchasesPackage): Promise<PurchasesWinBackOffer | null> {
  if (!configured) return null;
  try {
    const offers = await Purchases.getEligibleWinBackOffersForPackage(pkg);
    return offers?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function purchaseWithWinBackOffer(pkg: PurchasesPackage, offer: PurchasesWinBackOffer): Promise<boolean> {
  if (!configured) return false;
  try {
    const { customerInfo } = await Purchases.purchasePackageWithWinBackOffer(pkg, offer);
    return hasPro(customerInfo);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}
```

- [ ] **Step 6: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/trialOffer.ts mobile/lib/trialOffer.test.ts mobile/lib/purchases.ts
git commit -m "feat(paywall): trial-days helper + RevenueCat win-back offer wrapper"
```

---

### Task 9: Promote `PlanCard` to the design system

Both `/paywall` and the new `TrialOfferStep` (Task 10) need the annual/monthly plan-selection card — pull it out of `paywall.tsx` into `components/ui`.

**Files:**
- Create: `mobile/components/ui/PlanCard.tsx`
- Modify: `mobile/components/ui/index.ts`
- Modify: `mobile/app/(app)/paywall.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PlanCard` (`{ pkg: PurchasesPackage; active: boolean; onPress: () => void }`) exported from `components/ui`, consumed by Task 10.

- [ ] **Step 1: Create the promoted component**

Create `mobile/components/ui/PlanCard.tsx` (identical to the block currently in `paywall.tsx:21-39`):

```tsx
// mobile/components/ui/PlanCard.tsx
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function PlanCard({ pkg, active, onPress }: { pkg: PurchasesPackage; active: boolean; onPress: () => void }) {
  const annual = pkg.packageType === "ANNUAL";
  return (
    <PressableScale
      onPress={onPress}
      className={`flex-1 rounded-xl border-2 p-4 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
    >
      <View className="h-6 mb-1">
        {annual ? (
          <View className="self-start px-2 py-0.5 rounded-pill bg-accent">
            <Text variant="label" className="text-ink-inverse text-[11px]">SAVE 44%</Text>
          </View>
        ) : null}
      </View>
      <Text variant="heading">{annual ? "Annual" : "Monthly"}</Text>
      <Text variant="caption">{pkg.product.priceString} / {annual ? "year" : "month"}</Text>
    </PressableScale>
  );
}
```

- [ ] **Step 2: Export it from the barrel**

In `mobile/components/ui/index.ts`, add:

```ts
export { PlanCard } from "./PlanCard";
```

- [ ] **Step 3: Use the promoted component in `paywall.tsx`**

In `mobile/app/(app)/paywall.tsx`, remove the local `PlanCard` function (lines 21-39) and remove the now-unused `PressableScale` import if `paywall.tsx` no longer uses it directly elsewhere (it still does, for "Restore Purchases"/legal links — keep it). Add `PlanCard` to the `components/ui` import:

```tsx
import { Screen, Text, Button, Icon, PressableScale, Loading, SUNSET, PlanCard } from "../../components/ui";
```

- [ ] **Step 4: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS (no behavior change — same JSX, same file for consumers of `/paywall`).

- [ ] **Step 5: Commit**

```bash
git add mobile/components/ui/PlanCard.tsx mobile/components/ui/index.ts "mobile/app/(app)/paywall.tsx"
git commit -m "refactor(paywall): promote PlanCard to the design system for reuse in onboarding"
```

---

### Task 10: Trial paywall step (final funnel step)

The biggest new piece: its own RevenueCat fetch/purchase state, honest trial copy, and the win-back downsell overlay. This is the last new step before the existing `destination` step.

**Files:**
- Create: `mobile/components/onboarding/TrialOfferStep.tsx`
- Modify: `mobile/lib/onboarding.ts`
- Modify: `mobile/lib/onboarding.test.ts`
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `getProPackages`, `purchasePro`, `getWinBackOffer`, `purchaseWithWinBackOffer` from `lib/purchases.ts` (Task 8, existing); `trialDays` from `lib/trialOffer.ts` (Task 8); `PlanCard`, `Loading`, `SUNSET` from `components/ui` (Task 9, existing).
- Produces: `TrialOfferStep` (`{ onDone: () => void }`), used only by the orchestrator.

- [ ] **Step 1: Create `TrialOfferStep`**

Create `mobile/components/onboarding/TrialOfferStep.tsx`:

```tsx
// mobile/components/onboarding/TrialOfferStep.tsx
// Soft-sell trial paywall, honesty-safe: copy is derived from whatever
// RevenueCat actually returns (introPrice / win-back offer), never hardcoded
// "7-day trial" / "20% off" strings. Declining always calls onDone() and
// continues into the existing free-trip wizard — no gate change.
import { useEffect, useState } from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { PurchasesPackage, PurchasesWinBackOffer } from "react-native-purchases";
import { getProPackages, purchasePro, getWinBackOffer, purchaseWithWinBackOffer } from "../../lib/purchases";
import { trialDays } from "../../lib/trialOffer";
import { Text, Button, Icon, Loading, PlanCard, SUNSET } from "../ui";

export function TrialOfferStep({ onDone }: { onDone: () => void }) {
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingOffer, setCheckingOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"offer" | "downsell">("offer");
  const [winBack, setWinBack] = useState<PurchasesWinBackOffer | null>(null);

  useEffect(() => {
    getProPackages()
      .then((pkgs) => {
        setPackages(pkgs);
        setSelected(pkgs.find((p) => p.packageType === "ANNUAL")?.identifier ?? pkgs[0]?.identifier ?? null);
      })
      .catch(() => setError("Couldn't load plans."));
  }, []);

  const pkg = packages?.find((p) => p.identifier === selected) ?? null;
  const days = pkg ? trialDays(pkg.product.introPrice) : null;

  async function buy() {
    if (!pkg) return;
    setBusy(true);
    setError(null);
    try {
      if (await purchasePro(pkg)) onDone();
    } catch {
      setError("Purchase failed — you weren't charged. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function notNow() {
    if (!pkg) { onDone(); return; }
    setCheckingOffer(true);
    const offer = await getWinBackOffer(pkg);
    setCheckingOffer(false);
    if (offer) {
      setWinBack(offer);
      setStage("downsell");
    } else {
      onDone();
    }
  }

  async function claimWinBack() {
    if (!pkg || !winBack) return;
    setBusy(true);
    setError(null);
    try {
      if (await purchaseWithWinBackOffer(pkg, winBack)) onDone();
    } catch {
      setError("Purchase failed — you weren't charged. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "downsell" && winBack) {
    return (
      <View className="gap-4">
        <Text variant="heading">Not yet convinced?</Text>
        <Text variant="body" className="text-ink-muted">
          One-time offer: {winBack.priceString} for your first {winBack.cycles > 1 ? `${winBack.cycles} periods` : "period"}.
        </Text>
        <Button title="Claim offer" size="lg" variant="gradient" loading={busy} onPress={claimWinBack} />
        <Button title="No thanks" variant="ghost" onPress={onDone} />
        {error ? <Text variant="caption" className="text-error text-center">{error}</Text> : null}
      </View>
    );
  }

  return (
    <View className="gap-4">
      <LinearGradient colors={SUNSET} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24 }}>
        <Icon name="sparkles" size={28} color="#FFFFFF" />
        <Text variant="title" className="text-ink-inverse mt-2">Beacon Pro</Text>
        <Text variant="body" className="text-ink-inverse opacity-90">
          {days ? `Start your ${days}-day free trial.` : "Unlimited trips, smart routing, every feature."}
        </Text>
      </LinearGradient>

      {packages === null && !error ? (
        <Loading label="Loading plans…" />
      ) : (
        <View className="flex-row gap-3">
          {(packages ?? []).map((p) => (
            <PlanCard key={p.identifier} pkg={p} active={p.identifier === selected} onPress={() => setSelected(p.identifier)} />
          ))}
        </View>
      )}

      {error ? <Text variant="caption" className="text-error text-center">{error}</Text> : null}

      <Button
        title={days ? `Start ${days}-day free trial` : "Start Pro"}
        size="lg"
        variant="gradient"
        loading={busy}
        disabled={!selected}
        onPress={buy}
      />
      <Button title="Not now" variant="ghost" loading={checkingOffer} onPress={notNow} />
    </View>
  );
}
```

- [ ] **Step 2: Update the failing STEPS test**

```ts
test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
    "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
    "notifications", "attribution", "compare", "trialOffer",
    "destination", "dates", "classics", "interests", "travelParty",
    "budget", "pace", "transport", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(26);
});
```

Do **not** add `"trialOffer"` to `alwaysPass` — `canContinue`'s default (`true`) already covers it like every other step, but there's a more important reason it doesn't belong there: `alwaysPass` documents steps whose generic footer "Continue" button is used, and `trialOffer` replaces that footer entirely with its own CTAs (Step 4 below). Add a comment instead:

```ts
// NOTE: "trialOffer" is intentionally excluded from alwaysPass above — it
// replaces the generic footer Continue button with its own CTAs (see
// onboarding.tsx's page === "trialOffer" footer special-case).
```

- [ ] **Step 3: Run tests to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL.

- [ ] **Step 4: Insert `trialOffer` into `STEPS`**

```ts
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
  "notifications", "attribution", "compare", "trialOffer",
  "destination", "dates", "classics", "interests", "travelParty",
  "budget", "pace", "transport", "start", "midway", "review",
] as const;
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire into `onboarding.tsx`**

Add an import:

```tsx
import { TrialOfferStep } from "../../components/onboarding/TrialOfferStep";
```

Add to `PROMPTS` — title is defined for type-completeness but intentionally unrendered for this page (see Step 7):

```tsx
  trialOffer: { title: "Go Pro" },
```

In the top content block, suppress the generic ethos/title header for `trialOffer` (it renders its own header via the gradient hero) — replace:

```tsx
        {INFO[page] ? (
```

with:

```tsx
        {page === "trialOffer" ? null : INFO[page] ? (
```

Add a render line to the bespoke-content chain:

```tsx
        {page === "trialOffer" ? <TrialOfferStep onDone={() => setStep((s) => s + 1)} /> : null}
```

- [ ] **Step 7: Suppress the generic footer Continue button for `trialOffer`**

In the footer, replace:

```tsx
        {page === "review" ? (
          <Button title="Generate my trip" size="lg" variant="gradient" onPress={onGenerate} />
        ) : (
          <Button
            title="Continue"
            size="lg"
            disabled={!canContinue(step, state)}
            onPress={() => {
              if (page === "attribution") saveFunnelAnswers(supabase, funnelPrefs(funnel)).catch(() => {});
              setStep((s) => s + 1);
            }}
          />
        )}
```

with:

```tsx
        {page === "review" ? (
          <Button title="Generate my trip" size="lg" variant="gradient" onPress={onGenerate} />
        ) : page === "trialOffer" ? null : (
          <Button
            title="Continue"
            size="lg"
            disabled={!canContinue(step, state)}
            onPress={() => {
              if (page === "attribution") saveFunnelAnswers(supabase, funnelPrefs(funnel)).catch(() => {});
              setStep((s) => s + 1);
            }}
          />
        )}
```

- [ ] **Step 8: Verify suites + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add mobile/components/onboarding/TrialOfferStep.tsx mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): trial paywall step with honesty-safe trial/downsell copy"
```

---

### Task 11: Manual device-smoke checklist (user-gated — do NOT automate)

Everything code-side is done after Task 10. Present this list to the user at finish-branch time.

- [ ] **New EAS build** (user): required — `expo-notifications` is a new native dependency. `eas build --profile preview --platform ios`.
- [ ] **Full funnel walkthrough** (user + Claude): intro → planningCheck → hardestParts → goals → goodPlace → relateA1/A2 → craft → relateB1/B2 → trust → notifications → attribution → compare → trialOffer → destination onward. Confirm the progress bar advances smoothly across all 26 steps and back-navigation still works.
- [ ] **Notification permission** (user): tapping "Enable Notifications" shows the real iOS system prompt; both Allow and Don't Allow continue the funnel identically.
- [ ] **Trial copy honesty check** (user + Claude): with no RevenueCat trial/win-back offer configured yet (today's state), `trialOffer` must show plain "Start Pro" copy, **not** "Start your N-day free trial" — confirms the `introPrice`-driven fallback works. Tapping "Not now" should skip straight to `destination` with no downsell screen (no win-back offer configured).
- [ ] **Gate unchanged** (user + Claude): declining the trial paywall (and any downsell) still lets a free account generate exactly 1 trip before hitting the existing `/paywall` gate — confirms `lib/gate.ts` wasn't touched.
- [ ] **Funnel answers persisted** (user + Claude): after completing the `attribution` step, check `profiles.default_prefs` in Supabase for the signed-in test user — should contain `planningCheck`, `hardestParts`, `goals`, `attributionSource` alongside any existing `interests`/`budget`/etc.

**Follow-up (separate task, not this plan):** configure a real RevenueCat trial intro offer and a win-back/promotional discount offer (via `asc-revenuecat-catalog-sync` / `asc-ppp-pricing`) so the `trialOffer` step's honest-by-construction copy actually shows "free trial" / a real downsell to real users.

---

## Self-review notes

- **Spec coverage:** placement/architecture (Tasks 1–10 all extend the existing `onboarding.tsx`/`lib/onboarding.ts`, no new route), all 14 new/moved steps from the spec's screen table (Tasks 1–7, 10), data/persistence + component reuse (Tasks 1, 6, 9), honesty-safe trial/downsell mechanism (Tasks 8, 10), testing convention (jest for pure logic in every task; Task 11 for manual smoke), out-of-scope RevenueCat/ASC product setup flagged in Task 11's follow-up note. ✔
- **Type consistency:** `FunnelState`/`EMPTY_FUNNEL`/`funnelPrefs` (Task 1) used identically in Task 6's wiring and nowhere renamed. `OptionList`'s `Option` type and `ChipMultiSelect`'s `ChipOption` type (Task 1) reused verbatim by Task 6 (`ATTRIBUTION_OPTIONS`) — same field names (`value`/`label`/`desc`/`icon` vs. `value`/`label`). `RelateStatement` (Task 3, no props) reused identically in Task 4. `trialDays`/`getWinBackOffer`/`purchaseWithWinBackOffer` (Task 8) signatures match their usage in Task 10's `TrialOfferStep` exactly. `PlanCard`'s `{ pkg, active, onPress }` props (Task 9) match Task 10's usage.
- **STEPS incremental consistency:** each task's STEPS array is the previous task's array plus exactly the new keys for that task, in the position described by the spec's screen table — verified by re-reading Tasks 1→10 in sequence above.
- **Placeholder scan:** no TBD/TODO markers; every step shows complete code.
