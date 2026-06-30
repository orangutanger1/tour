# Day Sequencing + Stepper + Signed-out Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix day itineraries bunching all stops before lunch (spread them across the day), replace the day +/− buttons with a hold-to-repeat animated stepper, and gate saved-trip content behind sign-in.

**Architecture:** Three independent changes on one branch, each its own TDD commit. (1) Rewrite the clock layout in `schedule.ts` to spread attractions across morning/afternoon windows. (2) A pure `holdRepeat` timer controller (unit-tested) wired into a new reanimated `Stepper` component. (3) Conditional render of a sign-in landing on the Trips tab + adaptive sign-in copy.

**Tech Stack:** Deno (supabase edge, jsr `@std/assert` tests), Expo / React Native, NativeWind, react-native-reanimated 4.3.1, expo-linear-gradient (new), Jest (jest-expo).

## Global Constraints

- Edge schedule code is pure/deterministic, no network. Times formatted via `formatClock` from `solar.ts`.
- `buildDaySchedule` signature unchanged: `{ attractions: Stop[]; sunsetMinutes: number; lunch: Stop; dinner: Stop }) => Stop[]`.
- Constants stay: `DAY_START_MIN=540`, `TRAVEL_BUFFER=1.2`, `MEAL_TRAVEL_MIN=10`, `LUNCH_TARGET_MIN=750`.
- Anonymous plan-before-signin flow must keep working (no blanket `(app)` redirect).
- New dep limited to `expo-linear-gradient` (installed via `npx expo install`). No `expo-blur`.
- Day bounds: min 1, max `MAX_TRIP_DAYS` (from `lib/onboarding`).
- Run deno tests: `deno test supabase/_shared/schedule_test.ts`. Run mobile tests: `cd mobile && npm test`.

---

## File Structure

- `supabase/_shared/schedule.ts` — rewrite `buildDaySchedule` (spread).
- `supabase/_shared/schedule_test.ts` — update broken meal-timing tests, add spread tests.
- `mobile/lib/holdRepeat.ts` (new) — pure hold-to-repeat controller.
- `mobile/lib/holdRepeat.test.ts` (new) — jest fake-timer tests.
- `mobile/components/ui/Stepper.tsx` (new) — animated stepper.
- `mobile/components/ui/index.ts` — export `Stepper`.
- `mobile/app/(app)/onboarding.tsx` — swap +/− row for `<Stepper>`.
- `mobile/package.json` — add `expo-linear-gradient`.
- `mobile/app/(app)/(tabs)/index.tsx` — signed-out landing branch.
- `mobile/app/(auth)/sign-in.tsx` — adaptive copy.

---

## Task 1: Spread attractions across the day (`schedule.ts`)

**Files:**
- Modify: `supabase/_shared/schedule.ts`
- Test: `supabase/_shared/schedule_test.ts`

**Interfaces:**
- Consumes: `Stop` (`types.ts`), `formatClock` (`solar.ts`).
- Produces: `buildDaySchedule(opts) => Stop[]` (signature unchanged). Lunch always anchored at `LUNCH_TARGET_MIN` (12:30), dinner at `max(sunsetMinutes, lunchEnd)`. Morning attractions spread over `[DAY_START_MIN, LUNCH_TARGET_MIN]`, afternoon over `[lunchEnd, dinnerStart]`; slack distributed as even gaps; packed windows (slack ≤ 0) stay back-to-back.

- [ ] **Step 1: Update + add the failing tests**

Replace the bodies of the two timing-specific tests and add two new ones. Full new `supabase/_shared/schedule_test.ts`:

```ts
import { assertEquals, assert } from "jsr:@std/assert";
import { buildDaySchedule } from "./schedule.ts";
import type { Stop } from "./types.ts";

const att = (placeId: string, dwell: number, travel?: number): Stop =>
  ({ placeId, name: placeId, blurb: "x", kind: "attraction", dwellMinutes: dwell, travelMinutesFromPrev: travel });
const lunch: Stop = { placeId: "", name: "Lunch — your pick", blurb: "l", kind: "meal-gap", dwellMinutes: 60 };
const dinner: Stop = { placeId: "", name: "Dinner — your pick", blurb: "d", kind: "meal-gap", dwellMinutes: 60 };

// "9:06 AM" -> 546
function toMin(clock: string): number {
  const [, h, m, ap] = clock.match(/(\d+):(\d+) (AM|PM)/)!;
  let hh = Number(h) % 12;
  if (ap === "PM") hh += 12;
  return hh * 60 + Number(m);
}

Deno.test("first attraction starts at 9:00 AM and times are strictly increasing", () => {
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  assertEquals(out[0].startTime, "9:00 AM");
  const mins = out.map((s) => toMin(s.startTime!));
  for (let i = 1; i < mins.length; i++) assert(mins[i] > mins[i - 1], `not increasing at ${i}: ${mins.join(",")}`);
});

Deno.test("travel buffer (1.2) applies between consecutive stops in a packed window", () => {
  // 8 stops -> morning window gets 3 (proportional), each dwell 90 + travel 20 ->
  // busy 318 > 210min window -> slack 0 -> back-to-back. A@9:00, B@9:00+90+round(20*1.2=24)=10:54.
  const atts = ["A","B","C","D","E","F","G","H"].map((id) => att(id, 90, id === "A" ? undefined : 20));
  const out = buildDaySchedule({ attractions: atts, sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const b = out.find((s) => s.placeId === "B")!;
  assertEquals(b.startTime, "10:54 AM");
});

Deno.test("lunch is anchored at 12:30 and comes before the afternoon stops", () => {
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  assertEquals(l.kind, "meal-gap");
  assertEquals(l.startTime, "12:30 PM");
  assert(out.indexOf(l) < out.findIndex((s) => s.placeId === "C"));
});

Deno.test("sparse day still places an attraction between lunch and dinner", () => {
  const out = buildDaySchedule({ attractions: [att("A", 60), att("B", 60, 20), att("C", 60, 20), att("D", 60, 20)], sunsetMinutes: 1170, lunch: { ...lunch }, dinner: { ...dinner } });
  const lunchMin = toMin(out.find((s) => s.mealSlot === "lunch")!.startTime!);
  const dinnerMin = toMin(out.find((s) => s.mealSlot === "dinner")!.startTime!);
  const between = out.filter((s) => !s.mealSlot && s.kind === "attraction" && toMin(s.startTime!) > lunchMin && toMin(s.startTime!) < dinnerMin);
  assert(between.length >= 1, `expected an attraction between lunch(${lunchMin}) and dinner(${dinnerMin})`);
});

Deno.test("dinner lands at or after sunset", () => {
  const out = buildDaySchedule({ attractions: [att("A", 120), att("B", 120, 30), att("C", 120, 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assert(toMin(d.startTime!) >= 1110, `dinner ${d.startTime} before sunset`);
});

Deno.test("dinner never precedes lunch even with a degenerate (near-zero) sunset", () => {
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 0, lunch: { ...lunch }, dinner: { ...dinner } });
  const li = out.findIndex((s) => s.mealSlot === "lunch");
  const di = out.findIndex((s) => s.mealSlot === "dinner");
  assert(li >= 0 && di >= 0 && li < di, `lunch(${li}) must come before dinner(${di})`);
});

Deno.test("short day still appends both meals at their target times", () => {
  const out = buildDaySchedule({ attractions: [att("A", 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assertEquals(l.startTime, "12:30 PM");
  assertEquals(d.startTime, "6:30 PM");
});
```

- [ ] **Step 2: Run tests to verify the new/updated ones fail**

Run: `deno test supabase/_shared/schedule_test.ts`
Expected: FAIL on "travel buffer … packed window", "lunch is anchored at 12:30 …", and "sparse day …" (old code anchors lunch at the noon-crossing boundary and stacks stops).

- [ ] **Step 3: Rewrite `buildDaySchedule`**

Full new `supabase/_shared/schedule.ts`:

```ts
// supabase/_shared/schedule.ts
// Lays an absolute clock over a day's already-ordered attractions and spreads
// them across the day so stops don't all bunch before lunch. Lunch is anchored
// at its target, dinner at sunset; attractions fill the morning and afternoon
// windows between them. Pure, deterministic, no network. Meals do NOT
// participate in routing — they get a flat MEAL_TRAVEL_MIN "find a nearby spot"
// leg baked into the window math.
import type { Stop } from "./types.ts";
import { formatClock } from "./solar.ts";

export const DAY_START_MIN = 9 * 60;          // 9:00 AM. calibration knob.
export const TRAVEL_BUFFER = 1.2;             // +20% on transit (operator rule). knob.
export const MEAL_TRAVEL_MIN = 10;            // flat hop to a nearby eatery. knob.
export const LUNCH_TARGET_MIN = 12 * 60 + 30; // 12:30 PM. knob.

export function buildDaySchedule(opts: {
  attractions: Stop[];
  sunsetMinutes: number;
  lunch: Stop;
  dinner: Stop;
}): Stop[] {
  const { attractions, sunsetMinutes, lunch, dinner } = opts;

  const lunchDwell = lunch.dwellMinutes ?? 60;
  const lunchStart = LUNCH_TARGET_MIN;
  const lunchEnd = lunchStart + MEAL_TRAVEL_MIN + lunchDwell;
  const dinnerStart = Math.max(sunsetMinutes, lunchEnd); // dinner never before lunch ends

  // Split attractions across the two windows in proportion to each window's
  // length, so the longer (afternoon) window carries more stops.
  const morningLen = Math.max(0, lunchStart - DAY_START_MIN);
  const afternoonLen = Math.max(0, dinnerStart - lunchEnd);
  const total = morningLen + afternoonLen;
  const n = attractions.length;
  const morningCount = total > 0 ? Math.round((n * morningLen) / total) : n;
  const morning = attractions.slice(0, morningCount);
  const afternoon = attractions.slice(morningCount);

  const out: Stop[] = [];

  // Lay `stops` across [start, end], distributing any slack evenly between them.
  // Packed window (slack <= 0) collapses to back-to-back from `start`.
  const spread = (stops: Stop[], start: number, end: number) => {
    if (stops.length === 0) return;
    let dwellSum = 0;
    let travelSum = 0;
    stops.forEach((s, i) => {
      dwellSum += s.dwellMinutes ?? 0;
      if (i > 0) travelSum += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
    });
    const slack = Math.max(0, end - start - dwellSum - travelSum);
    const gap = stops.length > 1 ? slack / (stops.length - 1) : 0;
    let clock = start;
    stops.forEach((s, i) => {
      if (i > 0) {
        clock += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
        clock += Math.round(gap);
      }
      out.push({ ...s, startTime: formatClock(clock) });
      clock += s.dwellMinutes ?? 0;
    });
  };

  const placeMeal = (meal: Stop, slot: "lunch" | "dinner", at: number) => {
    out.push({ ...meal, startTime: formatClock(at), mealSlot: slot, dwellMinutes: meal.dwellMinutes ?? 60 });
  };

  spread(morning, DAY_START_MIN, lunchStart);
  placeMeal(lunch, "lunch", lunchStart);
  spread(afternoon, lunchEnd, dinnerStart);
  placeMeal(dinner, "dinner", dinnerStart);

  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `deno test supabase/_shared/schedule_test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/schedule.ts supabase/_shared/schedule_test.ts
git commit -m "fix(schedule): spread attractions across the day, no dead pre-dinner gap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Hold-to-repeat controller + animated Stepper

**Files:**
- Create: `mobile/lib/holdRepeat.ts`, `mobile/lib/holdRepeat.test.ts`, `mobile/components/ui/Stepper.tsx`
- Modify: `mobile/components/ui/index.ts`, `mobile/app/(app)/onboarding.tsx`, `mobile/package.json`

**Interfaces:**
- Produces: `makeHoldRepeat(onTick: () => boolean) => { start(): void; stop(): void }` — `start` fires one immediate `onTick`, then auto-repeats after `HOLD_DELAY` on accelerating `HOLD_INTERVALS`; stops when `onTick` returns `false`. Also `HOLD_DELAY: number`, `HOLD_INTERVALS: number[]`.
- Produces: `Stepper({ value, onChange, min, max, suffix? })` React component.
- Consumes: `MAX_TRIP_DAYS` (`lib/onboarding`), `Text` (`components/ui`).

- [ ] **Step 1: Write the failing controller test**

`mobile/lib/holdRepeat.test.ts`:

```ts
import { makeHoldRepeat, HOLD_DELAY } from "./holdRepeat";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("tap (press + quick release) fires exactly one bump", () => {
  let n = 0;
  const { start, stop } = makeHoldRepeat(() => { n++; return true; });
  start();
  stop(); // released before HOLD_DELAY
  jest.advanceTimersByTime(2000);
  expect(n).toBe(1);
});

test("hold fires repeated bumps that accelerate", () => {
  let n = 0;
  const { start } = makeHoldRepeat(() => { n++; return true; });
  start();                          // immediate => 1
  jest.advanceTimersByTime(HOLD_DELAY); // => 2
  jest.advanceTimersByTime(300);        // => 3
  jest.advanceTimersByTime(150);        // => 4
  jest.advanceTimersByTime(80 * 5);     // => 9
  expect(n).toBeGreaterThanOrEqual(6);
});

test("stops auto-repeat when onTick returns false (hit a bound)", () => {
  let n = 0;
  const { start } = makeHoldRepeat(() => { n++; return n < 3; });
  start();
  jest.advanceTimersByTime(5000);
  expect(n).toBe(3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npm test -- holdRepeat`
Expected: FAIL — cannot find module `./holdRepeat`.

- [ ] **Step 3: Write the controller**

`mobile/lib/holdRepeat.ts`:

```ts
// mobile/lib/holdRepeat.ts
// Press-and-hold auto-repeat with acceleration. `onTick` performs one bump and
// returns false to stop (e.g. value hit min/max). Pure timers, no React.
// ponytail: setTimeout chain; swap to requestAnimationFrame only if 80ms feels chunky.
export const HOLD_DELAY = 400;                 // pause before auto-repeat starts. knob.
export const HOLD_INTERVALS = [300, 150, 80];  // accelerating cadence, last value sticks. knob.

export function makeHoldRepeat(onTick: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let step = 0;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    step = 0;
  };

  const schedule = (delay: number) => {
    timer = setTimeout(() => {
      if (!onTick()) { stop(); return; }
      const next = HOLD_INTERVALS[Math.min(step, HOLD_INTERVALS.length - 1)];
      step++;
      schedule(next);
    }, delay);
  };

  const start = () => {
    stop();
    if (!onTick()) return; // immediate first bump; bail if already at a bound
    schedule(HOLD_DELAY);
  };

  return { start, stop };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mobile && npm test -- holdRepeat`
Expected: PASS (3 tests).

- [ ] **Step 5: Install the gradient dependency**

Run: `cd mobile && npx expo install expo-linear-gradient`
Expected: adds `expo-linear-gradient` to `package.json` dependencies.

- [ ] **Step 6: Write the Stepper component**

`mobile/components/ui/Stepper.tsx`:

```tsx
// mobile/components/ui/Stepper.tsx
// Day stepper: hold a button to auto-repeat (accelerating), and the number
// rolls with a vertical slide + fade/scale on change. The gradient masks at the
// top/bottom of the number window soften the roll so digits don't hard-clip.
// ponytail: animates the whole number, not per-digit odometer columns — fine for
// a 1–2 digit day count; add columns only if this ever shows big numbers.
import { useRef } from "react";
import { View, Pressable } from "react-native";
import Animated, { Keyframe } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./Text";
import { makeHoldRepeat } from "../../lib/holdRepeat";

const BG = "#FFFBFC"; // tailwind `bg`. mask fades to this. knob if Stepper moves onto a card.
const WINDOW_H = 56;

const rollIn = (dir: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: dir > 0 ? 22 : -22 }, { scale: 0.7 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  }).duration(240);

const rollOut = (dir: number) =>
  new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    100: { opacity: 0, transform: [{ translateY: dir > 0 ? -22 : 22 }, { scale: 0.7 }] },
  }).duration(240);

function StepButton({ label, onBump, disabled }: { label: string; onBump: () => boolean; disabled: boolean }) {
  // one controller per button, created once
  const ctl = useRef(makeHoldRepeat(onBump)).current;
  return (
    <Pressable
      onPressIn={() => { if (!disabled) ctl.start(); }}
      onPressOut={() => ctl.stop()}
      disabled={disabled}
      className={`w-14 h-14 rounded-pill items-center justify-center bg-surface border border-border active:bg-surface-2 ${disabled ? "opacity-40" : ""}`}
    >
      <Text variant="title" className="text-ink">{label}</Text>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min, max, suffix }: {
  value: number; onChange: (next: number) => void; min: number; max: number; suffix?: string;
}) {
  const dir = useRef(1);
  const valueRef = useRef(value);
  valueRef.current = value;

  // returns true if a bump happened (value changed) — drives hold auto-repeat
  const bump = (delta: number) => () => {
    const next = Math.min(max, Math.max(min, valueRef.current + delta));
    if (next === valueRef.current) return false;
    dir.current = delta;
    onChange(next);
    return true;
  };

  return (
    <View className="flex-row items-center justify-center gap-5">
      <StepButton label="–" onBump={bump(-1)} disabled={value <= min} />
      <View className="items-center" style={{ width: 120 }}>
        <View style={{ height: WINDOW_H, overflow: "hidden", justifyContent: "center" }}>
          <Animated.View key={value} entering={rollIn(dir.current)} exiting={rollOut(dir.current)} style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
            <Text variant="display" className="text-ink">{value}</Text>
          </Animated.View>
          <LinearGradient colors={[BG, "transparent"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12 }} pointerEvents="none" />
          <LinearGradient colors={["transparent", BG]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 12 }} pointerEvents="none" />
        </View>
        {suffix ? <Text variant="caption" className="text-ink-muted">{suffix}</Text> : null}
      </View>
      <StepButton label="+" onBump={bump(1)} disabled={value >= max} />
    </View>
  );
}
```

- [ ] **Step 7: Export Stepper**

Add to `mobile/components/ui/index.ts`:

```ts
export { Stepper } from "./Stepper";
```

- [ ] **Step 8: Wire Stepper into onboarding**

In `mobile/app/(app)/onboarding.tsx`, add `Stepper` to the ui import (line 17):

```tsx
import { Screen, Text, Button, Chip, Input, Card, Stepper } from "../../components/ui";
```

Replace the +/− row (lines 194–200):

```tsx
          <View className="flex-row items-center gap-3">
            <Button title="–" variant="secondary" className="w-12" disabled={state.tripDays <= 1}
              onPress={() => setState((s) => ({ ...s, tripDays: Math.max(1, s.tripDays - 1) }))} />
            <Text variant="title" className="w-24 text-center">{state.tripDays} {state.tripDays === 1 ? "day" : "days"}</Text>
            <Button title="+" variant="secondary" className="w-12" disabled={state.tripDays >= MAX_TRIP_DAYS}
              onPress={() => setState((s) => ({ ...s, tripDays: Math.min(MAX_TRIP_DAYS, s.tripDays + 1) }))} />
          </View>
```

with:

```tsx
          <Stepper
            value={state.tripDays}
            min={1}
            max={MAX_TRIP_DAYS}
            suffix={state.tripDays === 1 ? "day" : "days"}
            onChange={(d) => setState((s) => ({ ...s, tripDays: d }))}
          />
```

- [ ] **Step 9: Typecheck + tests**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: tsc clean; all jest suites pass (including holdRepeat).

- [ ] **Step 10: Commit**

```bash
git add mobile/lib/holdRepeat.ts mobile/lib/holdRepeat.test.ts mobile/components/ui/Stepper.tsx mobile/components/ui/index.ts mobile/app/\(app\)/onboarding.tsx mobile/package.json mobile/package-lock.json
git commit -m "feat(onboarding): hold-to-repeat animated day stepper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Signed-out gate on the Trips tab + adaptive sign-in copy

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`, `mobile/app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `useAuth().session`, `useTripFlow().pendingRequest`, `Screen/Text/Button` (`components/ui`), `useRouter`.
- Produces: signed-out Trips tab renders a sign-in landing (no trip fetch); sign-in screen copy adapts to whether a pending trip exists.

- [ ] **Step 1: Add the signed-out landing branch**

In `mobile/app/(app)/(tabs)/index.tsx`, after the `useQuery` block (currently `enabled: !!session`) and before `Header`, add an early return for signed-out users:

```tsx
  if (!session) {
    return (
      <Screen>
        <View className="flex-1 justify-center gap-3">
          <Text variant="display">Welcome to your trips</Text>
          <Text variant="body" className="text-ink-muted">
            Sign in to see your saved trips — or start planning a new one.
          </Text>
        </View>
        <View className="pb-2 gap-3">
          <Button title="Sign in" onPress={() => router.push("/(auth)/sign-in")} />
          <Button title="Plan a trip" variant="secondary" onPress={() => router.push("/onboarding")} />
        </View>
      </Screen>
    );
  }
```

- [ ] **Step 2: Make sign-in copy adaptive**

In `mobile/app/(auth)/sign-in.tsx`, replace the header block (the centered logo `View` with "Almost there" / "Sign in to save your trip…", lines 38–45) with copy that depends on `pendingRequest`:

```tsx
      <View className="flex-1 justify-center items-center gap-3">
        <View className="w-16 h-16 rounded-xl bg-accent items-center justify-center">
          <Text variant="title" className="text-ink-inverse">T</Text>
        </View>
        <Text variant="display" className="text-center">{pendingRequest ? "Almost there" : "Welcome back"}</Text>
        <Text variant="body" className="text-center text-ink-muted">
          {pendingRequest ? "Sign in to save your trip and pick up anywhere." : "Sign in to see your trips and pick up anywhere."}
        </Text>
      </View>
```

(`pendingRequest` is already destructured from `useTripFlow()` at the top of the component.)

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: clean. (Auth gate is a trivial JSX branch — verified by tsc + manual device check; no render-test dependency added. ponytail: skip a test framework for a one-branch conditional.)

- [ ] **Step 4: Run the full mobile suite (regression)**

Run: `cd mobile && npm test`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(app\)/\(tabs\)/index.tsx mobile/app/\(auth\)/sign-in.tsx
git commit -m "feat(auth): gate saved trips behind sign-in; adaptive sign-in copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** §1 sequencing → Task 1. §2 stepper (hold/roll/gradient/blur-approx) → Task 2. §3 auth gate + adaptive copy → Task 3. All covered.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `makeHoldRepeat`/`HOLD_DELAY`/`HOLD_INTERVALS` consistent across `holdRepeat.ts`, its test, and `Stepper.tsx`. `Stepper` props match the onboarding call site. `buildDaySchedule` signature unchanged so `handler.ts` caller is untouched.
- **Deviation from spec:** spec §2/§3 mentioned render tests; replaced with a pure controller test (Task 2) and tsc-only verification for the auth JSX branch (Task 3) to avoid adding `@testing-library/react-native`. Animation itself is verified on device.

## Verification (post-implementation, on device/OTA)
- Generate a balanced/relaxed trip → each day shows attractions both before and after lunch, dinner near sunset, no multi-hour dead gap.
- Onboarding day control: tap = +1; press-and-hold ramps up fast; number rolls with soft edges; stops at 1 and `MAX_TRIP_DAYS`.
- Sign out → Trips tab shows the sign-in landing, not the trip list; "Sign in" → sign-in screen shows "Welcome back" copy; planning a trip anonymously still reaches sign-in with "Almost there" copy.
