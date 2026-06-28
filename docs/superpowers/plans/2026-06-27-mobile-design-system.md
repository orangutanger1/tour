# Tour Guide — Mobile Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a modern soft-minimal design system (NativeWind + crimson tokens + Plus Jakarta Sans + a hand-built `components/ui/` set) and restyle the four existing screens on it, behaviour unchanged.

**Architecture:** NativeWind v4 (Tailwind v3) provides utility classes; design tokens live in `tailwind.config.js`; Plus Jakarta Sans loads via `@expo-google-fonts/plus-jakarta-sans`. A small set of hand-built themed components (`Text`, `Screen`, `Button`, `Chip`, `Card`, `Input`, `ListRow`, `EmptyState`, `Loading`) wrap RN primitives with token classNames. The four screens are rewritten to use them.

**Tech Stack:** Expo SDK 56, TypeScript, NativeWind v4, tailwindcss ^3, `@expo-google-fonts/plus-jakarta-sans`, `@expo/vector-icons`, react-native-safe-area-context (present), jest-expo.

## Global Constraints

- App lives in `mobile/`. Run commands from there (`cd mobile`). All paths relative to repo root.
- TypeScript only. **Extensionless imports** (Metro/Expo convention).
- Styling = **NativeWind v4 only** (no gluestack). `className` works on RN components via the `jsxImportSource: "nativewind"` babel option + `nativewind-env.d.ts`.
- **Tokens are fixed** (from the spec) — copy the exact hex/scale values; do not invent new ones.
- Accent crimson `#E11D48`; accent-2 `#FB7185`; accent-pressed `#BE123C`; accent-soft `#FFF1F3`. bg `#FFFBFC`; surface `#FFFFFF`; surface-2 `#F7F4F5`; border `#ECE7E9`. ink `#1A0E12`; ink-muted `#6B5560`; ink-inverse `#FFFFFF`. success `#10B981`; warning `#F59E0B`; error `#EF4444`.
- Font families (loaded names): `PlusJakartaSans_400Regular/500Medium/600SemiBold/700Bold/800ExtraBold`.
- **Light theme only.** Do not add dark variants.
- **Verification per task:** `npx tsc --noEmit` must report **0 errors** (the ExternalLink error was fixed; keep it at zero). Restyles must not change screen behaviour (handlers/state preserved). No unit tests — a design system has no testable logic (the existing 24 lib tests must keep passing).
- A new EAS dev build is needed before the look appears on device; that is out of this plan's automated scope.

---

## Task Ordering

1. NativeWind + Tailwind + tokens + fonts + provider wiring (setup)
2. `ui/Text` + `ui/Screen` (+ barrel)
3. `ui/Button` + `ui/Chip`
4. `ui/Card` + `ui/Input`
5. `ui/ListRow` + `ui/EmptyState` + `ui/Loading`
6. Restyle `index.tsx` (home)
7. Restyle `onboarding.tsx`
8. Restyle `generating.tsx`
9. Restyle `itinerary.tsx`

---

### Task 1: NativeWind + Tailwind + tokens + fonts + provider wiring

**Files:**
- Modify (install): `mobile/package.json`
- Create: `mobile/tailwind.config.js`, `mobile/global.css`, `mobile/babel.config.js`, `mobile/metro.config.js`, `mobile/nativewind-env.d.ts`
- Modify: `mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: working `className` styling with the token theme; Plus Jakarta Sans loaded app-wide; `SafeAreaProvider` mounted.

- [ ] **Step 1: Install dependencies**

```bash
cd mobile
npm install nativewind
npm install -D tailwindcss@^3.4.17
npx expo install @expo-google-fonts/plus-jakarta-sans react-native-safe-area-context
```
Expected: `nativewind` in deps, `tailwindcss` in devDeps, `@expo-google-fonts/plus-jakarta-sans` in deps. (`react-native-safe-area-context` is already present; the command no-ops or aligns the version.)

- [ ] **Step 2: Create `mobile/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
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
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", xl: "24px", pill: "999px" },
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
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Create `mobile/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: Create `mobile/babel.config.js`**

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
```

- [ ] **Step 5: Create `mobile/metro.config.js`**

```javascript
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./global.css" });
```

- [ ] **Step 6: Create `mobile/nativewind-env.d.ts`**

```typescript
/// <reference types="nativewind/types" />
```

- [ ] **Step 7: Wire fonts + CSS + SafeAreaProvider into `mobile/app/_layout.tsx`**

Replace the file with:

```typescript
// mobile/app/_layout.tsx
import "../global.css";
import { useEffect } from "react";
import { Slot, useRouter, useSegments } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider, useAuth } from "../lib/auth";

const queryClient = new QueryClient();

function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) router.replace("/(auth)/sign-in");
    else if (session && inAuthGroup) router.replace("/(app)");
  }, [session, loading, segments]);

  return <Slot />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 8: Type-check + tests (no regressions)**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: tsc reports **0 errors**; jest shows **24 passed**. (If `tsc` flags `className` as unknown on RN components, confirm `nativewind-env.d.ts` exists and is included by `tsconfig.json`'s default glob.)

- [ ] **Step 9: Commit**

```bash
cd /home/myen/tour
git add mobile/package.json mobile/package-lock.json mobile/tailwind.config.js mobile/global.css \
  mobile/babel.config.js mobile/metro.config.js mobile/nativewind-env.d.ts mobile/app/_layout.tsx
git commit -m "feat(mobile): NativeWind design tokens + Plus Jakarta Sans setup"
```

---

### Task 2: `ui/Text` + `ui/Screen` (+ barrel)

**Files:**
- Create: `mobile/components/ui/Text.tsx`, `mobile/components/ui/Screen.tsx`, `mobile/components/ui/index.ts`

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces:
  - `Text(props: RNTextProps & { variant?: "display"|"title"|"heading"|"body"|"caption"|"label"; className?: string })`
  - `Screen(props: { children: ReactNode; scroll?: boolean; className?: string })`
  - barrel re-exporting both (and later components).

- [ ] **Step 1: Create `mobile/components/ui/Text.tsx`**

```typescript
// mobile/components/ui/Text.tsx
import { Text as RNText, type TextProps } from "react-native";

type Variant = "display" | "title" | "heading" | "body" | "caption" | "label";

const VARIANTS: Record<Variant, string> = {
  display: "text-[32px] leading-[38px] font-jakarta-extrabold text-ink",
  title: "text-[24px] leading-[30px] font-jakarta-bold text-ink",
  heading: "text-[18px] leading-[24px] font-jakarta-bold text-ink",
  body: "text-[16px] leading-[22px] font-jakarta-medium text-ink",
  caption: "text-[14px] leading-[20px] font-jakarta-medium text-ink-muted",
  label: "text-[13px] leading-[18px] font-jakarta-semibold text-ink",
};

export function Text({ variant = "body", className, ...props }: TextProps & { variant?: Variant; className?: string }) {
  return <RNText className={`${VARIANTS[variant]} ${className ?? ""}`} {...props} />;
}
```

- [ ] **Step 2: Create `mobile/components/ui/Screen.tsx`**

```typescript
// mobile/components/ui/Screen.tsx
import type { ReactNode } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children, scroll, className }: { children: ReactNode; scroll?: boolean; className?: string }) {
  if (scroll) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
        <ScrollView className="flex-1" contentContainerClassName={`px-6 py-4 gap-4 ${className ?? ""}`} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className={`flex-1 px-6 py-4 ${className ?? ""}`}>{children}</View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Create `mobile/components/ui/index.ts`**

```typescript
// mobile/components/ui/index.ts
export { Text } from "./Text";
export { Screen } from "./Screen";
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /home/myen/tour
git add mobile/components/ui/Text.tsx mobile/components/ui/Screen.tsx mobile/components/ui/index.ts
git commit -m "feat(mobile): ui Text + Screen primitives"
```

---

### Task 3: `ui/Button` + `ui/Chip`

**Files:**
- Create: `mobile/components/ui/Button.tsx`, `mobile/components/ui/Chip.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Consumes: `Text` (Task 2).
- Produces:
  - `Button(props: { title: string; onPress?: () => void; variant?: "primary"|"secondary"|"ghost"; size?: "sm"|"md"|"lg"; disabled?: boolean; loading?: boolean; leftIcon?: ReactNode; className?: string })`
  - `Chip(props: { label: string; selected: boolean; onPress: () => void })`

- [ ] **Step 1: Create `mobile/components/ui/Button.tsx`**

```typescript
// mobile/components/ui/Button.tsx
import type { ReactNode } from "react";
import { Pressable, ActivityIndicator, View } from "react-native";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const BASE = "flex-row items-center justify-center rounded-pill";
const SIZES: Record<Size, string> = { sm: "h-10 px-4", md: "h-12 px-5", lg: "h-14 px-6" };
const BG: Record<Variant, string> = {
  primary: "bg-accent active:bg-accent-pressed",
  secondary: "bg-surface border border-border active:bg-surface-2",
  ghost: "bg-transparent active:bg-surface-2",
};
const FG: Record<Variant, string> = { primary: "text-ink-inverse", secondary: "text-ink", ghost: "text-accent" };

export function Button({ title, onPress, variant = "primary", size = "md", disabled, loading, leftIcon, className }: {
  title: string; onPress?: () => void; variant?: Variant; size?: Size; disabled?: boolean; loading?: boolean; leftIcon?: ReactNode; className?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable onPress={onPress} disabled={off} className={`${BASE} ${SIZES[size]} ${BG[variant]} ${off ? "opacity-50" : ""} ${className ?? ""}`}>
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#FFFFFF" : "#E11D48"} />
      ) : (
        <View className="flex-row items-center gap-2">
          {leftIcon}
          <Text variant="label" className={`${FG[variant]} text-[15px]`}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 2: Create `mobile/components/ui/Chip.tsx`**

```typescript
// mobile/components/ui/Chip.tsx
import { Pressable } from "react-native";
import { Text } from "./Text";

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`px-4 py-2 rounded-pill border ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
      <Text variant="label" className={selected ? "text-accent" : "text-ink"}>{label}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 3: Update the barrel `mobile/components/ui/index.ts`**

```typescript
// mobile/components/ui/index.ts
export { Text } from "./Text";
export { Screen } from "./Screen";
export { Button } from "./Button";
export { Chip } from "./Chip";
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /home/myen/tour
git add mobile/components/ui/Button.tsx mobile/components/ui/Chip.tsx mobile/components/ui/index.ts
git commit -m "feat(mobile): ui Button + Chip"
```

---

### Task 4: `ui/Card` + `ui/Input`

**Files:**
- Create: `mobile/components/ui/Card.tsx`, `mobile/components/ui/Input.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Card(props: { children: ReactNode; onPress?: () => void; className?: string })`
  - `Input(props: RNTextInputProps & { className?: string })`

- [ ] **Step 1: Create `mobile/components/ui/Card.tsx`**

```typescript
// mobile/components/ui/Card.tsx
import type { ReactNode } from "react";
import { View, Pressable } from "react-native";

export function Card({ children, onPress, className }: { children: ReactNode; onPress?: () => void; className?: string }) {
  const cls = `bg-surface rounded-lg p-4 shadow-card ${className ?? ""}`;
  if (onPress) return <Pressable onPress={onPress} className={`${cls} active:bg-surface-2`}>{children}</Pressable>;
  return <View className={cls}>{children}</View>;
}
```

- [ ] **Step 2: Create `mobile/components/ui/Input.tsx`**

```typescript
// mobile/components/ui/Input.tsx
import { TextInput, type TextInputProps } from "react-native";

export function Input({ className, ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      placeholderTextColor="#6B5560"
      className={`h-12 px-4 rounded-md bg-surface border border-border text-ink font-jakarta-medium text-[16px] ${className ?? ""}`}
      {...props}
    />
  );
}
```

- [ ] **Step 3: Update the barrel `mobile/components/ui/index.ts`**

```typescript
// mobile/components/ui/index.ts
export { Text } from "./Text";
export { Screen } from "./Screen";
export { Button } from "./Button";
export { Chip } from "./Chip";
export { Card } from "./Card";
export { Input } from "./Input";
```

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /home/myen/tour
git add mobile/components/ui/Card.tsx mobile/components/ui/Input.tsx mobile/components/ui/index.ts
git commit -m "feat(mobile): ui Card + Input"
```

---

### Task 5: `ui/ListRow` + `ui/EmptyState` + `ui/Loading`

**Files:**
- Create: `mobile/components/ui/ListRow.tsx`, `mobile/components/ui/EmptyState.tsx`, `mobile/components/ui/Loading.tsx`
- Modify: `mobile/components/ui/index.ts`

**Interfaces:**
- Consumes: `Text` (Task 2).
- Produces:
  - `ListRow(props: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; onLongPress?: () => void })`
  - `EmptyState(props: { icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode })`
  - `Loading(props: { label?: string })`

- [ ] **Step 1: Create `mobile/components/ui/ListRow.tsx`**

```typescript
// mobile/components/ui/ListRow.tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";

export function ListRow({ title, subtitle, right, onPress, onLongPress }: {
  title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; onLongPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} className="flex-row items-center gap-3 bg-surface rounded-lg p-4 border border-border active:bg-surface-2">
      <View className="flex-1">
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}
```

- [ ] **Step 2: Create `mobile/components/ui/EmptyState.tsx`**

```typescript
// mobile/components/ui/EmptyState.tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "./Text";

export function EmptyState({ icon, title, subtitle, action }: {
  icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      {icon}
      <Text variant="title" className="text-center">{title}</Text>
      {subtitle ? <Text variant="body" className="text-center text-ink-muted">{subtitle}</Text> : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}
```

- [ ] **Step 3: Create `mobile/components/ui/Loading.tsx`**

```typescript
// mobile/components/ui/Loading.tsx
import { View, ActivityIndicator } from "react-native";
import { Text } from "./Text";

export function Loading({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <ActivityIndicator size="large" color="#E11D48" />
      {label ? <Text variant="body" className="text-ink-muted">{label}</Text> : null}
    </View>
  );
}
```

- [ ] **Step 4: Update the barrel `mobile/components/ui/index.ts`**

```typescript
// mobile/components/ui/index.ts
export { Text } from "./Text";
export { Screen } from "./Screen";
export { Button } from "./Button";
export { Chip } from "./Chip";
export { Card } from "./Card";
export { Input } from "./Input";
export { ListRow } from "./ListRow";
export { EmptyState } from "./EmptyState";
export { Loading } from "./Loading";
```

- [ ] **Step 5: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /home/myen/tour
git add mobile/components/ui/ListRow.tsx mobile/components/ui/EmptyState.tsx mobile/components/ui/Loading.tsx mobile/components/ui/index.ts
git commit -m "feat(mobile): ui ListRow + EmptyState + Loading"
```

---

### Task 6: Restyle `index.tsx` (home)

**Files:**
- Modify: `mobile/app/(app)/index.tsx`

**Interfaces:**
- Consumes: `Screen`, `Text`, `Button` from `../../components/ui`; `useAuth`, `useRouter` (unchanged).
- Produces: restyled home; same actions (Plan a trip → `/onboarding`, Sign out).

- [ ] **Step 1: Replace `mobile/app/(app)/index.tsx`**

```typescript
// mobile/app/(app)/index.tsx
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { Screen, Text, Button } from "../../components/ui";

export default function Home() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text variant="display">Where to next?</Text>
        <Text variant="body" className="text-ink-muted">
          Tell us your vibe and we'll plan a local-feel trip, day by day.
        </Text>
      </View>
      <View className="gap-3 pb-2">
        <Button title="Plan a trip" onPress={() => router.push("/onboarding")} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
        <Text variant="caption" className="text-center">{user?.email ?? user?.id}</Text>
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(app)/index.tsx"
git commit -m "feat(mobile): restyle home on design system"
```

---

### Task 7: Restyle `onboarding.tsx`

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `Screen`, `Text`, `Button`, `Chip`, `Input`, `Card` from `../../components/ui`; the unchanged `lib/onboarding`, `lib/profile`, `lib/supabase`, `lib/tripFlow` imports.
- Produces: restyled 3-step wizard; identical state/handlers/validation.

- [ ] **Step 1: Replace `mobile/app/(app)/onboarding.tsx`**

```typescript
// mobile/app/(app)/onboarding.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, canContinue, buildRequest, prefsFromState,
  type OnboardingState,
} from "../../lib/onboarding";
import { getProfile, upsertProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { useTripFlow } from "../../lib/tripFlow";
import type { Prefs } from "../../lib/types";
import { Screen, Text, Button, Chip, Input, Card } from "../../components/ui";

const BUDGETS: Prefs["budget"][] = ["low", "mid", "high"];
const PACES: Prefs["pace"][] = ["relaxed", "balanced", "packed"];

export default function Onboarding() {
  const router = useRouter();
  const tripFlow = useTripFlow();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<OnboardingState>(stateFromProfile(null));

  useEffect(() => {
    getProfile(supabase).then((prefs) => setState(stateFromProfile(prefs))).catch(() => {});
  }, []);

  function toggleInterest(i: string) {
    setState((s) => ({
      ...s,
      interests: s.interests.includes(i) ? s.interests.filter((x) => x !== i) : [...s.interests, i],
    }));
  }

  async function onGenerate() {
    try { await upsertProfile(supabase, prefsFromState(state)); } catch { /* best-effort */ }
    tripFlow.generate(buildRequest(state));
    router.push("/generating");
  }

  return (
    <Screen scroll>
      <View className="flex-row gap-2 mb-2">
        {[0, 1, 2].map((i) => (
          <View key={i} className={`h-1.5 flex-1 rounded-pill ${i <= step ? "bg-accent" : "bg-surface-2"}`} />
        ))}
      </View>

      {step === 0 && (
        <View className="gap-5">
          <Text variant="title">What do you like?</Text>
          <View className="flex-row flex-wrap gap-2">
            {INTERESTS.map((i) => (
              <Chip key={i} label={i} selected={state.interests.includes(i)} onPress={() => toggleInterest(i)} />
            ))}
          </View>
          <Text variant="label">Budget</Text>
          <View className="flex-row gap-2">
            {BUDGETS.map((b) => (
              <Chip key={b} label={b} selected={state.budget === b} onPress={() => setState((s) => ({ ...s, budget: b }))} />
            ))}
          </View>
          <Text variant="label">Pace</Text>
          <View className="flex-row gap-2">
            {PACES.map((p) => (
              <Chip key={p} label={p} selected={state.pace === p} onPress={() => setState((s) => ({ ...s, pace: p }))} />
            ))}
          </View>
        </View>
      )}

      {step === 1 && (
        <View className="gap-5">
          <Text variant="title">Where and how long?</Text>
          <Input placeholder="Location (e.g. Lisbon)" value={state.location} onChangeText={(t) => setState((s) => ({ ...s, location: t }))} />
          <Text variant="label">Days: {state.tripDays}</Text>
          <View className="flex-row gap-3">
            <Button title="–" variant="secondary" size="sm" onPress={() => setState((s) => ({ ...s, tripDays: Math.max(1, s.tripDays - 1) }))} />
            <Button title="+" variant="secondary" size="sm" onPress={() => setState((s) => ({ ...s, tripDays: Math.min(MAX_TRIP_DAYS, s.tripDays + 1) }))} />
          </View>
        </View>
      )}

      {step === 2 && (
        <Card className="gap-2">
          <Text variant="title">Review</Text>
          <Text variant="body">Location: {state.location}</Text>
          <Text variant="body">Days: {state.tripDays}</Text>
          <Text variant="body">Interests: {state.interests.join(", ")}</Text>
          <Text variant="body">Budget: {state.budget} · Pace: {state.pace}</Text>
        </Card>
      )}

      <View className="flex-row justify-between gap-3 mt-4">
        <Button title="Back" variant="ghost" disabled={step === 0} onPress={() => setStep((s) => Math.max(0, s - 1))} className="flex-1" />
        {step < 2 ? (
          <Button title="Next" disabled={!canContinue(step, state)} onPress={() => setStep((s) => s + 1)} className="flex-1" />
        ) : (
          <Button title="Generate" onPress={onGenerate} className="flex-1" />
        )}
      </View>
    </Screen>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(mobile): restyle onboarding on design system"
```

---

### Task 8: Restyle `generating.tsx`

**Files:**
- Modify: `mobile/app/(app)/generating.tsx`

**Interfaces:**
- Consumes: `Screen`, `Text`, `Button`, `Loading` from `../../components/ui`; unchanged `useTripFlow`, `useRouter`.
- Produces: restyled loading/error screen; identical status-driven behaviour.

- [ ] **Step 1: Replace `mobile/app/(app)/generating.tsx`**

```typescript
// mobile/app/(app)/generating.tsx
import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";
import { Screen, Text, Button, Loading } from "../../components/ui";

export default function Generating() {
  const { status, error, lastRequest, generate } = useTripFlow();
  const router = useRouter();

  useEffect(() => {
    if (status === "success") router.replace("/itinerary");
  }, [status]);

  if (status === "error") {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text variant="title" className="text-center">Couldn't build your itinerary</Text>
          <Text variant="body" className="text-center text-ink-muted">{error?.message ?? "Something went wrong."}</Text>
        </View>
        <View className="gap-3 pb-2">
          <Button title="Try again" onPress={() => lastRequest && generate(lastRequest)} />
          <Button title="Edit trip" variant="ghost" onPress={() => router.replace("/onboarding")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Loading label="Building your itinerary…" />
    </Screen>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(app)/generating.tsx"
git commit -m "feat(mobile): restyle generating on design system"
```

---

### Task 9: Restyle `itinerary.tsx`

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: `Screen`, `Text`, `Button`, `Card`, `EmptyState` from `../../components/ui`; unchanged `useTripFlow`, `getStopCoords`, `supabase`, `AppleMaps`, `useRouter`.
- Produces: restyled itinerary (day cards, segmented List/Map toggle, stop rows, empty state); identical data/coords/map logic.

- [ ] **Step 1: Replace `mobile/app/(app)/itinerary.tsx`**

```typescript
// mobile/app/(app)/itinerary.tsx
import { useEffect, useMemo, useState } from "react";
import { View, SectionList, Pressable } from "react-native";
import { AppleMaps } from "expo-maps";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";
import { supabase } from "../../lib/supabase";
import { getStopCoords, type StopCoord } from "../../lib/poi";
import { Screen, Text, Button, Card, EmptyState } from "../../components/ui";

export default function Itinerary() {
  const { data } = useTripFlow();
  const router = useRouter();
  const [view, setView] = useState<"list" | "map">("list");
  const [coords, setCoords] = useState<Record<string, StopCoord>>({});

  const days = data?.itinerary.days ?? [];
  const empty = days.length === 0 || days.every((d) => d.stops.length === 0);

  const placeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of days) {
      if (d.lodgingPlaceId) ids.add(d.lodgingPlaceId);
      d.stops.forEach((s) => ids.add(s.placeId));
    }
    return [...ids];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (placeIds.length) getStopCoords(supabase, placeIds).then(setCoords).catch(() => {});
  }, [placeIds]);

  if (empty) {
    return (
      <Screen>
        <EmptyState
          title="Limited data here"
          subtitle="Try a broader location."
          action={<Button title="Edit trip" onPress={() => router.replace("/onboarding")} />}
        />
      </Screen>
    );
  }

  const markers = placeIds
    .map((id) => coords[id])
    .filter((c): c is StopCoord => !!c)
    .map((c, idx) => ({ id: String(idx), coordinates: { latitude: c.lat, longitude: c.lng }, title: c.name }));

  const sections = days.map((d) => ({
    title: `Day ${d.day}`,
    lodging: d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined,
    data: d.stops,
  }));

  function Toggle() {
    return (
      <View className="flex-row self-center bg-surface-2 rounded-pill p-1 mb-3">
        {(["list", "map"] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} className={`px-5 py-1.5 rounded-pill ${view === v ? "bg-surface" : ""}`}>
            <Text variant="label" className={view === v ? "text-accent" : "text-ink-muted"}>{v === "list" ? "List" : "Map"}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <Screen>
      <Toggle />
      {view === "map" ? (
        <View className="flex-1 rounded-lg overflow-hidden">
          <AppleMaps.View
            style={{ flex: 1 }}
            cameraPosition={markers[0] ? { coordinates: markers[0].coordinates, zoom: 11 } : undefined}
            markers={markers}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.placeId + i}
          contentContainerClassName="gap-3 pb-4"
          renderSectionHeader={({ section }) => (
            <View className="pt-2 pb-1">
              <Text variant="heading">{section.title}</Text>
              {section.lodging ? <Text variant="caption">Stay: {section.lodging}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => (
            <Card className="gap-1">
              <Text variant="heading">{item.name}</Text>
              <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
              {item.travelMinutesFromPrev != null ? (
                <Text variant="caption">{item.travelMinutesFromPrev} min from previous</Text>
              ) : null}
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
```

- [ ] **Step 2: Type-check + full test suite**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: tsc 0 errors; jest 24 passed.

- [ ] **Step 3: Commit**

```bash
cd /home/myen/tour
git add "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(mobile): restyle itinerary on design system"
```

---

## Final Verification (after all tasks)

- [ ] `cd mobile && npx tsc --noEmit` — **0 errors**.
- [ ] `cd mobile && npm test` — 24 lib tests pass (design system added no logic).
- [ ] **Rough web smoke (best-effort):** `cd mobile && npx expo start --web`, open the printed URL, click through home → onboarding → review. Confirms NativeWind classes apply + fonts load in a browser. Native bits (map, true shadows) won't be representative.
- [ ] **Device sign-off (user):** a fresh EAS dev build is required for NativeWind's native config + fonts on device; the user runs it and approves the look, then iterate.
- [ ] Use superpowers:finishing-a-development-branch to integrate. **Do not push unless asked** (per dev-workflow).

## Notes / Risks

- **`shadow-soft` / `shadow-card`:** rely on RN 0.76+ `boxShadow` style support via NativeWind. If shadows don't render on device, replace the `shadow-*` classes with an inline `style` shadow preset in `Card`/`Button` — isolated, one-line change.
- **`className` on RN core components:** depends on `jsxImportSource: "nativewind"` (babel) + `nativewind-env.d.ts`. If `tsc` rejects `className`, those two are the cause.
- **Behaviour parity:** each restyle preserves the screen's prior handlers/state — diff against the pre-restyle file before committing.
- The map only renders on a dev build that already includes `expo-maps` (from the 2b plan) plus this build's NativeWind config.
