# Sunset Soft Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App-wide soft-minimal redesign (tokens, components, motion), onboarding rebuilt as 8 one-question pages with a custom range calendar and real trip dates, and round-trip/one-way routing with leg-chunked generation for long trips.

**Architecture:** Evolve the existing NativeWind design system in place (no UI library). Pure-TS date math in `lib/dates.ts` feeds a custom `RangeCalendar`. Backend gains `startDate`/`endDate`/`tripType` on the generate request, a `trips` migration, trip-type-aware day ordering in `cluster.ts`, and a new `legs.ts` that splits long trips into ≤7-day geographic legs with per-leg POI pools and parallel LLM curation.

**Tech Stack:** Expo 56 / RN 0.85, expo-router, NativeWind 4, react-native-reanimated 4, expo-linear-gradient, @expo/vector-icons (to install — JS+fonts only), Supabase edge functions (Deno), jest-expo, Deno test.

**Spec:** `docs/superpowers/specs/2026-07-01-sunset-soft-redesign-design.md`

## Global Constraints

- **Zero new native dependencies.** Only allowed install: `@expo/vector-icons` (JS + bundled fonts, OTA-safe). Anything requiring a new EAS build is out.
- **Light mode only**; do not hardcode values that would block a later dark theme where a token exists.
- **One primary action per screen**: the `gradient` Button variant is reserved for that action; everything else uses `primary`/`secondary`/`ghost`.
- Read the Expo v56 docs (https://docs.expo.dev/versions/v56.0.0/) before writing Expo API code (per `mobile/AGENTS.md`).
- `mobile/lib/types.ts` is a hand-kept mirror of `supabase/_shared/types.ts` — change both together.
- Verification commands: `cd mobile && npx tsc --noEmit && npx jest` (mobile) and `cd supabase && deno test` (backend). All suites must be green at every commit.
- Conventional commits, one commit per task minimum. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- No trip-length clamp anywhere in mobile UI; backend rejects only `tripDays < 1` or `> 365`.
- Springs subtle: damping ~18–20, stiffness ~160–350. Soft-minimal, not cartoon-bouncy.

---

## Phase 1 — Design-system foundation

### Task 1: Tokens + Text scale + Card

**Files:**
- Modify: `mobile/tailwind.config.js`
- Modify: `mobile/components/ui/Text.tsx`
- Modify: `mobile/components/ui/Card.tsx`
- Modify: `mobile/components/ui/TripCard.tsx` (negative margins track Card padding)

**Interfaces:**
- Produces: tailwind tokens `rounded-sm|md|lg|xl|pill` (10/14/20/28/999), `shadow-soft|card|float`, colors `tint-*` / `tintfg-*` (scenic, food, history, nightlife, outdoors, art, shopping); Text variants `display` 36/42, `title` 28/34, `heading` 20/26 (body/caption/label unchanged). Card: `rounded-xl p-5`.

- [ ] **Step 1: Update tailwind theme**

Replace the `theme.extend` block in `mobile/tailwind.config.js` with:

```js
    extend: {
      colors: {
        accent: { DEFAULT: "#E11D48", soft: "#FFF1F3", pressed: "#BE123C", 2: "#FB7185" },
        bg: "#FFFBFC",
        surface: { DEFAULT: "#FFFFFF", 2: "#F7F4F5" },
        border: "#ECE7E9",
        ink: { DEFAULT: "#1A0E12", muted: "#6B5560", inverse: "#FFFFFF" },
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        tint: {
          scenic: "#DFF7F1", food: "#FFF1DC", history: "#E8EBFF", nightlife: "#F1E8FF",
          outdoors: "#E3F6E6", art: "#FFE8F2", shopping: "#E3F0FF",
        },
        tintfg: {
          scenic: "#0F766E", food: "#B45309", history: "#4338CA", nightlife: "#7C3AED",
          outdoors: "#15803D", art: "#BE185D", shopping: "#1D4ED8",
        },
      },
      borderRadius: { sm: "10px", md: "14px", lg: "20px", xl: "28px", pill: "999px" },
      fontFamily: {
        jakarta: ["PlusJakartaSans_400Regular"],
        "jakarta-medium": ["PlusJakartaSans_500Medium"],
        "jakarta-semibold": ["PlusJakartaSans_600SemiBold"],
        "jakarta-bold": ["PlusJakartaSans_700Bold"],
        "jakarta-extrabold": ["PlusJakartaSans_800ExtraBold"],
      },
      boxShadow: {
        soft: "0px 2px 8px rgba(26,14,18,0.06)",
        card: "0px 4px 16px rgba(26,14,18,0.08)",
        float: "0px 8px 24px rgba(26,14,18,0.12)",
      },
    },
```

- [ ] **Step 2: Update Text variants**

In `mobile/components/ui/Text.tsx` replace the `VARIANTS` map with:

```tsx
const VARIANTS: Record<Variant, string> = {
  display: "text-[36px] leading-[42px] font-jakarta-extrabold text-ink tracking-[-0.5px]",
  title: "text-[28px] leading-[34px] font-jakarta-bold text-ink tracking-[-0.3px]",
  heading: "text-[20px] leading-[26px] font-jakarta-bold text-ink",
  body: "text-[16px] leading-[22px] font-jakarta-medium text-ink",
  caption: "text-[14px] leading-[20px] font-jakarta-medium text-ink-muted",
  label: "text-[13px] leading-[18px] font-jakarta-semibold text-ink",
};
```

- [ ] **Step 3: Update Card**

In `mobile/components/ui/Card.tsx` change the class string:

```tsx
  const cls = `bg-surface rounded-xl p-5 shadow-card ${className ?? ""}`;
```

In `mobile/components/ui/TripCard.tsx` the cover strip uses negative margins matching the old `p-4`; change `-mx-4 -mt-4` to `-mx-5 -mt-5` so the cover stays full-bleed:

```tsx
      <View className="h-28 -mx-5 -mt-5 mb-3 bg-accent-soft items-center justify-center">
```

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS (existing tests assert logic, not styles).

- [ ] **Step 5: Commit**

```bash
git add mobile/tailwind.config.js mobile/components/ui/Text.tsx mobile/components/ui/Card.tsx mobile/components/ui/TripCard.tsx
git commit -m "feat(design): sunset-soft tokens — radius/shadow scale, category tints, oversized type"
```

### Task 2: Gradient constants + Icon component

**Files:**
- Create: `mobile/components/ui/gradients.ts`
- Create: `mobile/components/ui/Icon.tsx`
- Modify: `mobile/components/ui/index.ts`
- Modify: `mobile/package.json` (via expo install)

**Interfaces:**
- Produces: `SUNSET`, `SUNSET_SOFT`, `BLOB_ROSE`, `BLOB_AMBER` color tuples; `Icon({ name, size?, color? })` with `IconName` type re-exported. Later tasks import `{ Icon, type IconName }` and gradient constants from `../../components/ui` (or `./gradients` inside ui/).

- [ ] **Step 1: Install @expo/vector-icons**

Run: `cd mobile && npx expo install @expo/vector-icons`
Expected: added to package.json, no native changes.

- [ ] **Step 2: Create gradients.ts**

```ts
// mobile/components/ui/gradients.ts
// Sunset family — crimson anchor, coral/amber partners. Restrained: hero CTAs
// and decor only; never body surfaces.
export const SUNSET = ["#E11D48", "#F4526B", "#FB923C"] as const;
export const SUNSET_SOFT = ["#FFE4E9", "#FFEDD5"] as const;
export const BLOB_ROSE = ["#FFD6DE", "#FFE9EF"] as const;
export const BLOB_AMBER = ["#FFE9D1", "#FFF5E8"] as const;
```

- [ ] **Step 3: Create Icon.tsx**

```tsx
// mobile/components/ui/Icon.tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 20, color = "#1A0E12" }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
```

- [ ] **Step 4: Export from index.ts**

Add to `mobile/components/ui/index.ts`:

```ts
export { Icon, type IconName } from "./Icon";
export { SUNSET, SUNSET_SOFT, BLOB_ROSE, BLOB_AMBER } from "./gradients";
```

- [ ] **Step 5: Verify + commit**

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add mobile/package.json mobile/package-lock.json mobile/components/ui/gradients.ts mobile/components/ui/Icon.tsx mobile/components/ui/index.ts
git commit -m "feat(design): sunset gradient constants + Ionicons Icon wrapper"
```

### Task 3: PressableScale motion primitive + Button rework

**Files:**
- Create: `mobile/components/ui/PressableScale.tsx`
- Modify: `mobile/components/ui/Button.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Produces: `PressableScale` (Pressable + spring scale, accepts `className`), `AnimatedView` (className-enabled `Animated.View`) — both used by Chip, OptionCard, ProgressBar, onboarding. Button gains `variant="gradient"`.

- [ ] **Step 1: Create PressableScale.tsx**

```tsx
// mobile/components/ui/PressableScale.tsx
// Spring press-scale for all touchables. cssInterop registers className support
// on reanimated components once, module-wide.
import { Pressable, type PressableProps } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { cssInterop } from "nativewind";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressableBase, { className: "style" });
cssInterop(Animated.View, { className: "style" });

export const AnimatedPressable = AnimatedPressableBase;
export const AnimatedView = Animated.View;

const SPRING = { damping: 20, stiffness: 350 };

export function PressableScale({ onPressIn, onPressOut, ...props }: PressableProps & { className?: string }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      style={animated}
      onPressIn={(e) => { scale.value = withSpring(0.97, SPRING); onPressIn?.(e); }}
      onPressOut={(e) => { scale.value = withSpring(1, SPRING); onPressOut?.(e); }}
      {...props}
    />
  );
}
```

Note: if `className` fails to apply on `AnimatedPressable` at runtime (nativewind interop edge), fall back to a plain `Pressable` wrapper containing an `AnimatedView` that carries the `className` — but try the above first; it is the documented nativewind v4 pattern.

- [ ] **Step 2: Rework Button.tsx**

Full replacement:

```tsx
// mobile/components/ui/Button.tsx
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { SUNSET } from "./gradients";

type Variant = "primary" | "secondary" | "ghost" | "gradient";
type Size = "sm" | "md" | "lg";

const BASE = "flex-row items-center justify-center rounded-pill overflow-hidden";
const SIZES: Record<Size, string> = { sm: "h-10 px-4", md: "h-12 px-5", lg: "h-14 px-6" };
const BG: Record<Variant, string> = {
  primary: "bg-accent",
  secondary: "bg-surface border border-border",
  ghost: "bg-transparent",
  gradient: "shadow-float",
};
const FG: Record<Variant, string> = {
  primary: "text-ink-inverse", secondary: "text-ink", ghost: "text-accent", gradient: "text-ink-inverse",
};

export function Button({ title, onPress, variant = "primary", size = "md", disabled, loading, leftIcon, className }: {
  title: string; onPress?: () => void; variant?: Variant; size?: Size; disabled?: boolean; loading?: boolean; leftIcon?: ReactNode; className?: string;
}) {
  const off = disabled || loading;
  return (
    <PressableScale onPress={onPress} disabled={off} className={`${BASE} ${SIZES[size]} ${BG[variant]} ${off ? "opacity-50" : ""} ${className ?? ""}`}>
      {variant === "gradient" ? (
        <LinearGradient
          colors={SUNSET}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={variant === "secondary" || variant === "ghost" ? "#E11D48" : "#FFFFFF"} />
      ) : (
        <View className="flex-row items-center gap-2">
          {leftIcon}
          <Text variant="label" className={`${FG[variant]} text-[15px]`}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}
```

(The old `active:bg-*` classes are gone — the scale spring replaces press feedback.)

- [ ] **Step 3: Export**

Add to `mobile/components/ui/index.ts`:

```ts
export { PressableScale, AnimatedPressable, AnimatedView } from "./PressableScale";
```

- [ ] **Step 4: Verify + commit**

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add mobile/components/ui/PressableScale.tsx mobile/components/ui/Button.tsx mobile/components/ui/index.ts
git commit -m "feat(design): PressableScale spring primitive + gradient Button variant"
```

### Task 4: Chip (icon + pop) + OptionCard

**Files:**
- Modify: `mobile/components/ui/Chip.tsx`
- Create: `mobile/components/ui/OptionCard.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Produces: `Chip({ label, selected, onPress, icon? })` (icon: ReactNode); `OptionCard({ icon?, title, description, selected, onPress })`. Onboarding (Task 8) consumes both.

- [ ] **Step 1: Rework Chip.tsx**

```tsx
// mobile/components/ui/Chip.tsx
import type { ReactNode } from "react";
import { useSharedValue, useAnimatedStyle, withSequence, withSpring } from "react-native-reanimated";
import { AnimatedPressable } from "./PressableScale";
import { Text } from "./Text";

export function Chip({ label, selected, onPress, icon }: {
  label: string; selected: boolean; onPress: () => void; icon?: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      style={animated}
      onPress={() => {
        scale.value = withSequence(withSpring(1.06, { damping: 12, stiffness: 400 }), withSpring(1, { damping: 16, stiffness: 300 }));
        onPress();
      }}
      className={`h-11 px-4 flex-row items-center gap-1.5 rounded-pill border ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}
    >
      {icon}
      <Text variant="label" className={selected ? "text-accent" : "text-ink"}>{label}</Text>
    </AnimatedPressable>
  );
}
```

- [ ] **Step 2: Create OptionCard.tsx**

```tsx
// mobile/components/ui/OptionCard.tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { Icon } from "./Icon";

export function OptionCard({ icon, title, description, selected, onPress }: {
  icon?: ReactNode; title: string; description: string; selected: boolean; onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      className={`flex-row items-center gap-3 p-4 rounded-lg border-2 ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}
    >
      {icon ? (
        <View className={`w-11 h-11 rounded-md items-center justify-center ${selected ? "bg-surface" : "bg-surface-2"}`}>
          {icon}
        </View>
      ) : null}
      <View className="flex-1 gap-0.5">
        <Text variant="heading" className={selected ? "text-accent" : "text-ink"}>{title}</Text>
        <Text variant="caption">{description}</Text>
      </View>
      {selected ? <Icon name="checkmark-circle" size={22} color="#E11D48" /> : null}
    </PressableScale>
  );
}
```

- [ ] **Step 3: Export, verify, commit**

Add `export { OptionCard } from "./OptionCard";` to `mobile/components/ui/index.ts`.

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add mobile/components/ui/Chip.tsx mobile/components/ui/OptionCard.tsx mobile/components/ui/index.ts
git commit -m "feat(design): Chip select pop + OptionCard"
```

### Task 5: ProgressBar + Blobs + Screen decor

**Files:**
- Create: `mobile/components/ui/ProgressBar.tsx`
- Create: `mobile/components/ui/Blobs.tsx`
- Modify: `mobile/components/ui/Screen.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Produces: `ProgressBar({ progress, className? })` (progress 0..1, spring-animated); `Blobs()` decor; `Screen` gains `decor?: boolean`.

- [ ] **Step 1: Create ProgressBar.tsx**

```tsx
// mobile/components/ui/ProgressBar.tsx
import { useEffect } from "react";
import { View } from "react-native";
import { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { AnimatedView } from "./PressableScale";

export function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  const p = useSharedValue(progress);
  useEffect(() => { p.value = withSpring(progress, { damping: 18, stiffness: 160 }); }, [progress]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, p.value)) * 100}%` }));
  return (
    <View className={`h-2 rounded-pill bg-surface-2 overflow-hidden ${className ?? ""}`}>
      <AnimatedView style={fill} className="h-full rounded-pill bg-accent" />
    </View>
  );
}
```

- [ ] **Step 2: Create Blobs.tsx**

```tsx
// mobile/components/ui/Blobs.tsx
// Static organic decor for hero areas. pointerEvents="none": pure background.
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BLOB_ROSE, BLOB_AMBER } from "./gradients";

export function Blobs() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <LinearGradient
        colors={BLOB_ROSE}
        style={{ position: "absolute", top: -80, right: -70, width: 260, height: 260, borderRadius: 999, opacity: 0.55, transform: [{ rotate: "18deg" }] }}
      />
      <LinearGradient
        colors={BLOB_AMBER}
        style={{ position: "absolute", bottom: 40, left: -90, width: 300, height: 300, borderRadius: 999, opacity: 0.5 }}
      />
    </View>
  );
}
```

- [ ] **Step 3: Screen decor prop**

Full replacement of `mobile/components/ui/Screen.tsx`:

```tsx
// mobile/components/ui/Screen.tsx
import type { ReactNode } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Blobs } from "./Blobs";

export function Screen({ children, scroll, decor, className }: {
  children: ReactNode; scroll?: boolean; decor?: boolean; className?: string;
}) {
  if (scroll) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
        {decor ? <Blobs /> : null}
        <ScrollView className="flex-1" contentContainerClassName={`px-6 py-4 gap-4 ${className ?? ""}`} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      {decor ? <Blobs /> : null}
      <View className={`flex-1 px-6 py-4 ${className ?? ""}`}>{children}</View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Export, verify, commit**

Add to `mobile/components/ui/index.ts`:

```ts
export { ProgressBar } from "./ProgressBar";
export { Blobs } from "./Blobs";
```

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add mobile/components/ui/ProgressBar.tsx mobile/components/ui/Blobs.tsx mobile/components/ui/Screen.tsx mobile/components/ui/index.ts
git commit -m "feat(design): ProgressBar, Blobs decor, Screen decor prop"
```

---

## Phase 2 — Dates, onboarding, backend

### Task 6: lib/dates.ts (TDD)

**Files:**
- Create: `mobile/lib/dates.ts`
- Test: `mobile/lib/dates.test.ts`

**Interfaces:**
- Produces (exact, consumed by Tasks 7, 8, 11):

```ts
export interface DateRange { start: string; end: string }        // ISO "YYYY-MM-DD"
export type PartialRange = { start?: string; end?: string };
export function todayISO(now?: Date): string;                    // local date
export function addDaysISO(iso: string, n: number): string;
export function inclusiveDayCount(start: string, end: string): number;
export function selectDay(sel: PartialRange, day: string): PartialRange;
export function isInRange(day: string, sel: PartialRange): boolean; // strictly between
export function monthGrid(year: number, month0: number): (string | null)[][]; // weeks×7
export function monthLabel(year: number, month0: number): string; // "July 2026"
export function nextMonth(y: number, m0: number): [number, number];
export function prevMonth(y: number, m0: number): [number, number];
export function formatShort(iso: string): string;                // "Jul 12"
export function formatDayHeader(iso: string): string;            // "Tue, Jul 14"
```

- [ ] **Step 1: Write the failing tests**

```ts
// mobile/lib/dates.test.ts
import {
  todayISO, addDaysISO, inclusiveDayCount, selectDay, isInRange,
  monthGrid, monthLabel, nextMonth, prevMonth, formatShort, formatDayHeader,
} from "./dates";

test("todayISO formats a local date", () => {
  expect(todayISO(new Date(2026, 6, 1, 9, 30))).toBe("2026-07-01"); // month0=6 → July
});

test("addDaysISO crosses month and year boundaries", () => {
  expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
  expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDaysISO("2026-07-14", 0)).toBe("2026-07-14");
});

test("inclusiveDayCount counts both endpoints", () => {
  expect(inclusiveDayCount("2026-07-12", "2026-07-18")).toBe(7);
  expect(inclusiveDayCount("2026-07-12", "2026-07-12")).toBe(1);
  expect(inclusiveDayCount("2026-07-01", "2026-09-01")).toBe(63); // no clamp — long trips valid
});

test("selectDay: first tap sets start", () => {
  expect(selectDay({}, "2026-07-12")).toEqual({ start: "2026-07-12" });
});

test("selectDay: same or later tap completes the range (same day = 1-day trip)", () => {
  expect(selectDay({ start: "2026-07-12" }, "2026-07-18")).toEqual({ start: "2026-07-12", end: "2026-07-18" });
  expect(selectDay({ start: "2026-07-12" }, "2026-07-12")).toEqual({ start: "2026-07-12", end: "2026-07-12" });
});

test("selectDay: earlier tap restarts the range", () => {
  expect(selectDay({ start: "2026-07-12" }, "2026-07-05")).toEqual({ start: "2026-07-05" });
});

test("selectDay: tap after a full range starts a new range", () => {
  expect(selectDay({ start: "2026-07-12", end: "2026-07-18" }, "2026-07-20")).toEqual({ start: "2026-07-20" });
});

test("isInRange is strictly between endpoints and needs a full range", () => {
  const sel = { start: "2026-07-12", end: "2026-07-18" };
  expect(isInRange("2026-07-15", sel)).toBe(true);
  expect(isInRange("2026-07-12", sel)).toBe(false);
  expect(isInRange("2026-07-18", sel)).toBe(false);
  expect(isInRange("2026-07-15", { start: "2026-07-12" })).toBe(false);
});

test("monthGrid July 2026: starts Wednesday, 31 days, 7-wide rows", () => {
  const weeks = monthGrid(2026, 6);
  expect(weeks[0]).toEqual([null, null, null, "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"]);
  expect(weeks.every((w) => w.length === 7)).toBe(true);
  const days = weeks.flat().filter(Boolean);
  expect(days.length).toBe(31);
  expect(days[30]).toBe("2026-07-31");
});

test("monthLabel / nextMonth / prevMonth", () => {
  expect(monthLabel(2026, 6)).toBe("July 2026");
  expect(nextMonth(2026, 11)).toEqual([2027, 0]);
  expect(prevMonth(2026, 0)).toEqual([2025, 11]);
  expect(nextMonth(2026, 6)).toEqual([2026, 7]);
});

test("formatShort and formatDayHeader", () => {
  expect(formatShort("2026-07-12")).toBe("Jul 12");
  expect(formatDayHeader("2026-07-14")).toBe("Tue, Jul 14");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && npx jest lib/dates.test.ts`
Expected: FAIL — "Cannot find module './dates'".

- [ ] **Step 3: Implement lib/dates.ts**

```ts
// mobile/lib/dates.ts
// Pure calendar math over ISO "YYYY-MM-DD" strings. All arithmetic is UTC-based
// so device timezones can't shift a date; todayISO alone reads the local clock
// (the user's "today" is a local concept). ISO strings compare lexicographically.
export interface DateRange { start: string; end: string }
export type PartialRange = { start?: string; end?: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");
const toUTC = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toISO = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysISO(iso: string, n: number): string {
  return toISO(new Date(toUTC(iso).getTime() + n * DAY_MS));
}

export function inclusiveDayCount(start: string, end: string): number {
  return Math.round((toUTC(end).getTime() - toUTC(start).getTime()) / DAY_MS) + 1;
}

export function selectDay(sel: PartialRange, day: string): PartialRange {
  if (!sel.start || sel.end) return { start: day };
  if (day < sel.start) return { start: day };
  return { start: sel.start, end: day };
}

export function isInRange(day: string, sel: PartialRange): boolean {
  return !!sel.start && !!sel.end && day > sel.start && day < sel.end;
}

export function monthGrid(year: number, month0: number): (string | null)[][] {
  const startDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthLabel(year: number, month0: number): string {
  return `${MONTHS_FULL[month0]} ${year}`;
}

export function nextMonth(y: number, m0: number): [number, number] {
  return m0 === 11 ? [y + 1, 0] : [y, m0 + 1];
}

export function prevMonth(y: number, m0: number): [number, number] {
  return m0 === 0 ? [y - 1, 11] : [y, m0 - 1];
}

export function formatShort(iso: string): string {
  const d = toUTC(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatDayHeader(iso: string): string {
  const d = toUTC(iso);
  return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd mobile && npx jest lib/dates.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/dates.ts mobile/lib/dates.test.ts
git commit -m "feat(dates): pure calendar math — grid, range selection, formatting"
```

### Task 7: RangeCalendar + Segmented components

**Files:**
- Create: `mobile/components/ui/RangeCalendar.tsx`
- Create: `mobile/components/ui/Segmented.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Consumes: everything from `lib/dates` (Task 6), `Icon` (Task 2), `Text`.
- Produces: `RangeCalendar({ value: PartialRange, onChange(next: PartialRange), minDate?: string })`; `Segmented({ options: readonly {value,label}[], value, onChange })` (generic over string value). Task 8 consumes both.

- [ ] **Step 1: Create Segmented.tsx**

```tsx
// mobile/components/ui/Segmented.tsx
import { View, Pressable } from "react-native";
import { Text } from "./Text";

export function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row bg-surface-2 rounded-pill p-1">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          className={`flex-1 h-10 items-center justify-center rounded-pill ${value === o.value ? "bg-surface shadow-soft" : ""}`}
        >
          <Text variant="label" className={value === o.value ? "text-accent" : "text-ink-muted"}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Create RangeCalendar.tsx**

```tsx
// mobile/components/ui/RangeCalendar.tsx
// Airbnb-style range picker. All date logic lives (tested) in lib/dates; this
// file is only layout + selection state routed through selectDay.
import { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import {
  monthGrid, monthLabel, nextMonth, prevMonth, selectDay, isInRange,
  inclusiveDayCount, todayISO, type PartialRange,
} from "../../lib/dates";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function RangeCalendar({ value, onChange, minDate = todayISO() }: {
  value: PartialRange; onChange: (next: PartialRange) => void; minDate?: string;
}) {
  const seed = value.start ?? minDate;
  const [ym, setYm] = useState<[number, number]>([Number(seed.slice(0, 4)), Number(seed.slice(5, 7)) - 1]);
  const [y, m] = ym;
  const weeks = monthGrid(y, m);
  const today = todayISO();
  const count = value.start && value.end ? inclusiveDayCount(value.start, value.end) : 0;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between mb-1">
        <Pressable hitSlop={8} onPress={() => setYm(prevMonth(y, m))} className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center">
          <Icon name="chevron-back" size={18} />
        </Pressable>
        <Text variant="heading">{monthLabel(y, m)}</Text>
        <Pressable hitSlop={8} onPress={() => setYm(nextMonth(y, m))} className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center">
          <Icon name="chevron-forward" size={18} />
        </Pressable>
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((d, i) => (
          <View key={i} className="flex-1 items-center">
            <Text variant="label" className="text-ink-muted">{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} className="flex-row">
          {week.map((day, di) =>
            day ? (
              <DayCell key={day} day={day} value={value} minDate={minDate} today={today} onPress={() => onChange(selectDay(value, day))} />
            ) : (
              <View key={`e${wi}-${di}`} className="flex-1 h-11" />
            ),
          )}
        </View>
      ))}
      {count > 0 ? (
        <View className="self-center px-4 py-1.5 rounded-pill bg-accent-soft mt-1">
          <Text variant="label" className="text-accent">{count === 1 ? "1 day" : `${count} days`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DayCell({ day, value, minDate, today, onPress }: {
  day: string; value: PartialRange; minDate: string; today: string; onPress: () => void;
}) {
  const disabled = day < minDate;
  const isStart = day === value.start;
  const isEnd = day === value.end;
  const hasRange = !!value.start && !!value.end;
  const band = isInRange(day, value)
    ? "bg-accent-soft"
    : hasRange && isStart && !isEnd ? "bg-accent-soft rounded-l-pill"
    : hasRange && isEnd && !isStart ? "bg-accent-soft rounded-r-pill"
    : "";
  return (
    <Pressable disabled={disabled} onPress={onPress} className={`flex-1 h-11 items-center justify-center ${band}`}>
      <View className={`w-9 h-9 rounded-pill items-center justify-center ${isStart || isEnd ? "bg-accent" : day === today ? "border border-accent" : ""}`}>
        <Text variant="label" className={disabled ? "text-ink-muted opacity-40" : isStart || isEnd ? "text-ink-inverse" : "text-ink"}>
          {Number(day.slice(8, 10))}
        </Text>
      </View>
    </Pressable>
  );
}
```

- [ ] **Step 3: Export, verify, commit**

Add to `mobile/components/ui/index.ts`:

```ts
export { RangeCalendar } from "./RangeCalendar";
export { Segmented } from "./Segmented";
```

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add mobile/components/ui/RangeCalendar.tsx mobile/components/ui/Segmented.tsx mobile/components/ui/index.ts
git commit -m "feat(design): RangeCalendar range picker + Segmented control"
```

### Task 8: Onboarding rework — state machine + 8-page screen

One task because lib and screen must land together to keep `tsc` green (the screen references the state shape). TDD applies to the lib half.

**Files:**
- Modify: `mobile/lib/types.ts` (add TripType)
- Modify: `mobile/lib/api.ts` (request fields)
- Modify: `mobile/lib/onboarding.ts` (full rewrite below)
- Modify: `mobile/lib/onboarding.test.ts` (full rewrite below)
- Modify: `mobile/app/(app)/onboarding.tsx` (full rewrite below)
- Delete: `mobile/components/ui/Stepper.tsx`, `mobile/lib/holdRepeat.ts`, `mobile/lib/holdRepeat.test.ts` (if grep confirms only Stepper uses them)
- Modify: `mobile/components/ui/index.ts` (drop Stepper export)

**Interfaces:**
- Consumes: `inclusiveDayCount`, `formatShort` (Task 6); `Icon`, `OptionCard`, `ProgressBar`, `RangeCalendar`, `Segmented`, `Chip`, `PressableScale` (Tasks 2–7).
- Produces: `TripType = "round" | "oneway"` (in `lib/types.ts`); `OnboardingState` with `startDate?/endDate?/tripType` and **no `tripDays` field**; `STEPS` (8 entries), `STEP_COUNT`, `tripDaysOf(s)`, per-step `canContinue`; `GenerateRequest` with `startDate?/endDate?/tripType?`. Tasks 9–11 rely on these request fields.

- [ ] **Step 1: Rewrite the lib tests (failing)**

Full replacement of `mobile/lib/onboarding.test.ts`:

```ts
import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  prefsFromState, buildRequest, tripDaysOf, shouldOfferRegions, type OnboardingState,
} from "./onboarding";
import type { Prefs } from "./types";

const base: OnboardingState = {
  interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced",
  location: "Lisbon", startDate: "2026-07-12", endDate: "2026-07-18", tripType: "round",
};

test("INTERESTS has the fixed taxonomy", () => {
  expect(INTERESTS).toEqual(["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"]);
});

test("STEPS is the 8-page destination-first flow", () => {
  expect(STEPS).toEqual(["destination", "dates", "interests", "budget", "pace", "transport", "start", "review"]);
  expect(STEP_COUNT).toBe(8);
});

test("stateFromProfile seeds prefs, blank trip fields, round trip default", () => {
  const prefs: Prefs = { interests: ["art"], budget: "high", pace: "packed", transport: "balanced" };
  const s = stateFromProfile(prefs);
  expect(s.interests).toEqual(["art"]);
  expect(s.budget).toBe("high");
  expect(s.location).toBe("");
  expect(s.startDate).toBeUndefined();
  expect(s.tripType).toBe("round");
});

test("stateFromProfile uses defaults when null", () => {
  const s = stateFromProfile(null);
  expect(s.interests).toEqual([]);
  expect(s.budget).toBe("mid");
  expect(s.tripType).toBe("round");
});

test("tripDaysOf derives inclusive days from the range, 0 when incomplete", () => {
  expect(tripDaysOf(base)).toBe(7);
  expect(tripDaysOf({ ...base, endDate: undefined })).toBe(0);
  expect(tripDaysOf({ ...base, startDate: "2026-07-01", endDate: "2026-09-01" })).toBe(63); // no clamp
});

test("buildRequest emits dates, trip type, and derived tripDays", () => {
  const req = buildRequest(base);
  expect(req.tripDays).toBe(7);
  expect(req.startDate).toBe("2026-07-12");
  expect(req.endDate).toBe("2026-07-18");
  expect(req.tripType).toBe("round");
  expect(req.location).toBe("Lisbon");
});

test("stateFromRequest round-trips buildRequest (rehydrate in-progress trip)", () => {
  const s: OnboardingState = {
    interests: ["scenic", "food"], budget: "high", pace: "balanced", transport: "far",
    location: "Canada", destinationPlaceId: "p-canada",
    startDate: "2026-08-01", endDate: "2026-08-21", tripType: "oneway",
    startLocation: "YVR", startPlaceId: "p-yvr",
  };
  expect(stateFromRequest(buildRequest(s))).toEqual(s);
});

test("stateFromRequest defaults tripType to round when absent (old requests)", () => {
  const req = buildRequest(base);
  delete (req as Record<string, unknown>).tripType;
  expect(stateFromRequest(req).tripType).toBe("round");
});

test("canContinue: destination needs a location", () => {
  expect(canContinue(0, { ...base, location: "  " })).toBe(false);
  expect(canContinue(0, base)).toBe(true);
});

test("canContinue: dates needs a full range", () => {
  expect(canContinue(1, { ...base, endDate: undefined })).toBe(false);
  expect(canContinue(1, base)).toBe(true);
  expect(canContinue(1, { ...base, startDate: "2026-07-12", endDate: "2026-07-12" })).toBe(true); // 1-day
});

test("canContinue: interests needs at least one", () => {
  expect(canContinue(2, { ...base, interests: [] })).toBe(false);
  expect(canContinue(2, base)).toBe(true);
});

test("canContinue: budget/pace/transport/start/review always pass (defaults exist)", () => {
  for (const step of [3, 4, 5, 6, 7]) expect(canContinue(step, base)).toBe(true);
});

test("prefsFromState extracts prefs", () => {
  expect(prefsFromState(base)).toEqual({ interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced" });
});

test("shouldOfferRegions for country / admin_area_1 only", () => {
  expect(shouldOfferRegions(["country"])).toBe(true);
  expect(shouldOfferRegions(["administrative_area_level_1"])).toBe(true);
  expect(shouldOfferRegions(["locality"])).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: FAIL — `STEPS`/`tripDaysOf` not exported, state shape mismatch.

- [ ] **Step 3: Types + api fields**

In `mobile/lib/types.ts` add near the top (mirror note applies — backend gets the same type in Task 9):

```ts
export type TripType = "round" | "oneway";
```

In `mobile/lib/api.ts`:

```ts
import type { Itinerary, Prefs, TripType } from "./types";

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
  startLocation?: string;
  startPlaceId?: string;
  startDate?: string;   // ISO YYYY-MM-DD — calendar is source of truth
  endDate?: string;
  tripType?: TripType;  // default "round"
}
```

- [ ] **Step 4: Rewrite lib/onboarding.ts**

Full replacement:

```ts
// mobile/lib/onboarding.ts
import type { Prefs, TripType } from "./types";
import type { GenerateRequest } from "./api";
import { inclusiveDayCount } from "./dates";

export const INTERESTS = ["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"] as const;

// One question per page; index = step number.
export const STEPS = ["destination", "dates", "interests", "budget", "pace", "transport", "start", "review"] as const;
export const STEP_COUNT = STEPS.length;

export interface OnboardingState {
  interests: string[];
  budget: Prefs["budget"];
  pace: Prefs["pace"];
  transport: Prefs["transport"];
  location: string;
  destinationPlaceId?: string;
  startDate?: string;   // ISO YYYY-MM-DD
  endDate?: string;
  tripType: TripType;
  startLocation?: string;
  startPlaceId?: string;
}

export function stateFromProfile(prefs: Prefs | null): OnboardingState {
  return {
    interests: prefs?.interests ?? [],
    budget: prefs?.budget ?? "mid",
    pace: prefs?.pace ?? "balanced",
    transport: prefs?.transport ?? "balanced",
    location: "",
    destinationPlaceId: undefined,
    startDate: undefined,
    endDate: undefined,
    tripType: "round",
    startLocation: undefined,
    startPlaceId: undefined,
  };
}

// Rebuild onboarding state from a request the user already submitted, so an
// in-progress trip survives remounts (e.g. "Edit trip" after a failed generate).
export function stateFromRequest(req: GenerateRequest): OnboardingState {
  return {
    interests: req.prefs.interests,
    budget: req.prefs.budget,
    pace: req.prefs.pace,
    transport: req.prefs.transport,
    location: req.location,
    destinationPlaceId: req.destinationPlaceId,
    startDate: req.startDate,
    endDate: req.endDate,
    tripType: req.tripType ?? "round",
    startLocation: req.startLocation,
    startPlaceId: req.startPlaceId,
  };
}

// Days derive from the calendar range — no separate tripDays state, no clamp.
export function tripDaysOf(s: OnboardingState): number {
  return s.startDate && s.endDate ? inclusiveDayCount(s.startDate, s.endDate) : 0;
}

export function canContinue(step: number, s: OnboardingState): boolean {
  switch (STEPS[step]) {
    case "destination": return s.location.trim().length > 0;
    case "dates": return tripDaysOf(s) >= 1;
    case "interests": return s.interests.length >= 1;
    default: return true;
  }
}

export function prefsFromState(s: OnboardingState): Prefs {
  return { interests: s.interests, budget: s.budget, pace: s.pace, transport: s.transport };
}

export function buildRequest(s: OnboardingState): GenerateRequest {
  return {
    location: s.location.trim(),
    tripDays: tripDaysOf(s),
    prefs: prefsFromState(s),
    destinationPlaceId: s.destinationPlaceId,
    startDate: s.startDate,
    endDate: s.endDate,
    tripType: s.tripType,
    startLocation: s.startLocation?.trim() || undefined,
    startPlaceId: s.startPlaceId,
  };
}

const REGION_TYPES = new Set(["country", "administrative_area_level_1"]);
export function shouldOfferRegions(types: string[]): boolean {
  return types.some((t) => REGION_TYPES.has(t));
}
```

- [ ] **Step 5: Run lib tests**

Run: `cd mobile && npx jest lib/onboarding.test.ts`
Expected: PASS. (`npx tsc --noEmit` still fails — the screen is stale; fixed next step.)

- [ ] **Step 6: Rebuild the onboarding screen**

Full replacement of `mobile/app/(app)/onboarding.tsx`:

```tsx
// mobile/app/(app)/onboarding.tsx
// 8 one-question pages: destination → dates → interests → budget → pace →
// transport → start point → review. One primary CTA per page.
import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import Animated, { FadeInRight } from "react-native-reanimated";
import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  buildRequest, tripDaysOf, shouldOfferRegions, type OnboardingState,
} from "../../lib/onboarding";
import { formatShort } from "../../lib/dates";
import { getProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { useTripFlow } from "../../lib/tripFlow";
import { autocompletePlaces, suggestRegions, type Region } from "../../lib/placesClient";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { Prefs, TripType } from "../../lib/types";
import {
  Screen, Text, Button, Chip, Input, Icon, OptionCard, ProgressBar,
  RangeCalendar, Segmented, PressableScale, type IconName,
} from "../../components/ui";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string; supabaseAnonKey: string };

const INTEREST_ICONS: Record<string, IconName> = {
  scenic: "camera", food: "restaurant", history: "library", nightlife: "moon",
  outdoors: "leaf", art: "color-palette", shopping: "bag",
};
const BUDGETS: { value: Prefs["budget"]; label: string; desc: string; icon: IconName }[] = [
  { value: "low", label: "$ Budget", desc: "Street food, free sights, budget stays", icon: "wallet" },
  { value: "mid", label: "$$ Comfortable", desc: "Casual eats, mix of sights, mid-range hotels", icon: "card" },
  { value: "high", label: "$$$ Premium", desc: "Fine dining, splurges, upscale stays", icon: "diamond" },
];
const PACES: { value: Prefs["pace"]; label: string; desc: string; icon: IconName }[] = [
  { value: "relaxed", label: "Relaxed", desc: "2–3 stops a day, long lunches", icon: "cafe" },
  { value: "balanced", label: "Balanced", desc: "4–5 stops a day", icon: "walk" },
  { value: "packed", label: "Packed", desc: "6–8 stops a day, see it all", icon: "flash" },
];
const TRANSPORTS: { value: Prefs["transport"]; label: string; desc: string; icon: IconName }[] = [
  { value: "compact", label: "Compact", desc: "Stay close. Walkable cluster, minimal transit.", icon: "footsteps" },
  { value: "balanced", label: "Balanced", desc: "City + nearby. Some driving.", icon: "car" },
  { value: "far", label: "Far-ranging", desc: "Cover a wide region. Longer legs OK.", icon: "airplane" },
];
const TRIP_TYPES = [
  { value: "round" as TripType, label: "Round trip" },
  { value: "oneway" as TripType, label: "One way" },
] as const;
const PROMPTS: Record<(typeof STEPS)[number], { title: string; sub?: string }> = {
  destination: { title: "Where to?", sub: "A city, a region, or a whole country." },
  dates: { title: "When?", sub: "Pick your start and end days." },
  interests: { title: "What do you love?", sub: "Pick at least one." },
  budget: { title: "What's the budget?" },
  pace: { title: "What's your pace?" },
  transport: { title: "How far will you roam?" },
  start: { title: "Starting point?", sub: "Optional — home, airport, or hotel. Routes anchor here." },
  review: { title: "Ready?", sub: "Tap any row to change it." },
};

export default function Onboarding() {
  const router = useRouter();
  const { session } = useAuth();
  const tripFlow = useTripFlow();
  const [step, setStep] = useState(0);
  // Rehydrate an in-progress trip across remounts (e.g. "Edit trip" after a failed
  // generate does router.replace, which remounts this screen). lastRequest/pendingRequest
  // live in TripFlowProvider (above the Stack), so they survive the remount.
  const seedRequest = tripFlow.lastRequest ?? tripFlow.pendingRequest;
  const [state, setState] = useState<OnboardingState>(
    seedRequest ? stateFromRequest(seedRequest) : stateFromProfile(null),
  );
  const [suggestions, setSuggestions] = useState<{ text: string; placeId: string; types: string[] }[]>([]);
  const debouncedLocation = useDebouncedValue(state.location, 300);
  const [regions, setRegions] = useState<Region[]>([]);
  const [startSuggestions, setStartSuggestions] = useState<{ text: string; placeId: string; types: string[] }[]>([]);
  const debouncedStart = useDebouncedValue(state.startLocation ?? "", 300);

  useEffect(() => {
    if (seedRequest) return; // editing an existing trip — don't clobber it with profile defaults
    getProfile(supabase).then((prefs) => setState(stateFromProfile(prefs))).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    autocompletePlaces({ query: debouncedLocation, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
      .then((s) => { if (active) setSuggestions(s); })
      .catch(() => { if (active) setSuggestions([]); });
    return () => { active = false; };
  }, [debouncedLocation]);

  useEffect(() => {
    let active = true;
    autocompletePlaces({ query: debouncedStart, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey, addresses: true })
      .then((s) => { if (active) setStartSuggestions(s); })
      .catch(() => { if (active) setStartSuggestions([]); });
    return () => { active = false; };
  }, [debouncedStart]);

  function toggleInterest(i: string) {
    setState((s) => ({
      ...s,
      interests: s.interests.includes(i) ? s.interests.filter((x) => x !== i) : [...s.interests, i],
    }));
  }

  function onGenerate() {
    const req = buildRequest(state);
    if (session) {
      tripFlow.generate(req);
      router.push("/generating");
    } else {
      tripFlow.prepare(req);
      router.push("/(auth)/sign-in");
    }
  }

  const page = STEPS[step];
  const prompt = PROMPTS[page];
  const days = tripDaysOf(state);

  const reviewRows: { label: string; value: string; step: number }[] = [
    { label: "Destination", value: state.location, step: 0 },
    {
      label: "Dates",
      value: state.startDate && state.endDate
        ? `${formatShort(state.startDate)} → ${formatShort(state.endDate)} · ${days} ${days === 1 ? "day" : "days"} · ${state.tripType === "round" ? "Round trip" : "One way"}`
        : "",
      step: 1,
    },
    { label: "Interests", value: state.interests.join(", "), step: 2 },
    { label: "Budget", value: BUDGETS.find((b) => b.value === state.budget)!.label, step: 3 },
    { label: "Pace", value: PACES.find((p) => p.value === state.pace)!.label, step: 4 },
    { label: "Getting around", value: TRANSPORTS.find((t) => t.value === state.transport)!.label, step: 5 },
    ...(state.startLocation ? [{ label: "Start", value: state.startLocation, step: 6 }] : []),
  ];

  return (
    <Screen scroll>
      <View className="flex-row items-center gap-4 mb-2">
        <Pressable
          onPress={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          hitSlop={8}
          className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center"
        >
          <Icon name="chevron-back" size={18} />
        </Pressable>
        <ProgressBar progress={(step + 1) / STEP_COUNT} className="flex-1" />
      </View>

      <Animated.View key={step} entering={FadeInRight.springify().damping(18)} className="gap-5 flex-1">
        <View className="gap-1">
          <Text variant="display">{prompt.title}</Text>
          {prompt.sub ? <Text variant="body" className="text-ink-muted">{prompt.sub}</Text> : null}
        </View>

        {page === "destination" ? (
          <View className="gap-3">
            <Input
              placeholder="Try Lisbon, Tuscany, or Japan"
              value={state.location}
              onChangeText={(t) => { setState((s) => ({ ...s, location: t, destinationPlaceId: undefined })); setRegions([]); }}
              autoCorrect={false}
            />
            {suggestions.length > 0 && state.location.trim().length >= 2 && !state.destinationPlaceId ? (
              <View className="gap-2">
                {suggestions.map((sug) => (
                  <PressableScale
                    key={sug.placeId}
                    onPress={() => {
                      setState((s) => ({ ...s, location: sug.text, destinationPlaceId: sug.placeId }));
                      setSuggestions([]);
                      setRegions([]);
                      if (shouldOfferRegions(sug.types)) {
                        suggestRegions({ placeId: sug.placeId, baseUrl: extra.supabaseUrl, anonKey: extra.supabaseAnonKey })
                          .then(setRegions).catch(() => setRegions([]));
                      }
                    }}
                    className="flex-row items-center gap-3 p-4 rounded-lg bg-surface border border-border"
                  >
                    <Icon name="location" size={18} color="#E11D48" />
                    <Text variant="body" className="flex-1">{sug.text}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
            {regions.length > 0 ? (
              <View className="gap-2">
                <Text variant="label">Big place — narrow it down?</Text>
                {regions.map((r) => (
                  <PressableScale
                    key={r.placeId}
                    onPress={() => {
                      // Region carries a real placeId — set it so the destination is
                      // geocoded (no global autocomplete on a bare label, real bias center).
                      setState((s) => ({ ...s, location: r.label, destinationPlaceId: r.placeId }));
                      setSuggestions([]);
                      setRegions([]);
                    }}
                    className="p-4 rounded-lg bg-surface border border-border gap-0.5"
                  >
                    <Text variant="body">{r.label}</Text>
                    <Text variant="caption">{r.hook}</Text>
                  </PressableScale>
                ))}
                <Pressable onPress={() => setRegions([])} className="p-2">
                  <Text variant="caption" className="text-ink-muted">Skip — search the whole area</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {page === "dates" ? (
          <View className="gap-4">
            <Segmented options={TRIP_TYPES} value={state.tripType} onChange={(t) => setState((s) => ({ ...s, tripType: t }))} />
            <RangeCalendar
              value={{ start: state.startDate, end: state.endDate }}
              onChange={(r) => setState((s) => ({ ...s, startDate: r.start, endDate: r.end }))}
            />
            {state.startDate && state.endDate ? (
              <Text variant="body" className="text-center text-ink-muted">
                {formatShort(state.startDate)} → {formatShort(state.endDate)} · {days} {days === 1 ? "day" : "days"}
              </Text>
            ) : (
              <Text variant="caption" className="text-center">Tap a start day, then an end day</Text>
            )}
          </View>
        ) : null}

        {page === "interests" ? (
          <View className="flex-row flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip
                key={i}
                label={i}
                selected={state.interests.includes(i)}
                onPress={() => toggleInterest(i)}
                icon={<Icon name={INTEREST_ICONS[i]} size={16} color={state.interests.includes(i) ? "#E11D48" : "#6B5560"} />}
              />
            ))}
          </View>
        ) : null}

        {page === "budget" ? (
          <View className="gap-3">
            {BUDGETS.map((b) => (
              <OptionCard
                key={b.value}
                icon={<Icon name={b.icon} size={20} color={state.budget === b.value ? "#E11D48" : "#6B5560"} />}
                title={b.label}
                description={b.desc}
                selected={state.budget === b.value}
                onPress={() => setState((s) => ({ ...s, budget: b.value }))}
              />
            ))}
          </View>
        ) : null}

        {page === "pace" ? (
          <View className="gap-3">
            {PACES.map((p) => (
              <OptionCard
                key={p.value}
                icon={<Icon name={p.icon} size={20} color={state.pace === p.value ? "#E11D48" : "#6B5560"} />}
                title={p.label}
                description={p.desc}
                selected={state.pace === p.value}
                onPress={() => setState((s) => ({ ...s, pace: p.value }))}
              />
            ))}
          </View>
        ) : null}

        {page === "transport" ? (
          <View className="gap-3">
            {TRANSPORTS.map((t) => (
              <OptionCard
                key={t.value}
                icon={<Icon name={t.icon} size={20} color={state.transport === t.value ? "#E11D48" : "#6B5560"} />}
                title={t.label}
                description={t.desc}
                selected={state.transport === t.value}
                onPress={() => setState((s) => ({ ...s, transport: t.value }))}
              />
            ))}
          </View>
        ) : null}

        {page === "start" ? (
          <View className="gap-3">
            <Input
              placeholder="Home, airport, or hotel"
              value={state.startLocation ?? ""}
              onChangeText={(t) => setState((s) => ({ ...s, startLocation: t, startPlaceId: undefined }))}
              autoCorrect={false}
            />
            {startSuggestions.length > 0 && (state.startLocation ?? "").trim().length >= 2 && !state.startPlaceId ? (
              <View className="gap-2">
                {startSuggestions.map((sug) => (
                  <PressableScale
                    key={sug.placeId}
                    onPress={() => { setState((s) => ({ ...s, startLocation: sug.text, startPlaceId: sug.placeId })); setStartSuggestions([]); }}
                    className="flex-row items-center gap-3 p-4 rounded-lg bg-surface border border-border"
                  >
                    <Icon name="navigate" size={18} color="#E11D48" />
                    <Text variant="body" className="flex-1">{sug.text}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {page === "review" ? (
          <View className="gap-2">
            {reviewRows.map((r) => (
              <PressableScale
                key={r.label}
                onPress={() => setStep(r.step)}
                className="flex-row items-center justify-between p-4 rounded-lg bg-surface border border-border"
              >
                <View className="flex-1 gap-0.5">
                  <Text variant="label" className="text-ink-muted">{r.label}</Text>
                  <Text variant="body">{r.value}</Text>
                </View>
                <Icon name="chevron-forward" size={16} color="#6B5560" />
              </PressableScale>
            ))}
          </View>
        ) : null}
      </Animated.View>

      <View className="gap-2 mt-6">
        {page === "start" ? (
          <Button
            title="Skip"
            variant="ghost"
            onPress={() => { setState((s) => ({ ...s, startLocation: undefined, startPlaceId: undefined })); setStep((s) => s + 1); }}
          />
        ) : null}
        {page === "review" ? (
          <Button title="Generate my trip" size="lg" variant="gradient" onPress={onGenerate} />
        ) : (
          <Button title="Continue" size="lg" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} />
        )}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 7: Remove the Stepper (calendar replaces it)**

Run: `grep -rn "Stepper\|holdRepeat" mobile/app mobile/components mobile/lib --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected after the rewrite: hits only in `ui/Stepper.tsx`, `ui/index.ts`, `lib/holdRepeat.ts(.test)`. If any other screen imports them, leave them and skip deletion. Otherwise:

```bash
git rm mobile/components/ui/Stepper.tsx mobile/lib/holdRepeat.ts mobile/lib/holdRepeat.test.ts
```

and delete the `export { Stepper } from "./Stepper";` line from `mobile/components/ui/index.ts`.

- [ ] **Step 8: Verify everything**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS — all suites, including rewritten onboarding tests.

- [ ] **Step 9: Commit**

```bash
git add -A mobile
git commit -m "feat(onboarding): 8-page flow — destination-first, range calendar, trip type, no day clamp"
```

### Task 9: Backend request fields + abuse guard (TDD)

**Files:**
- Modify: `supabase/_shared/types.ts` (add TripType — mirror of mobile change in Task 8)
- Modify: `supabase/functions/generate-itinerary/handler.ts` (GenerateRequest fields + guard)
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Produces: `TripType` in `supabase/_shared/types.ts`; `GenerateRequest` gains `startDate?: string; endDate?: string; tripType?: TripType`. Guard: `tripDays > 365` → 400. Tasks 10 and 14 build on these fields.

- [ ] **Step 1: Write failing tests**

Append to `supabase/functions/generate-itinerary/handler_test.ts`:

```ts
Deno.test("rejects tripDays > 365 (abuse guard, not a UX clamp)", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 366, prefs }, "u1", baseDeps());
  assertEquals(r.status, 400);
});

Deno.test("accepts startDate/endDate/tripType fields", async () => {
  const r = await handleGenerate(
    { location: "X", tripDays: 1, prefs, startDate: "2026-07-12", endDate: "2026-07-12", tripType: "oneway" },
    "u1",
    baseDeps(),
  );
  assertEquals(r.status, 200);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd supabase && deno test functions/generate-itinerary/handler_test.ts`
Expected: FAIL — 366-day request returns 200 (no guard yet); the field test may already pass structurally but TS type-check on the literal fails (`tripType` not in GenerateRequest).

- [ ] **Step 3: Implement**

In `supabase/_shared/types.ts` add:

```ts
export type TripType = "round" | "oneway";
```

In `supabase/functions/generate-itinerary/handler.ts`, extend the interface and the guard:

```ts
import type { Itinerary, Poi, Prefs, Stop, TripType } from "../../_shared/types.ts";

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
  startLocation?: string;
  startPlaceId?: string;
  startDate?: string;   // ISO YYYY-MM-DD
  endDate?: string;
  tripType?: TripType;  // default "round"
}
```

and replace the tripDays guard:

```ts
  if (!body || body.tripDays < 1) {
    return { status: 400, body: { error: "tripDays must be >= 1" } };
  }
  if (body.tripDays > 365) {
    return { status: 400, body: { error: "tripDays must be <= 365" } };
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd supabase && deno test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/types.ts supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(api): startDate/endDate/tripType on generate request + 365-day guard"
```

### Task 10: Migration 0005 + persist dates on trips

**Files:**
- Create: `supabase/migrations/0005_trip_dates.sql`
- Modify: `supabase/functions/generate-itinerary/index.ts` (saveTrip insert)

**Interfaces:**
- Produces: `trips.start_date date`, `trips.end_date date`, `trips.trip_type text` (nullable; old rows unaffected). Task 11 reads them.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0005_trip_dates.sql
-- Real trip dates + trip type. Nullable: rows generated before this feature
-- have neither, and the mobile app falls back to "Day N" headers.
alter table public.trips
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists trip_type text;
```

- [ ] **Step 2: Persist on insert**

In `supabase/functions/generate-itinerary/index.ts`, extend the `saveTrip` insert:

```ts
    saveTrip: async ({ userId: uid, req: r, itinerary }) => {
      const { data, error } = await admin
        .from("trips")
        .insert({
          user_id: uid,
          location: r.location,
          prefs: r.prefs,
          itinerary,
          start_date: r.startDate ?? null,
          end_date: r.endDate ?? null,
          trip_type: r.tripType ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
```

- [ ] **Step 3: Verify + commit**

Run: `cd supabase && deno test && deno check functions/generate-itinerary/index.ts`
Expected: PASS / no type errors.

Note: applying the migration to the live project (`supabase db push` or dashboard SQL) happens at deploy time — Task 19 checklist; ask the user before touching the live DB.

```bash
git add supabase/migrations/0005_trip_dates.sql supabase/functions/generate-itinerary/index.ts
git commit -m "feat(db): trips start_date/end_date/trip_type (migration 0005) + persist on generate"
```

### Task 11: Mobile — dated trips (trips.ts, TripCard, itinerary headers)

**Files:**
- Modify: `mobile/lib/trips.ts`
- Modify: `mobile/lib/trips.test.ts` (extend — read existing tests first, keep their style)
- Modify: `mobile/components/ui/TripCard.tsx`
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: `formatShort`, `formatDayHeader`, `addDaysISO` (Task 6); `trips` columns (Task 10).
- Produces: `TripSummary` gains `startDate?: string; endDate?: string; tripType?: "round" | "oneway"`. Day headers: `"Tue, Jul 14 · Day 1"` with `"Day 1"` fallback.

- [ ] **Step 1: Write failing test**

Add to `mobile/lib/trips.test.ts` (adapt to the existing fake-client pattern in that file — read it first; the assertion is what matters):

```ts
test("rowToTrip maps date columns when present and omits them when null", () => {
  // exercise via listTrips with a fake client returning one row with dates and one without
  // assert: trip.startDate === "2026-07-12", trip.endDate === "2026-07-18", trip.tripType === "round"
  // assert: the null-date row yields startDate/endDate/tripType === undefined
});
```

Run: `cd mobile && npx jest lib/trips.test.ts` — expect FAIL (fields missing).

- [ ] **Step 2: Implement trips.ts**

Full replacement of the row-mapping section in `mobile/lib/trips.ts`:

```ts
export interface TripSummary {
  id: string;
  location: string;
  itinerary: Itinerary;
  createdAt: string;
  startDate?: string;   // ISO YYYY-MM-DD; absent on pre-dates trips
  endDate?: string;
  tripType?: "round" | "oneway";
}

interface TripRow {
  id: string;
  location: string;
  itinerary: Itinerary;
  created_at: string;
  start_date: string | null;
  end_date: string | null;
  trip_type: string | null;
}

function rowToTrip(row: TripRow): TripSummary {
  return {
    id: row.id,
    location: row.location,
    itinerary: row.itinerary,
    createdAt: row.created_at,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    tripType: row.trip_type === "round" || row.trip_type === "oneway" ? row.trip_type : undefined,
  };
}
```

and change both selects to:

```ts
    .select("id, location, itinerary, created_at, start_date, end_date, trip_type")
```

- [ ] **Step 3: TripCard date line**

In `mobile/components/ui/TripCard.tsx` replace the caption line:

```tsx
import { formatShort } from "../../lib/dates";
// ...
      <Text variant="caption">
        {trip.startDate && trip.endDate
          ? `${formatShort(trip.startDate)} → ${formatShort(trip.endDate)} · ${days === 1 ? "1 day" : `${days} days`}`
          : days === 1 ? "1-day trip" : `${days}-day trip`}
      </Text>
```

- [ ] **Step 4: Dated itinerary headers**

In `mobile/app/(app)/itinerary.tsx`:

```tsx
import { formatDayHeader, addDaysISO } from "../../lib/dates";
```

The generated-flow path has no DB row, so the start date comes from the request:

```tsx
  const startDate = tripId ? tripQuery.data?.startDate : flow.lastRequest?.startDate;
```

and change the sections mapping:

```tsx
  const sections = days.map((d) => ({
    title: startDate ? `${formatDayHeader(addDaysISO(startDate, d.day - 1))} · Day ${d.day}` : `Day ${d.day}`,
    lodging: d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined,
    data: numberStops(d.stops),
  }));
```

(If `flow.lastRequest` is not exposed on the tripFlow context value, check `mobile/lib/tripFlow.tsx` — `generating.tsx` already reads `lastRequest` from `useTripFlow()`, so it is.)

- [ ] **Step 5: Verify + commit**

Run: `cd mobile && npx tsc --noEmit && npx jest`
Expected: PASS.

```bash
git add mobile/lib/trips.ts mobile/lib/trips.test.ts mobile/components/ui/TripCard.tsx "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(trips): surface real dates — trip summaries, cards, dated day headers"
```

### Task 12: legs.ts — leg splitting + sub-area centers (TDD)

**Files:**
- Create: `supabase/_shared/legs.ts`
- Test: `supabase/_shared/legs_test.ts`

**Interfaces:**
- Consumes: `Viewport` from `_shared/area.ts`, `TripType` from `_shared/types.ts`.
- Produces (Task 14 consumes exactly these):

```ts
export const MAX_LEG_DAYS = 7;
export function planLegs(tripDays: number, maxLegDays?: number): number[];
export function legCenters(opts: { center: LatLng; viewport: Viewport; legs: number; tripType: TripType }): LatLng[];
export function partitionByNearest<T extends { lat: number; lng: number }>(items: T[], centers: LatLng[]): T[][];
export function splitRoundRobin<T>(items: T[], k: number): T[][];
```

- [ ] **Step 1: Write failing tests**

```ts
// supabase/_shared/legs_test.ts
import { assertEquals, assert } from "jsr:@std/assert";
import { planLegs, legCenters, partitionByNearest, splitRoundRobin, MAX_LEG_DAYS } from "./legs.ts";

Deno.test("planLegs: short trips are one leg", () => {
  assertEquals(planLegs(1), [1]);
  assertEquals(planLegs(7), [7]);
});

Deno.test("planLegs: long trips split into balanced legs of <= MAX_LEG_DAYS", () => {
  assertEquals(planLegs(8), [4, 4]);
  assertEquals(planLegs(16), [6, 5, 5]);
  assertEquals(planLegs(30), [6, 6, 6, 6, 6]);
  const legs = planLegs(365);
  assertEquals(legs.reduce((a, b) => a + b, 0), 365);
  assert(legs.every((l) => l >= 1 && l <= MAX_LEG_DAYS));
});

const vp = { low: { lat: 0, lng: 0 }, high: { lat: 10, lng: 10 } };

Deno.test("legCenters oneway: progresses across the viewport low → high", () => {
  const c = legCenters({ center: { lat: 5, lng: 5 }, viewport: vp, legs: 3, tripType: "oneway" });
  assertEquals(c, [{ lat: 0, lng: 0 }, { lat: 5, lng: 5 }, { lat: 10, lng: 10 }]);
});

Deno.test("legCenters round: goes out and comes back (last leg near the first)", () => {
  const c = legCenters({ center: { lat: 5, lng: 5 }, viewport: vp, legs: 3, tripType: "round" });
  assertEquals(c[0], { lat: 0, lng: 0 });
  assertEquals(c[1], { lat: 10, lng: 10 });   // farthest mid-trip
  assertEquals(c[2], { lat: 0, lng: 0 });     // back near the start
});

Deno.test("legCenters: no viewport → all legs at the region center", () => {
  const c = legCenters({ center: { lat: 5, lng: 5 }, viewport: null, legs: 3, tripType: "oneway" });
  assertEquals(c, [{ lat: 5, lng: 5 }, { lat: 5, lng: 5 }, { lat: 5, lng: 5 }]);
});

Deno.test("partitionByNearest: disjoint pools by nearest center", () => {
  const centers = [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }];
  const items = [
    { id: "a", lat: 1, lng: 1 }, { id: "b", lat: 9, lng: 9 }, { id: "c", lat: 0.5, lng: 0 },
  ];
  const parts = partitionByNearest(items, centers);
  assertEquals(parts[0].map((i) => i.id), ["a", "c"]);
  assertEquals(parts[1].map((i) => i.id), ["b"]);
});

Deno.test("splitRoundRobin deals items evenly", () => {
  assertEquals(splitRoundRobin([1, 2, 3, 4, 5], 2), [[1, 3, 5], [2, 4]]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd supabase && deno test _shared/legs_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement legs.ts**

```ts
// supabase/_shared/legs.ts
//
// Long trips can't be curated in one LLM call: the POI pool (~20 per Places
// fetch) can't fill 30+ unique-place days, and one giant prompt drifts. So
// trips longer than MAX_LEG_DAYS split into consecutive geographic legs —
// each leg gets its own sub-area, POI fetch, and curation call (in parallel),
// then the days concatenate. Grounding and validation stay per-leg.
import type { Viewport } from "./area.ts";
import type { TripType } from "./types.ts";
import { haversineKm } from "./area.ts";

type LatLng = { lat: number; lng: number };

export const MAX_LEG_DAYS = 7;

// Balanced split: k = ceil(days/max) legs, sizes differ by at most 1.
export function planLegs(tripDays: number, maxLegDays = MAX_LEG_DAYS): number[] {
  const k = Math.ceil(tripDays / maxLegDays);
  const base = Math.floor(tripDays / k);
  const rem = tripDays % k;
  return Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
}

// Leg centers along the viewport diagonal. oneway: low → high. round: out and
// back (triangle wave) so the final leg lands near where the first began.
// ponytail: the diagonal is a crude axis — upgrade to orienting from the
// traveler's start location if long-trip routes feel backwards.
export function legCenters(opts: { center: LatLng; viewport: Viewport; legs: number; tripType: TripType }): LatLng[] {
  const { center, viewport, legs, tripType } = opts;
  if (legs === 1 || !viewport) return Array.from({ length: legs }, () => ({ ...center }));
  const { low, high } = viewport;
  const out: LatLng[] = [];
  for (let i = 0; i < legs; i++) {
    const t = i / (legs - 1);                                        // 0..1
    const u = tripType === "round" ? 1 - Math.abs(2 * t - 1) : t;    // round: 0→1→0
    out.push({ lat: low.lat + (high.lat - low.lat) * u, lng: low.lng + (high.lng - low.lng) * u });
  }
  return out;
}

// Disjoint pools: each item goes to its nearest leg center, so parallel
// curations can never pick the same place twice.
export function partitionByNearest<T extends { lat: number; lng: number }>(items: T[], centers: LatLng[]): T[][] {
  const parts: T[][] = centers.map(() => []);
  for (const item of items) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < centers.length; i++) {
      const d = haversineKm(centers[i], { lat: item.lat, lng: item.lng });
      if (d < bestD) { bestD = d; best = i; }
    }
    parts[best].push(item);
  }
  return parts;
}

// Fallback partition when there is no geometry to partition by (free-typed
// destination, center {0,0}): deal the pool out evenly.
export function splitRoundRobin<T>(items: T[], k: number): T[][] {
  const parts: T[][] = Array.from({ length: k }, () => []);
  items.forEach((item, i) => parts[i % k].push(item));
  return parts;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd supabase && deno test _shared/legs_test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/legs.ts supabase/_shared/legs_test.ts
git commit -m "feat(legs): leg splitting + sub-area centers for long-trip generation"
```

### Task 13: cluster.ts — trip-type day ordering (TDD)

**Files:**
- Modify: `supabase/_shared/cluster.ts`
- Test: `supabase/_shared/cluster_test.ts` (append)

**Interfaces:**
- Produces: `assignDays` gains optional `tripType?: "round" | "oneway"`; new export `orderGroupsForTripType(groups, coords, start, tripType?)`. Task 14 passes `tripType` for single-leg trips.

- [ ] **Step 1: Write failing tests**

Append to `supabase/_shared/cluster_test.ts` (match the file's existing import style):

```ts
// Three clusters at increasing distance from start (0,0): near A, mid B, far C.
const tripTypeCoords: Record<string, { lat: number; lng: number }> = {
  A1: { lat: 0.1, lng: 0.1 }, A2: { lat: 0.12, lng: 0.1 },
  B1: { lat: 1.0, lng: 1.0 }, B2: { lat: 1.02, lng: 1.0 },
  C1: { lat: 2.0, lng: 2.0 }, C2: { lat: 2.02, lng: 2.0 },
};
const tripTypeStops = Object.keys(tripTypeCoords).map((placeId) => ({ placeId }));
const start = { lat: 0, lng: 0 };

Deno.test("assignDays oneway: days progress away from the start", () => {
  const days = assignDays({ stops: tripTypeStops, coords: tripTypeCoords, tripDays: 3, maxDriveKm: 1000, start, tripType: "oneway" });
  assertEquals(days.map((d) => d[0].placeId[0]), ["A", "B", "C"]);
});

Deno.test("assignDays round: first and last days are the two nearest clusters", () => {
  const days = assignDays({ stops: tripTypeStops, coords: tripTypeCoords, tripDays: 3, maxDriveKm: 1000, start, tripType: "round" });
  assertEquals(days[0][0].placeId[0], "A");   // out from the start…
  assertEquals(days[1][0].placeId[0], "C");   // …far in the middle…
  assertEquals(days[2][0].placeId[0], "B");   // …back near the start
});

Deno.test("assignDays without tripType keeps legacy ordering (no reorder)", () => {
  const legacy = assignDays({ stops: tripTypeStops, coords: tripTypeCoords, tripDays: 3, maxDriveKm: 1000, start });
  assertEquals(legacy.map((d) => d[0].placeId[0]), ["A", "B", "C"]); // nn-chain from start already ascends
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd supabase && deno test _shared/cluster_test.ts`
Expected: FAIL — `tripType` not a known option (TS) / round ordering wrong.

- [ ] **Step 3: Implement**

In `supabase/_shared/cluster.ts` add after `enforceBudget`:

```ts
function groupCentroid<T extends { placeId: string }>(g: T[], coords: Record<string, LatLng>): LatLng {
  if (!g.length) return { lat: 0, lng: 0 };
  const sum = g.reduce((a, x) => {
    const c = coordOf(coords, x.placeId);
    return { lat: a.lat + c.lat, lng: a.lng + c.lng };
  }, { lat: 0, lng: 0 });
  return { lat: sum.lat / g.length, lng: sum.lng / g.length };
}

// Day ordering by trip type. oneway: days ascend by distance from the start —
// the route drifts across the region. round: nearest day first, second-nearest
// last, the rest outbound in between — the trip ends back near where it began.
export function orderGroupsForTripType<T extends { placeId: string }>(
  groups: T[][],
  coords: Record<string, LatLng>,
  start: LatLng | null,
  tripType?: "round" | "oneway",
): T[][] {
  if (!tripType || groups.length < 3) return groups;
  const ref = start ?? groupCentroid(groups[0], coords);
  const sorted = groups
    .map((g) => ({ g, d: haversineKm(ref, groupCentroid(g, coords)) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.g);
  if (tripType === "oneway") return sorted;
  return [sorted[0], ...sorted.slice(2), sorted[1]];
}
```

and change `assignDays`:

```ts
export function assignDays<T extends { placeId: string }>(opts: {
  stops: T[];
  coords: Record<string, LatLng>;
  tripDays: number;
  maxDriveKm: number;       // per-day road-distance budget
  start?: LatLng | null;    // anchor day 1 nearest the traveler's start
  tripType?: "round" | "oneway";
  roadFactor?: number;
}): T[][] {
  const { stops, coords, tripDays, maxDriveKm } = opts;
  const roadFactor = opts.roadFactor ?? DEFAULT_ROAD_FACTOR;
  const seed = opts.start ?? (stops.length ? coordOf(coords, stops[0].placeId) : { lat: 0, lng: 0 });
  const ordered = nnChain(stops, coords, seed);
  const groups = splitBalanced(ordered, Math.max(1, tripDays)).map((g) => enforceBudget(g, coords, maxDriveKm, roadFactor));
  return orderGroupsForTripType(groups, coords, opts.start ?? null, opts.tripType);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd supabase && deno test`
Expected: PASS (all suites — existing cluster tests unaffected because `tripType` is optional).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/cluster.ts supabase/_shared/cluster_test.ts
git commit -m "feat(cluster): round/oneway day ordering — round trips end back near the start"
```

### Task 14: Handler — leg-chunked generation + trip-type routing (TDD)

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts`
- Test: `supabase/functions/generate-itinerary/handler_test.ts` (append)

**Interfaces:**
- Consumes: `planLegs`, `legCenters`, `partitionByNearest`, `splitRoundRobin` (Task 12); `assignDays` with `tripType` (Task 13).
- Produces: multi-leg pipeline — per-leg attraction fetch (leg-local `locationBias`), disjoint per-leg pools, parallel `deps.curate` per leg, continuous day numbering, per-leg geographic day assignment. One-way trips no longer anchor the final day at the start.

- [ ] **Step 1: Write failing tests**

Append to `handler_test.ts`:

```ts
function legDeps(kmPerLeg: { curateCalls: { tripDays: number; poolIds: string[] }[] }) {
  // 16-day trip → legs [6,5,5]; give each leg-local fetch a distinct pool.
  let fetchCall = 0;
  return baseDeps({
    resolveDestination: () => Promise.resolve({
      center: { lat: 5, lng: 5 },
      viewport: { low: { lat: 0, lng: 0 }, high: { lat: 10, lng: 10 } },
    }),
    fetchPois: (o: any) => {
      if (o.kind !== "attraction") return Promise.resolve([]);
      const i = fetchCall++;
      const c = o.locationBias?.center ?? { lat: 5, lng: 5 };
      // 8 pois per leg, clustered at the leg's bias center
      return Promise.resolve(Array.from({ length: 8 }, (_, j) => ({
        placeId: `L${i}-P${j}`, name: `P${j}`, kind: "attraction" as const,
        lat: c.lat + j * 0.001, lng: c.lng,
      })));
    },
    curate: ({ pois, tripDays }: any) => {
      kmPerLeg.curateCalls.push({ tripDays, poolIds: pois.map((p: Poi) => p.placeId) });
      // one stop per day from this leg's pool
      return Promise.resolve({
        days: Array.from({ length: tripDays }, (_, d) => ({
          day: d + 1, lodgingPlaceId: null,
          stops: [{ placeId: pois[d % pois.length].placeId, name: "s", blurb: "x" }],
        })),
      });
    },
  });
}

Deno.test("long trip: splits into legs, curates per leg in parallel pools, renumbers days 1..N", async () => {
  const seen = { curateCalls: [] as { tripDays: number; poolIds: string[] }[] };
  const r = await handleGenerate(
    { location: "X", tripDays: 16, destinationPlaceId: "D", tripType: "oneway", prefs },
    "u1", legDeps(seen),
  );
  assertEquals(r.status, 200);
  assertEquals(seen.curateCalls.map((c) => c.tripDays).sort(), [5, 5, 6]);
  // pools are disjoint
  const all = seen.curateCalls.flatMap((c) => c.poolIds);
  assertEquals(new Set(all).size, all.length);
  const days = (r.body as { itinerary: Itinerary }).itinerary.days;
  assertEquals(days.length, 16);
  assertEquals(days.map((d) => d.day), Array.from({ length: 16 }, (_, i) => i + 1));
});

Deno.test("oneway: final day does NOT anchor back at the start location", async () => {
  const anchors: { lat: number; lng: number }[] = [];
  const threeDay: Itinerary = { days: [1, 2, 3].map((d) => ({
    day: d, lodgingPlaceId: null, stops: [{ placeId: `A${d}`, name: `A${d}`, blurb: "x" }],
  })) };
  const deps = baseDeps({
    resolveDestination: ({ placeId }) => Promise.resolve(
      placeId === "START" ? { center: { lat: 5, lng: 5 }, viewport: null } : { center: { lat: 1, lng: 1 }, viewport: null }),
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : [1, 2, 3].map((d) => (
      { placeId: `A${d}`, name: `A${d}`, kind: "attraction" as const, lat: 0, lng: 0 }))),
    curate: () => Promise.resolve(threeDay),
    orderStops: ({ stops, anchor }) => { anchors.push(anchor); return Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 0 })), polyline: undefined }); },
  });
  await handleGenerate({ location: "X", tripDays: 3, destinationPlaceId: "DEST", startPlaceId: "START", tripType: "oneway", prefs }, "u1", deps);
  assertEquals(anchors[0], { lat: 5, lng: 5 });   // day 1 still starts at start
  assertEquals(anchors[2], { lat: 9, lng: 9 });   // last day anchors at lodging, not start
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd supabase && deno test functions/generate-itinerary/handler_test.ts`
Expected: FAIL — single curate call with tripDays 16; last-day anchor is the start.

- [ ] **Step 3: Rework the handler pipeline**

In `supabase/functions/generate-itinerary/handler.ts`, replace the section from `const wantsFood = ...` through the `assignDays` re-clustering block (currently ending at `itinerary = { days: grouped.map(...) };`) with:

```ts
  const tripType: TripType = body.tripType ?? "round";
  const legSizes = planLegs(body.tripDays);
  const multiLeg = legSizes.length > 1;
  const centers = legCenters({ center: dest.center, viewport: dest.viewport, legs: legSizes.length, tripType });
  // ponytail: leg bias radius = region radius / legs, floor 10km — tune against real long trips.
  const legRadiusKm = Math.max(radiusKm / legSizes.length, 10);

  const wantsFood = body.prefs.interests.includes("food");
  // Food and lodging are enrichments, not the trip itself — a flaky Places call
  // for either should degrade (empty list) rather than crash the whole request
  // into the runtime's 546. Only attractions are essential; if they fail the
  // request throws and the index wrapper turns it into a readable 500.
  // ponytail: food/lodging stay whole-region even for multi-leg trips; meals
  // degrade to free-range gaps when the ~20-restaurant pool runs out. Upgrade:
  // per-leg food fetch if long-trip meals matter.
  const [attractionPools, food, lodging] = await Promise.all([
    Promise.all(centers.map((c) =>
      deps.fetchPois({
        location: body.location, kind: "attraction", prefs: body.prefs,
        locationBias: hasCenter ? { center: c, radiusKm: multiLeg ? legRadiusKm : radiusKm } : undefined,
      }))),
    wantsFood
      ? deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs, locationBias }).catch(() => [] as Poi[])
      : Promise.resolve([] as Poi[]),
    deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs, locationBias }).catch(() => [] as Poi[]),
  ]);

  // Start location is optional; a bad placeId shouldn't sink the trip.
  const start = (body.startPlaceId || body.startLocation)
    ? await deps.resolveDestination({ placeId: body.startPlaceId, location: body.startLocation ?? "" }).catch(() => null)
    : null;
  const startCenter = start && (start.center.lat !== 0 || start.center.lng !== 0) ? start.center : null;

  // Dedupe the fetched attractions globally, then split into disjoint per-leg
  // pools so parallel curations can never pick the same place twice. Food is
  // never curated by the LLM (meals are deterministic add-ons below).
  const seenIds = new Set<string>();
  const pois: Poi[] = [];
  for (const pool of attractionPools) {
    for (const p of pool) {
      if (!seenIds.has(p.placeId)) { seenIds.add(p.placeId); pois.push(p); }
    }
  }
  const legPools = multiLeg
    ? (hasCenter ? partitionByNearest(pois, centers) : splitRoundRobin(pois, legSizes.length))
    : [pois];
  const anchorPoi = lodging[0] ?? null;

  // Curate each leg in parallel — grounding + validation stay per-leg
  // (expectedDays = leg length, placeId whitelist = that leg's pool).
  let legItins: Itinerary[];
  try {
    legItins = await Promise.all(legPools.map((pool, i) =>
      deps.curate({ pois: pool, prefs: body.prefs, tripDays: legSizes[i] })));
  } catch (e) {
    if (e instanceof CurationError) return { status: 502, body: { error: "could not build itinerary" } };
    throw e;
  }

  // The LLM chose the places but can't see coordinates, so its day grouping
  // produced implausible cross-region driving. Re-group each leg's stops into
  // geographically compact days under a per-day drive budget; geography decides
  // the days, the LLM's selection/blurbs/dwell ride along unchanged. Trip-type
  // ordering applies within a single leg; multi-leg trips already encode
  // out-and-back (or drift) in the leg centers themselves.
  const coordsById: Record<string, { lat: number; lng: number }> = {};
  for (const p of pois) coordsById[p.placeId] = { lat: p.lat, lng: p.lng };
  const tuning = TRANSPORT_TUNING[body.prefs.transport];
  const maxDriveKm = (tuning.budgetMin / 60) * tuning.speedKmh;
  const allDays: Itinerary["days"] = [];
  legItins.forEach((li, i) => {
    const grouped = assignDays({
      stops: li.days.flatMap((d) => d.stops),
      coords: coordsById,
      tripDays: legSizes[i],
      maxDriveKm,
      start: i === 0 ? startCenter : null,
      tripType: multiLeg ? undefined : tripType,
    });
    for (const stops of grouped) allDays.push({ day: allDays.length + 1, lodgingPlaceId: null, stops });
  });
  let itinerary: Itinerary = { days: allDays };
```

Then, in the per-day routing loop below, change the start-anchor line so one-way trips don't loop back:

```ts
    // Day 1 anchors on the traveler's start when set; the final day returns
    // there only on round trips — one-way routes end wherever they drifted.
    const anchorAtStart = startCenter && (day.day === 1 || (tripType === "round" && day.day === lastDay));
    const startAnchor = anchorAtStart ? startCenter : null;
```

Add the imports at the top of handler.ts:

```ts
import { planLegs, legCenters, partitionByNearest, splitRoundRobin } from "../../_shared/legs.ts";
```

(Keep the existing imports; `TripType` was added in Task 9. Note the old `let itinerary: Itinerary; try { itinerary = await deps.curate(...) }` block and the old single `assignDays` call are fully replaced by the code above — `deps.curate` is now only called inside the per-leg `Promise.all`.)

- [ ] **Step 4: Run to verify pass**

Run: `cd supabase && deno test`
Expected: PASS — all suites including the two new tests and every pre-existing handler test (single-leg behavior: `legSizes = [n]`, `legPools = [pois]`, one curate call — same as before; the existing "day 1 and last day anchor on the start location" test passes because tripType defaults to "round").

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(generate): leg-chunked long trips + one-way vs round routing"
```

---

## Phase 3 — App-wide restyle sweep

### Task 15: Floating pill tab bar

**Files:**
- Modify: `mobile/app/(app)/(tabs)/_layout.tsx`
- Modify: `mobile/app/(app)/(tabs)/index.tsx`, `passport.tsx`, `discover.tsx` (bottom padding only)

**Interfaces:**
- Consumes: Ionicons via `@expo/vector-icons` (Task 2).
- Produces: floating rounded tab bar; tab screens pad their scroll content by ~112px (`pb-28`) so the bar never covers content.

- [ ] **Step 1: Rework the tab layout**

Full replacement of `mobile/app/(app)/(tabs)/_layout.tsx`:

```tsx
// mobile/app/(app)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#E11D48",
        tabBarInactiveTintColor: "#6B5560",
        tabBarStyle: {
          position: "absolute",
          left: 16, right: 16, bottom: 24,
          height: 64, borderRadius: 999,
          backgroundColor: "#FFFFFF", borderTopWidth: 0,
          paddingTop: 6, paddingBottom: 10,
          shadowColor: "#1A0E12", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Trips", tabBarIcon: ({ color }) => <Ionicons name="airplane" size={22} color={color} /> }} />
      <Tabs.Screen name="passport" options={{ title: "Passport", tabBarIcon: ({ color }) => <Ionicons name="book" size={22} color={color} /> }} />
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: ({ color }) => <Ionicons name="compass" size={22} color={color} /> }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Pad tab screens under the floating bar**

An absolute-positioned tab bar no longer reserves layout space. In each of the three tab screens, find the outermost scrollable content container and ensure ~112px bottom padding:
- `index.tsx`: FlatList already has `pb-24` → change to `pb-32`; move the floating "Plan a trip" wrapper from `bottom-6` to `bottom-28` (final styling lands in Task 16).
- `passport.tsx` and `discover.tsx`: read the files; add `pb-32` to the outermost `contentContainerClassName` (list screens) or `pb-28` on the root View (static screens). One-line change each.

- [ ] **Step 3: Verify + commit**

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add "mobile/app/(app)/(tabs)/"
git commit -m "feat(tabs): floating pill tab bar with real icons"
```

### Task 16: Trips dashboard + signed-out landing + TripCard cover

**Files:**
- Modify: `mobile/app/(app)/(tabs)/index.tsx`
- Modify: `mobile/components/ui/TripCard.tsx`

**Interfaces:**
- Consumes: `Blobs`/`decor`, gradient Button, `SUNSET_SOFT`, `Icon`, dated TripCard (Task 11).

- [ ] **Step 1: TripCard — taller cover with gradient placeholder**

Replace the cover block in `mobile/components/ui/TripCard.tsx`:

```tsx
import { LinearGradient } from "expo-linear-gradient";
import { SUNSET_SOFT } from "./gradients";
// ...
      <View className="h-40 -mx-5 -mt-5 mb-3 items-center justify-center overflow-hidden">
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} className="w-full h-full" />
        ) : (
          <LinearGradient colors={SUNSET_SOFT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}>
            <Text className="text-[72px] leading-[80px] font-jakarta-extrabold text-accent opacity-30">{initial}</Text>
          </LinearGradient>
        )}
      </View>
```

- [ ] **Step 2: Dashboard + landing**

In `mobile/app/(app)/(tabs)/index.tsx`:

Signed-out landing block becomes:

```tsx
  if (!session) {
    return (
      <Screen decor>
        <View className="flex-1 justify-center gap-3">
          <Text variant="display">Trips that feel local.</Text>
          <Text variant="body" className="text-ink-muted">
            Tell us your vibe and we'll plan every day — sights, food, and routes.
          </Text>
        </View>
        <View className="pb-24 gap-3">
          <Button title="Plan a trip" size="lg" variant="gradient" onPress={() => router.push("/onboarding")} />
          <Button title="Sign in" variant="ghost" onPress={() => router.push("/(auth)/sign-in")} />
        </View>
      </Screen>
    );
  }
```

Empty state (`trips.length === 0`) keeps its copy but upgrades the CTA and adds decor:

```tsx
      <Screen decor>
        <Header />
        <View className="flex-1 justify-center gap-3">
          <Text variant="display">Where to next?</Text>
          <Text variant="body" className="text-ink-muted">
            Tell us your vibe and we'll plan a local-feel trip, day by day.
          </Text>
        </View>
        <View className="pb-24">
          <Button title="Plan a trip" size="lg" variant="gradient" onPress={() => router.push("/onboarding")} />
        </View>
      </Screen>
```

Populated list: `Header` title becomes `<Text variant="display">Your trips</Text>`, and the floating CTA becomes:

```tsx
      <View className="absolute left-6 right-6 bottom-28">
        <Button title="Plan a trip" size="lg" variant="gradient" onPress={() => router.push("/onboarding")} />
      </View>
```

(One gradient CTA per screen — the sign-in button drops to ghost.)

- [ ] **Step 3: Verify + commit**

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add "mobile/app/(app)/(tabs)/index.tsx" mobile/components/ui/TripCard.tsx
git commit -m "feat(home): blob hero landing, gradient CTA, cover-gradient trip cards"
```

### Task 17: Sign-in + Generating restyle

**Files:**
- Modify: `mobile/app/(auth)/sign-in.tsx`
- Modify: `mobile/app/(app)/generating.tsx`

- [ ] **Step 1: Sign-in**

In `sign-in.tsx`: change `<Screen>` to `<Screen decor>`, and replace the flat logo square with a gradient mark:

```tsx
import { LinearGradient } from "expo-linear-gradient";
import { SUNSET } from "../../components/ui";
// ...
        <LinearGradient colors={SUNSET} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
          <Text variant="title" className="text-ink-inverse">T</Text>
        </LinearGradient>
```

Keep the Apple/Google buttons exactly as they are (platform sign-in buttons have style rules).

- [ ] **Step 2: Generating — living loader**

Full replacement of the non-error return in `generating.tsx`:

```tsx
// add imports at top:
import { useEffect, useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";
import { Screen, Text, Button, AnimatedView, Icon, SUNSET } from "../../components/ui";

const PHASES = ["Scouting local favorites…", "Mapping smart routes…", "Timing each day…"];

// inside the component, above the returns:
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 2500);
    return () => clearInterval(t);
  }, []);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

// the loading return:
  return (
    <Screen decor>
      <View className="flex-1 items-center justify-center gap-6">
        <AnimatedView style={pulseStyle} className="rounded-pill overflow-hidden">
          <LinearGradient colors={SUNSET} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 96, height: 96, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
            <Icon name="airplane" size={36} color="#FFFFFF" />
          </LinearGradient>
        </AnimatedView>
        <Text variant="title" className="text-center">Building your trip</Text>
        <Text variant="body" className="text-center text-ink-muted">{PHASES[phase]}</Text>
      </View>
    </Screen>
  );
```

(The error branch keeps its structure; upgrade its primary button to `size="lg"`.)

- [ ] **Step 3: Verify + commit**

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add "mobile/app/(auth)/sign-in.tsx" "mobile/app/(app)/generating.tsx"
git commit -m "feat(auth,generating): blob heroes, gradient mark, living generation loader"
```

### Task 18: Itinerary polish

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

- [ ] **Step 1: Glass day switcher + polish**

Three surgical changes (headers went dated in Task 11):

1. Map-view day pills become a horizontal scroll with glass styling — replace the `flex-row flex-wrap gap-2 mb-2` day-pill block:

```tsx
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-2" className="grow-0 mb-1">
            {days.map((d) => (
              <Pressable
                key={d.day}
                onPress={() => setSelectedDay(d.day)}
                className={`px-4 py-2 rounded-pill border ${selectedDay === d.day ? "bg-accent border-accent" : "bg-white/75 border-white/60 shadow-soft"}`}
              >
                <Text variant="label" className={selectedDay === d.day ? "text-ink-inverse" : "text-ink-muted"}>Day {d.day}</Text>
              </Pressable>
            ))}
          </ScrollView>
```

(add `ScrollView` to the `react-native` import.)

2. The map container: `rounded-lg` → `rounded-xl`.

3. Stop-card time chip — in both renderItem branches replace the bare time Text:

```tsx
                  {item.startTime ? (
                    <View className="px-2 py-0.5 rounded-pill bg-accent-soft">
                      <Text variant="label" className="text-accent text-[12px]">{item.startTime}</Text>
                    </View>
                  ) : null}
```

- [ ] **Step 2: Verify + commit**

Run: `cd mobile && npx tsc --noEmit && npx jest` — expect PASS.

```bash
git add "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(itinerary): glass day switcher, time chips, rounded map"
```

### Task 19: Remaining-screens sweep + full verification + deploy checklist

**Files:**
- Modify: `mobile/app/(app)/(tabs)/passport.tsx`, `discover.tsx`, `mobile/app/(app)/account.tsx`, `poi-detail.tsx`, `lodging.tsx`, `edit.tsx`, `gallery.tsx`, `add-photo.tsx`, `mobile/components/ui/Input.tsx`, `ListRow.tsx`, `EmptyState.tsx`

**Mechanical mapping (apply per file — read each file, then apply every row that matches):**

| Find | Replace with | Why |
|---|---|---|
| `rounded-md` on Input/list rows | `rounded-lg` | bigger radius scale |
| bare `Pressable` acting as a button/row | `PressableScale` (same className) | spring feedback everywhere |
| screen `title` header on a hub/root screen | `display` variant | oversized hierarchy |
| `active:bg-surface-2` on Pressables converted to PressableScale | remove | scale replaces press tint |
| primary CTA on each screen | `size="lg"`; the single most important one may be `variant="gradient"` | one primary action |
| EmptyState usages without `icon` | add a fitting `<Icon name="..." size={28} color="#6B5560" />` | warmth |

Specific required touches:
- `Input.tsx`: `h-12 px-4 rounded-md` → `h-14 px-5 rounded-lg`.
- `ListRow.tsx`: read it; convert its Pressable to PressableScale, radius `rounded-lg`.
- `account.tsx`: rows get leading `Icon` (e.g. `person`, `log-out`), destructive row text `text-error`.
- `passport.tsx` / `discover.tsx`: header → `display`; confirm the `pb-32` padding from Task 15 sits on the right container.
- `poi-detail.tsx` / `lodging.tsx` / `edit.tsx` / `gallery.tsx` / `add-photo.tsx`: mapping table only — no structural changes.

- [ ] **Step 1: Apply the sweep file by file** (read → apply mapping → next)

- [ ] **Step 2: Full verification**

Run: `cd mobile && npx tsc --noEmit && npx jest && cd ../supabase && deno test`
Expected: ALL PASS.

- [ ] **Step 3: Commit**

```bash
git add mobile
git commit -m "feat(design): sweep remaining screens onto sunset-soft system"
```

- [ ] **Step 4: Deploy checklist (ASK THE USER before each live action)**

1. Apply migration 0005 to the live project (`supabase db push` or dashboard SQL).
2. Deploy edge function: `supabase functions deploy generate-itinerary`.
3. Publish mobile OTA update (`eas update`) — no EAS build needed (zero new native deps).
4. Device smoke: onboarding end-to-end (incl. a >7-day trip and a one-way trip), dated headers, tab bar, animations.

---

## Self-review notes

- Spec coverage: tokens/typography (T1), gradients+icons (T2), motion (T3–T5), calendar+dates (T6–T7), 8-page onboarding + no clamp + Stepper removal (T8), request fields + guard (T9), migration + persistence (T10), dated UI (T11), leg chunking (T12, T14), round/oneway sequencing (T13, T14), sweep + tab bar + landing + generating + itinerary polish (T15–T18), remaining screens + deploy (T19). Out-of-scope items from the spec (dark mode, expo-blur, end-location input) have no tasks — intentional.
- Types cross-checked: `PartialRange` (T6) is what `RangeCalendar.value` (T7) and onboarding state updates (T8) use; `TripType` defined in both `mobile/lib/types.ts` (T8) and `supabase/_shared/types.ts` (T9); `legCenters`/`partitionByNearest`/`splitRoundRobin` signatures in T12 match T14's call sites; `assignDays`'s `tripType` option (T13) matches T14.
- Known judgment points for the executor: nativewind `cssInterop` on animated components (T3 has a fallback note); exact contents of `passport.tsx`/`discover.tsx`/`ListRow.tsx` are read-then-apply with a mechanical mapping (T15/T19).
