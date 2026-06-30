# Design: Day sequencing fix, day stepper, signed-out gate

Date: 2026-06-29

Three independent changes, one branch, three TDD commits.

---

## 1. Day sequencing — spread attractions across the day

### Problem
`supabase/_shared/schedule.ts` lays an absolute clock over a day's ordered
attractions. It stacks stops back-to-back from `DAY_START` (9:00), inserts lunch
when the clock crosses ~noon, and inserts dinner when the clock crosses sunset.
With few stops (relaxed/balanced pace = 2–5 stops) the attractions run out by
mid-afternoon, so dinner gets appended at sunset (~19:00–20:00) with a 4–6 hour
dead gap after the last stop. Observed sequence: `stops → lunch → dinner` with
nothing between lunch and dinner.

### Fix
Spread attractions so they fill the day instead of stacking at the start.

- Lunch anchored at `LUNCH_TARGET_MIN` (12:30). Dinner anchored at
  `sunsetMinutes`. These two meals bound the day.
- Attractions split into a **morning window** `[DAY_START, lunchStart]` and an
  **afternoon window** `[lunchEnd, dinnerStart]`. Count per window is
  proportional to each window's length (afternoon is longer in summer → gets
  more stops). `morningCount = round(N * morningLen / (morningLen + afternoonLen))`,
  afternoon gets the rest.
- Within each window, distribute **slack** evenly between stops:
  `slack = windowLen − sum(dwell) − sum(travel*TRAVEL_BUFFER)`; gap between
  consecutive stops = `max(0, slack) / max(1, k−1)` for `k` stops in the window
  (first stop starts at the window start, no leading gap).
- **Packed days (slack ≤ 0) fall back to back-to-back** — current behavior,
  unchanged. Only sparse days spread out.
- Edge cases: 0 stops in a window → that window's meal anchored at its target
  time directly. 1 stop in a window → placed at window start. Day with no
  afternoon stops still gets dinner at sunset (no regression vs today, but now
  morning stops are spread, not stacked).

### Result (balanced, 4 stops, summer)
```
9:00  Stop 1
10:30 Stop 2
12:30 Lunch
14:00 Stop 3
16:00 Stop 4
18:30 Dinner
```

### Scope
- Edit: `supabase/_shared/schedule.ts` (`buildDaySchedule`).
- Tests: extend `supabase/_shared/schedule_test.ts` — assert sparse days place a
  stop after lunch and before dinner; assert packed days stay back-to-back;
  assert meal anchoring unchanged.
- Caller `generate-itinerary/handler.ts` is unchanged (same signature).

---

## 2. Day stepper component

### Problem
Onboarding day picker (`mobile/app/(app)/onboarding.tsx:194–200`) uses plain
`−` / `+` buttons that bump once per tap — 14 days = many taps. Wanted: reward
the hold, animate with rolling digits, soft edges.

### Component: `mobile/components/ui/Stepper.tsx` (new)
Props: `value: number`, `onChange(next: number)`, `min`, `max`,
optional `suffix` (e.g. "days"/"day").

- **Hold-to-repeat:** `onPressIn` on `−`/`+` fires one immediate bump, then after
  ~400ms starts repeating on an accelerating interval (300 → 150 → 80ms),
  stopping at `onPressOut` / `onPressCancel`. Clamps at `min`/`max` and stops the
  timer when the bound is hit. Tap (press+release fast) = single bump.
  Implemented with `setTimeout`/`setInterval` refs cleared on unmount — no dep.
- **Rolling digits:** the number renders as per-digit columns. On value change
  each digit animates `translateY` (reanimated `withTiming`) to roll the new
  glyph into the window. Roll direction follows increment vs decrement.
- **Gradient edge masks:** `expo-linear-gradient` overlays at the top and bottom
  of the fixed-height digit window, fading from the surface bg color to
  transparent, so digits soften as they enter/leave instead of hard-clipping.
  **New dependency: `expo-linear-gradient`** (Expo SDK package), justified by the
  explicit "gradient masks" requirement.
- **Blur approximation:** true Gaussian motion-blur on moving `Text` is not
  natively cheap in RN (`expo-blur`'s `BlurView` blurs what is *behind* it, not
  the element). Approximated by animating opacity + a slight scale on the
  outgoing/incoming digit alongside the roll, plus the gradient mask. Reads as a
  soft blur. **No `expo-blur` dependency.** (User approved this approximation.)

### Wiring
Replace the `−`/`+` Button row + centered count `Text`
(`onboarding.tsx:194–200`) with `<Stepper value={state.tripDays} min={1}
max={MAX_TRIP_DAYS} suffix={…} onChange={(d) => setState((s) => ({ ...s,
tripDays: d }))} />`. The `DAY_PRESETS` quick-pick chips above it stay.

### Scope
- New: `mobile/components/ui/Stepper.tsx`, export from `components/ui/index`.
- Edit: `onboarding.tsx` (swap the control), `package.json` (add
  `expo-linear-gradient` via `npx expo install`).
- Tests: `Stepper.test.tsx` — hold accelerates past a single bump (fake timers,
  assert multiple `onChange` calls from one hold); clamps at min/max (no
  `onChange` past bound); tap = one bump.

---

## 3. Signed-out gate (gate saved trips only)

### Problem
No auth guard on the `(app)` group. A signed-out user (e.g. just after sign-out)
still lands on the Trips tab. Wanted: signed-out home shows a sign-in entry, not
trip content. The anonymous "plan a trip before signing in" flow must stay.

### Fix
- `mobile/app/(app)/(tabs)/index.tsx`: when `!session`, render a **sign-in
  landing** — headline + subtitle + a primary "Sign in" button routing to
  `/(auth)/sign-in`, plus the existing "Plan a trip" path to onboarding (so
  anonymous planning still works; sign-in still happens at Generate). The
  `useQuery` for trips is already `enabled: !!session`, so no trip fetch when
  signed out.
- `mobile/app/(auth)/sign-in.tsx`: copy currently assumes post-onboarding
  ("Almost there" / "Sign in to save your trip"). Make it adapt: when there is a
  `pendingRequest`, keep the current copy; otherwise show a generic welcome
  ("Welcome back" / "Sign in to see your trips"). Post-sign-in routing is
  unchanged (`pendingRequest` → generating; else → `/`).
- Sign-out lives in `account.tsx` and already returns the user toward home; with
  the gate above, home then shows the sign-in landing instead of stale trips. No
  redirect loop: the landing is a normal render, not a navigation guard.

### Scope
- Edit: `(tabs)/index.tsx` (signed-out branch), `(auth)/sign-in.tsx` (adaptive
  copy).
- Tests: existing jest suite stays green; add a render test that the signed-out
  Trips tab shows the "Sign in" entry and not the trip list. (Verify
  `account.tsx` sign-out path needs no change.)

---

## Out of scope / non-goals
- No blanket auth redirect on the whole `(app)` group (would break anonymous
  planning).
- No `expo-blur` / real motion-blur.
- No change to attraction selection, routing, dwell, or meal-pick logic — only
  the clock layout in `schedule.ts`.
- No second stepper instance (only onboarding uses one today).
