# Render Fix + Generation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NativeWind styles actually render on device (kill the cssInterop-on-reanimated path), make itinerary generation async so client timeouts can't kill it, degrade gracefully for sparse destinations, and tighten dates UX / CTA anchoring / gradient discipline.

**Architecture:** Phase 1 rewrites `PressableScale` as a plain core `Pressable` (core-component className interop is proven working on device) and sweeps every `className` off reanimated components. Phase 2 splits `generate-itinerary` into a fast synchronous start (insert `status='generating'` trip row, return `{tripId}` 202) plus a background pipeline via `EdgeRuntime.waitUntil`; the client polls the trip row. Sparse POI pools cap effective days and collapse legs before curation. Phase 3 is copy/layout polish.

**Tech Stack:** Expo 56 / React Native, NativeWind 4, reanimated 4 (style-prop-only from now on), Supabase edge functions (Deno), jest + deno test.

**Spec:** `docs/superpowers/specs/2026-07-02-render-fix-generation-hardening-design.md`

## Global Constraints

- Work on branch `render-fix-hardening` off `main`.
- Backend tests: Deno (`*_test.ts`, `jsr:@std/assert`), run `cd supabase && deno test`. Mobile tests: jest (`*.test.ts`), run `cd mobile && npm test`. Types: `cd mobile && npx tsc --noEmit`.
- NEVER put `className` on a reanimated component (`Animated.View`, `Animated.createAnimatedComponent(...)`) — silently dropped on device. Style animated components via `style` props only. Task 1 adds a guard test enforcing this.
- Accent hex used inline elsewhere in the codebase: `#E11D48`.
- Trip row statuses: `'generating' | 'ready' | 'failed'` (DB default `'ready'`).
- The device already has a binary with `expo-updates`; JS ships via `eas update` (no new native deps in this plan — do NOT add native dependencies).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 0: Branch

- [ ] **Step 1:** `cd /home/myen/tour && git checkout -b render-fix-hardening`

---

### Task 1: Render fix — no className through reanimated

**Files:**
- Test: `mobile/lib/noAnimatedClassName.test.ts` (create)
- Modify: `mobile/components/ui/PressableScale.tsx` (full rewrite)
- Modify: `mobile/components/ui/Chip.tsx` (full rewrite)
- Modify: `mobile/components/ui/ProgressBar.tsx` (full rewrite)
- Modify: `mobile/app/(app)/onboarding.tsx:153` (one attribute)
- Modify: `mobile/app/(app)/generating.tsx:8,55` (imports + one element)
- Modify: `mobile/components/ui/index.ts` (drop two exports)

**Interfaces:**
- Consumes: nothing.
- Produces: `PressableScale(props: PressableProps & { className?: string })` — plain core `Pressable`, no reanimated. `AnimatedPressable`/`AnimatedView` exports DELETED; nothing else in the repo may import them (Task 1 removes the last importers).

- [ ] **Step 1: Write the failing guard test**

```ts
// mobile/lib/noAnimatedClassName.test.ts
// NativeWind classNames on reanimated components (cssInterop-registered or
// Animated.*) are silently dropped on device. Ban the pattern at test time —
// jest can't see the native runtime, but it can see the source.
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..");

function listSrc(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : listSrc(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const files = ["app", "components"].flatMap((d) => listSrc(path.join(ROOT, d)));

test("no className on reanimated components", () => {
  const re = /<(Animated\.[A-Za-z]+|AnimatedView|AnimatedPressable)\b[^>]*className/;
  const offenders = files.filter((f) => re.test(fs.readFileSync(f, "utf8")));
  expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
});

test("no cssInterop calls anywhere", () => {
  // match call sites, not prose — comments may mention the word
  const offenders = files.filter((f) => /\bcssInterop\s*\(/.test(fs.readFileSync(f, "utf8")));
  expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest lib/noAnimatedClassName.test.ts`
Expected: FAIL — offenders include `components/ui/PressableScale.tsx`, `components/ui/Chip.tsx`, `components/ui/ProgressBar.tsx`, `app/(app)/onboarding.tsx`, `app/(app)/generating.tsx`.

- [ ] **Step 3: Rewrite PressableScale as a plain core Pressable**

Replace the entire file:

```tsx
// mobile/components/ui/PressableScale.tsx
// Plain core Pressable. NativeWind className on reanimated-wrapped components
// is silently dropped on device (cssInterop registration doesn't take at
// runtime), so touchables style through the core interop only. Press feedback
// is an instant 0.97 scale via the style function — no reanimated in the
// touch path.
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

export function PressableScale({ style, ...props }: PressableProps & { className?: string }) {
  return (
    <Pressable
      {...props}
      style={(state) => [
        (typeof style === "function" ? style(state) : style) as StyleProp<ViewStyle>,
        state.pressed ? { transform: [{ scale: 0.97 }] } : null,
      ]}
    />
  );
}
```

(`onPressIn`/`onPressOut` pass through untouched in `props` — callers that use them keep working. The spring/`cssInterop`/`AnimatedPressable`/`AnimatedView` exports are gone.)

- [ ] **Step 4: Rewrite Chip on PressableScale**

Replace the entire file:

```tsx
// mobile/components/ui/Chip.tsx
import type { ReactNode } from "react";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function Chip({ label, selected, onPress, icon }: {
  label: string; selected: boolean; onPress: () => void; icon?: ReactNode;
}) {
  return (
    <PressableScale
      onPress={onPress}
      className={`h-11 px-4 flex-row items-center gap-1.5 rounded-pill border ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}
    >
      {icon}
      <Text variant="label" className={selected ? "text-accent" : "text-ink"}>{label}</Text>
    </PressableScale>
  );
}
```

(The select-pop spring goes; press-scale from PressableScale is the feedback.)

- [ ] **Step 5: ProgressBar — animated fill styled via style prop only**

Replace the entire file:

```tsx
// mobile/components/ui/ProgressBar.tsx
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";

export function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  const p = useSharedValue(progress);
  useEffect(() => { p.value = withSpring(progress, { damping: 18, stiffness: 160 }); }, [progress]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, p.value)) * 100}%` }));
  return (
    <View className={`h-2 rounded-pill bg-surface-2 overflow-hidden ${className ?? ""}`}>
      <Animated.View style={[fill, { height: "100%", borderRadius: 999, backgroundColor: "#E11D48" }]} />
    </View>
  );
}
```

- [ ] **Step 6: onboarding.tsx — move gap off Animated.View**

At `mobile/app/(app)/onboarding.tsx:153` change:

```tsx
<Animated.View key={step} entering={FadeInRight.duration(200)} className="gap-5">
```

to (gap-5 = 20):

```tsx
<Animated.View key={step} entering={FadeInRight.duration(200)} style={{ gap: 20 }}>
```

- [ ] **Step 7: generating.tsx — pulse wrapper styled via style prop**

In `mobile/app/(app)/generating.tsx`:
- Line 6 imports change to include `Animated` default export:

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";
```

- Line 8: remove `AnimatedView` from the `components/ui` import (keep the rest):

```tsx
import { Screen, Text, Button, Icon, SUNSET } from "../../components/ui";
```

- Line 55: change

```tsx
<AnimatedView style={pulseStyle} className="rounded-pill overflow-hidden">
```

to

```tsx
<Animated.View style={[pulseStyle, { borderRadius: 999, overflow: "hidden" }]}>
```

(and its closing tag to `</Animated.View>`).

- [ ] **Step 8: Drop dead exports**

In `mobile/components/ui/index.ts` change:

```ts
export { PressableScale, AnimatedPressable, AnimatedView } from "./PressableScale";
```

to:

```ts
export { PressableScale } from "./PressableScale";
```

- [ ] **Step 9: Verify guard test + full suite + types pass**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all suites PASS (including the new guard test), tsc clean. If any file still imports `AnimatedView`/`AnimatedPressable`, tsc will name it — fix by the same pattern (core component or style prop).

- [ ] **Step 10: Commit**

```bash
git add mobile/lib/noAnimatedClassName.test.ts mobile/components/ui/PressableScale.tsx mobile/components/ui/Chip.tsx mobile/components/ui/ProgressBar.tsx "mobile/app/(app)/onboarding.tsx" "mobile/app/(app)/generating.tsx" mobile/components/ui/index.ts
git commit -m "fix(ui): style touchables via core Pressable — className on reanimated components drops on device

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0006 — trip status lifecycle

**Files:**
- Create: `supabase/migrations/0006_trip_status.sql`

**Interfaces:**
- Produces: `trips.status text not null default 'ready'` (check: `generating|ready|failed`), `trips.error_message text`, `trips.itinerary` now nullable. Tasks 3 and 5 depend on these columns.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0006_trip_status.sql
-- Async generation lifecycle. Existing rows were all created synchronously
-- complete, so the default 'ready' backfills them correctly. itinerary goes
-- nullable because a 'generating' row hasn't got one yet.
alter table public.trips
  add column if not exists status text not null default 'ready'
    check (status in ('generating', 'ready', 'failed')),
  add column if not exists error_message text;
alter table public.trips alter column itinerary drop not null;
```

- [ ] **Step 2: Sanity-check SQL locally (no DB apply yet — deploy is Task 11)**

Run: `cat supabase/migrations/0006_trip_status.sql` and re-read against `0001_init.sql` DDL (`itinerary jsonb not null`).
Expected: statements target existing table/columns; check constraint names nothing already present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_trip_status.sql
git commit -m "feat(db): trip status lifecycle for async generation (migration 0006)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Backend — async start + background pipeline

**Files:**
- Modify: `supabase/functions/generate-itinerary/handler.ts` (split `handleGenerate` → `buildItinerary` + `startGenerate`)
- Modify: `supabase/functions/generate-itinerary/index.ts` (new deps + `EdgeRuntime.waitUntil`)
- Test: `supabase/functions/generate-itinerary/handler_test.ts` (adapt all tests)

**Interfaces:**
- Consumes: migration 0006 columns.
- Produces (handler.ts exports):

```ts
export interface PipelineDeps {
  resolveDestination(opts: { placeId?: string; location: string }): Promise<{ center: { lat: number; lng: number }; viewport: Viewport }>;
  fetchPois(opts: { location: string; kind: Poi["kind"]; prefs: Prefs; locationBias?: { center: { lat: number; lng: number }; radiusKm: number } }): Promise<Poi[]>;
  curate(opts: { pois: Poi[]; prefs: Prefs; tripDays: number }): Promise<Itinerary>;
  orderStops(opts: { stops: Poi[]; anchor: { lat: number; lng: number }; travelMode?: "WALK" | "DRIVE" }): Promise<{ ordered: { placeId: string; travelMinutesFromPrev: number }[]; polyline?: string }>;
  fetchDwell(placeIds: string[]): Promise<Record<string, number>>;
  saveDwell(entries: { placeId: string; minutes: number }[]): Promise<void>;
}
export interface StartDeps extends PipelineDeps {
  countTripsToday(userId: string): Promise<number>;   // implementation must exclude failed rows
  createPendingTrip(opts: { userId: string; req: GenerateRequest }): Promise<string>;
  completeTrip(opts: { tripId: string; itinerary: Itinerary }): Promise<void>;
  failTrip(opts: { tripId: string; message: string }): Promise<void>;
}
export async function buildItinerary(body: GenerateRequest, deps: PipelineDeps): Promise<Itinerary>
export async function startGenerate(body: GenerateRequest, userId: string, deps: StartDeps): Promise<{ status: number; body: unknown; run?: () => Promise<void> }>
```

- `startGenerate` behavior: invalid `tripDays` → `{status:400}` no row; cap hit → `{status:429}` no row; otherwise inserts pending row and returns `{status: 202, body: { tripId }, run}` where `run()` executes the pipeline then `completeTrip` or `failTrip` (never throws).
- `handleGenerate` and old `HandlerDeps`/`saveTrip` are DELETED.

- [ ] **Step 1: Write failing tests for the new shape**

In `handler_test.ts`, replace the `baseDeps` helper and add lifecycle tests. New helper + runner (top of file, replacing the old `baseDeps`):

```ts
import { assertEquals, assert } from "jsr:@std/assert";
import { startGenerate, DAILY_CAP, type StartDeps } from "./handler.ts";
import { CurationError } from "../../_shared/curate.ts";
import type { Poi, Prefs, Itinerary } from "../../_shared/types.ts";
import type { GenerateRequest } from "./handler.ts";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced", transport: "balanced" };
const attractions: Poi[] = [{ placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 }];
const lodging: Poi[] = [{ placeId: "L", name: "Hotel", kind: "lodging", lat: 9, lng: 9, deepLink: "https://book/L" }];
const itinerary: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] };

function baseDeps(over: Partial<StartDeps> = {}): StartDeps {
  return {
    countTripsToday: () => Promise.resolve(0),
    resolveDestination: () => Promise.resolve({ center: { lat: 0, lng: 0 }, viewport: null }),
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : attractions),
    curate: () => Promise.resolve(itinerary),
    orderStops: ({ stops }) => Promise.resolve({ ordered: stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 7 })), polyline: undefined }),
    createPendingTrip: () => Promise.resolve("trip-123"),
    completeTrip: () => Promise.resolve(),
    failTrip: () => Promise.resolve(),
    fetchDwell: () => Promise.resolve({}),
    saveDwell: () => Promise.resolve(),
    ...over,
  };
}

// Start + run to completion, capturing the lifecycle. Old tests that asserted
// on the response itinerary now assert on `completed`.
async function runGenerate(body: GenerateRequest, over: Partial<StartDeps> = {}) {
  let completed: Itinerary | undefined;
  let failure: string | undefined;
  const deps = baseDeps({
    ...over,
    completeTrip: async ({ itinerary: it }) => { completed = it; },
    failTrip: async ({ message }) => { failure = message; },
  });
  const r = await startGenerate(body, "u1", deps);
  if (r.run) await r.run();
  return { status: r.status, body: r.body as { tripId?: string; error?: string }, completed, failure };
}

Deno.test("startGenerate returns 202 with tripId before pipeline work", async () => {
  let pipelineRan = false;
  const deps = baseDeps({ resolveDestination: () => { pipelineRan = true; return Promise.resolve({ center: { lat: 0, lng: 0 }, viewport: null }); } });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 202);
  assertEquals((r.body as { tripId: string }).tripId, "trip-123");
  assertEquals(pipelineRan, false);
  assert(r.run);
  await r.run!();
  assertEquals(pipelineRan, true);
});

Deno.test("run() completes the trip with the built itinerary", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs });
  assertEquals(r.status, 202);
  assert(r.completed);
  assertEquals(r.completed!.days.length, 1);
  assertEquals(r.failure, undefined);
});

Deno.test("CurationError fails the trip with a readable message", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs }, { curate: () => Promise.reject(new CurationError("nope")) });
  assertEquals(r.status, 202);
  assertEquals(r.completed, undefined);
  assertEquals(r.failure, "could not build itinerary");
});

Deno.test("unexpected pipeline error fails the trip generically (run never throws)", async () => {
  const r = await runGenerate({ location: "X", tripDays: 1, prefs }, { orderStops: () => Promise.reject(new Error("boom")) });
  assertEquals(r.failure, "itinerary generation failed");
});

Deno.test("daily cap → 429 and no pending row", async () => {
  let created = false;
  const deps = baseDeps({ countTripsToday: () => Promise.resolve(DAILY_CAP), createPendingTrip: () => { created = true; return Promise.resolve("t"); } });
  const r = await startGenerate({ location: "X", tripDays: 1, prefs }, "u1", deps);
  assertEquals(r.status, 429);
  assertEquals(created, false);
  assertEquals(r.run, undefined);
});

Deno.test("invalid tripDays → 400 and no pending row", async () => {
  const r = await startGenerate({ location: "X", tripDays: 0, prefs }, "u1", baseDeps());
  assertEquals(r.status, 400);
  assertEquals(r.run, undefined);
});
```

Then adapt every existing `Deno.test` mechanically: `handleGenerate(body, "u1", deps)` → `runGenerate(body, over)`; assertions on `r.body.itinerary` → on `r.completed`; assertions on `r.status === 200` → `r.status === 202` plus `r.completed` defined; `saveTrip` captures → `createPendingTrip`/`completeTrip` captures. Two worked examples:

Old:
```ts
Deno.test("rejects tripDays < 1", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 0, prefs }, "u1", baseDeps());
  assertEquals(r.status, 400);
});
```
New: covered by the "invalid tripDays" test above — delete the old one.

Old (shape-dependent example — day routing):
```ts
const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps());
const days = (r.body as { itinerary: Itinerary }).itinerary.days;
```
New:
```ts
const r = await runGenerate({ location: "X", tripDays: 1, prefs });
const days = r.completed!.days;
```

Every existing behavioral assertion (meals, dwell, routing, legs, anchors) must survive the conversion — same expected values, new access path.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase && deno test functions/generate-itinerary/handler_test.ts`
Expected: FAIL — `startGenerate`/`StartDeps` not exported.

- [ ] **Step 3: Split the handler**

In `handler.ts`:
- Rename `HandlerDeps` → define `PipelineDeps` + `StartDeps` exactly as in Interfaces above (`PipelineDeps` = old `HandlerDeps` minus `countTripsToday`/`saveTrip`).
- `buildItinerary(body, deps: PipelineDeps): Promise<Itinerary>` = the current `handleGenerate` body from the `resolveDestination` call (current line 59) through the meal layering loop (current line 231), unchanged, but: the `try/catch` around `Promise.all(legPools.map(...curate...))` is REMOVED (let `CurationError` propagate — `startGenerate` maps it), and it ends with `return itinerary;` instead of `saveTrip`.
- New `startGenerate`:

```ts
export async function startGenerate(
  body: GenerateRequest,
  userId: string,
  deps: StartDeps,
): Promise<{ status: number; body: unknown; run?: () => Promise<void> }> {
  if (!body || body.tripDays < 1) {
    return { status: 400, body: { error: "tripDays must be >= 1" } };
  }
  if (body.tripDays > 365) {
    return { status: 400, body: { error: "tripDays must be <= 365" } };
  }
  if ((await deps.countTripsToday(userId)) >= DAILY_CAP) {
    return { status: 429, body: { error: "daily generation limit reached" } };
  }

  const tripId = await deps.createPendingTrip({ userId, req: body });
  // run() never throws: the caller hands it to EdgeRuntime.waitUntil where a
  // rejection would be an unobserved crash. Every failure lands in the trip row.
  const run = async () => {
    try {
      const itinerary = await buildItinerary(body, deps);
      await deps.completeTrip({ tripId, itinerary });
    } catch (e) {
      console.error("generate pipeline failed:", e instanceof Error ? e.stack ?? e.message : e);
      const message = e instanceof CurationError ? "could not build itinerary" : "itinerary generation failed";
      await deps.failTrip({ tripId, message }).catch((err) => console.error("failTrip failed:", err));
    }
  };
  return { status: 202, body: { tripId }, run };
}
```

- Delete `handleGenerate`.

- [ ] **Step 4: Rewire index.ts**

In `index.ts`:
- Import `startGenerate, type GenerateRequest, type StartDeps` instead of `handleGenerate`/`HandlerDeps`.
- `countTripsToday` adds `.neq("status", "failed")` after `.gte(...)` (failed attempts don't eat the cap).
- Replace `saveTrip` with:

```ts
createPendingTrip: async ({ userId: uid, req: r }) => {
  const { data, error } = await admin
    .from("trips")
    .insert({
      user_id: uid,
      location: r.location,
      prefs: r.prefs,
      itinerary: null,
      status: "generating",
      start_date: r.startDate ?? null,
      end_date: r.endDate ?? null,
      trip_type: r.tripType ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
},
completeTrip: async ({ tripId, itinerary }) => {
  const { error } = await admin.from("trips").update({ itinerary, status: "ready", error_message: null }).eq("id", tripId);
  if (error) throw error;
},
failTrip: async ({ tripId, message }) => {
  await admin.from("trips").update({ status: "failed", error_message: message }).eq("id", tripId);
},
```

- Replace the final try/catch dispatch with:

```ts
try {
  const result = await startGenerate(body, userId, deps);
  if (result.run) {
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(result.run());
    else result.run(); // local dev fallback: fire-and-forget
  }
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
} catch (e) {
  console.error("generate-itinerary failed:", e instanceof Error ? e.stack ?? e.message : e);
  return new Response(JSON.stringify({ error: "itinerary generation failed" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
```

- [ ] **Step 5: Run backend tests**

Run: `cd supabase && deno test`
Expected: all PASS (new lifecycle tests + every adapted behavioral test).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-itinerary/
git commit -m "feat(generate): async start — 202 + tripId, pipeline in EdgeRuntime.waitUntil, status on trip row

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Backend — sparse-pool degradation

**Files:**
- Modify: `supabase/_shared/legs.ts` (add `effectiveTripDays`)
- Modify: `supabase/functions/generate-itinerary/handler.ts` (`buildItinerary` re-plans legs from the pooled count)
- Test: `supabase/_shared/legs_test.ts`, `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Produces: `effectiveTripDays(poolSize: number, tripDays: number): number` in `_shared/legs.ts`.
- Behavior change: `buildItinerary` curates `min(requestedDays, floor(pool/2), ≥1)` days and collapses multi-leg splits when `pool < 8 × legs`. The itinerary may have fewer days than requested — Task 8 surfaces that on the client.

- [ ] **Step 1: Write failing unit tests**

Append to `supabase/_shared/legs_test.ts`:

```ts
Deno.test("effectiveTripDays caps days at floor(pool/2), min 1", () => {
  assertEquals(effectiveTripDays(40, 12), 12);  // plenty
  assertEquals(effectiveTripDays(10, 12), 5);   // sparse: 10 pois → 5 days
  assertEquals(effectiveTripDays(1, 12), 1);    // never 0
  assertEquals(effectiveTripDays(0, 3), 1);
  assertEquals(effectiveTripDays(6, 2), 2);     // never exceeds request
});
```

(add `effectiveTripDays` to the file's import from `./legs.ts`.)

Append to `handler_test.ts` (uses `runGenerate` from Task 3):

```ts
function manyPois(n: number): Poi[] {
  return Array.from({ length: n }, (_, i) => ({ placeId: `P${i}`, name: `P${i}`, kind: "attraction" as const, lat: i * 0.01, lng: 0 }));
}

Deno.test("sparse pool: 4 attractions + 12 requested days curates 2 days in one leg", async () => {
  const curateCalls: number[] = [];
  const pool = manyPois(4);
  const fakeItin = (days: number): Itinerary => ({
    days: Array.from({ length: days }, (_, i) => ({ day: i + 1, lodgingPlaceId: null, stops: [{ placeId: `P${i}`, name: `P${i}`, blurb: "x" }] })),
  });
  const r = await runGenerate({ location: "X", tripDays: 12, prefs }, {
    fetchPois: ({ kind }) => Promise.resolve(kind === "attraction" ? pool : []),
    curate: ({ tripDays }) => { curateCalls.push(tripDays); return Promise.resolve(fakeItin(tripDays)); },
  });
  assertEquals(curateCalls, [2]);            // one leg, 2 days — not planLegs(12) = [6,6]
  assertEquals(r.completed!.days.length, 2);
});

Deno.test("rich pool keeps multi-leg split for long trips", async () => {
  const curateCalls: number[] = [];
  const pool = manyPois(40);
  const fakeItin = (days: number, offset: number): Itinerary => ({
    days: Array.from({ length: days }, (_, i) => ({ day: i + 1, lodgingPlaceId: null, stops: [{ placeId: `P${offset + i}`, name: "p", blurb: "x" }] })),
  });
  let call = 0;
  const r = await runGenerate({ location: "X", tripDays: 12, prefs }, {
    resolveDestination: () => Promise.resolve({ center: { lat: 5, lng: 5 }, viewport: { low: { lat: 0, lng: 0 }, high: { lat: 10, lng: 10 } } }),
    fetchPois: ({ kind }) => Promise.resolve(kind === "attraction" ? pool : []),
    curate: ({ tripDays }) => { curateCalls.push(tripDays); return Promise.resolve(fakeItin(tripDays, 20 * call++)); },
  });
  assertEquals(curateCalls.length, 2);       // still [6,6]
  assertEquals(curateCalls[0] + curateCalls[1], 12);
  assertEquals(r.completed!.days.length, 12);
});
```

(Adjust the fake itinerary placeIds if `sanitize`/`assignDays` drops unknown ids — stops must come from the fetched pool, which `manyPois` guarantees.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase && deno test _shared/legs_test.ts functions/generate-itinerary/handler_test.ts`
Expected: FAIL — `effectiveTripDays` not exported; sparse test sees `curateCalls` `[6,6]`.

- [ ] **Step 3: Implement**

In `legs.ts`:

```ts
// Sparse destinations can't fill every requested day — a day needs ~2
// attractions minimum. Never 0, never more than asked.
export function effectiveTripDays(poolSize: number, tripDays: number): number {
  return Math.min(tripDays, Math.max(1, Math.floor(poolSize / 2)));
}
```

In `buildItinerary` (handler.ts): the initial `planLegs(body.tripDays)`/`legCenters` stay as the FETCH plan (bias circles). After the dedupe loop builds `pois`, re-plan from reality before partitioning:

```ts
// Re-plan from the pool we actually got: sparse destinations cap the days
// (~2 attractions minimum per day), and a leg is only worth its own curation
// with ~8 attractions to choose from.
const plannedDays = effectiveTripDays(pois.length, body.tripDays);
let finalLegSizes = planLegs(plannedDays);
if (pois.length < 8 * finalLegSizes.length) finalLegSizes = [plannedDays];
const finalCenters = legCenters({ center: dest.center, viewport: dest.viewport, legs: finalLegSizes.length, tripType });
const finalMultiLeg = finalLegSizes.length > 1;
const legPools = finalMultiLeg
  ? (hasCenter ? partitionByNearest(pois, finalCenters) : splitRoundRobin(pois, finalLegSizes.length))
  : [pois];
```

Downstream references switch to the final plan: the curation `Promise.all` uses `finalLegSizes[i]`, the `assignDays` loop uses `finalLegSizes[i]` and `tripType: finalMultiLeg ? undefined : tripType`. Import `effectiveTripDays` from `../../_shared/legs.ts`.

- [ ] **Step 4: Run backend tests**

Run: `cd supabase && deno test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/legs.ts supabase/_shared/legs_test.ts supabase/functions/generate-itinerary/handler.ts supabase/functions/generate-itinerary/handler_test.ts
git commit -m "feat(generate): degrade gracefully on sparse POI pools — cap days, collapse legs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Client — start + poll + status-aware trips

**Files:**
- Modify: `mobile/lib/api.ts` (`generateItinerary` returns `{tripId}`; add `waitForTrip`)
- Modify: `mobile/lib/trips.ts` (status columns, ready filters, `getTripStatus`)
- Modify: `mobile/lib/useGenerateItinerary.ts` (orchestrate start → poll → fetch)
- Test: `mobile/lib/api.test.ts`, `mobile/lib/trips.test.ts`

**Interfaces:**
- Consumes: edge fn 202 `{tripId}` (Task 3), `trips.status`/`error_message` (Task 2).
- Produces:

```ts
// api.ts
export interface StartGenerateResult { tripId: string }
export async function generateItinerary(opts: { req: GenerateRequest; accessToken: string; baseUrl: string; fetchImpl?: typeof fetch }): Promise<StartGenerateResult>
export interface TripGenStatus { status: "generating" | "ready" | "failed"; errorMessage?: string }
export async function waitForTrip(opts: { getStatus: () => Promise<TripGenStatus | null>; intervalMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void> }): Promise<void>
// GenerateResult { tripId, itinerary } unchanged — still the mutation result, so generating.tsx/itinerary.tsx don't change.

// trips.ts
export type TripStatus = "generating" | "ready" | "failed";
export async function getTripStatus(client: SupabaseClient, id: string): Promise<{ status: TripStatus; errorMessage?: string } | null>
// listTrips/getTrip return only status='ready' rows (old rows default 'ready').
```

- [ ] **Step 1: Write failing tests**

`api.test.ts` — update the existing `generateItinerary` success test to the new shape, add `waitForTrip` tests:

```ts
it("returns tripId from a 202 start response", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tripId: "t9" }),
  }) as unknown as typeof fetch;
  const out = await generateItinerary({ req, accessToken: "tok", baseUrl: "http://x", fetchImpl });
  expect(out).toEqual({ tripId: "t9" });
});

const noSleep = () => Promise.resolve();

test("waitForTrip resolves when status flips to ready", async () => {
  const statuses = [{ status: "generating" as const }, { status: "generating" as const }, { status: "ready" as const }];
  let i = 0;
  await expect(waitForTrip({ getStatus: async () => statuses[i++], sleep: noSleep })).resolves.toBeUndefined();
  expect(i).toBe(3);
});

test("waitForTrip throws ApiError with row message on failed", async () => {
  await expect(
    waitForTrip({ getStatus: async () => ({ status: "failed", errorMessage: "could not build itinerary" }), sleep: noSleep }),
  ).rejects.toMatchObject({ status: 502, message: "could not build itinerary" });
});

test("waitForTrip times out with 408", async () => {
  await expect(
    waitForTrip({ getStatus: async () => ({ status: "generating" }), sleep: noSleep, intervalMs: 1000, maxMs: 3000 }),
  ).rejects.toMatchObject({ status: 408 });
});

test("waitForTrip tolerates a null row (created but not yet visible)", async () => {
  const seq: (TripGenStatus | null)[] = [null, { status: "ready" }];
  let i = 0;
  await expect(waitForTrip({ getStatus: async () => seq[i++], sleep: noSleep })).resolves.toBeUndefined();
});
```

(reuse the file's existing `req` fixture; import `waitForTrip`, `type TripGenStatus`.)

`trips.test.ts` — the query chains change: `listTrips` becomes `select().eq().order()`, `getTrip` becomes `select().eq().eq().maybeSingle()`. Update the helpers and add status coverage:

```ts
function listClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ order: async () => result }) }) }),
  } as unknown as SupabaseClient;
}

function getClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }),
  } as unknown as SupabaseClient;
}

function statusClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }),
  } as unknown as SupabaseClient;
}

test("getTripStatus maps row", async () => {
  const s = await getTripStatus(statusClient({ data: { status: "failed", error_message: "boom" }, error: null }), "t1");
  expect(s).toEqual({ status: "failed", errorMessage: "boom" });
});

test("getTripStatus null when row missing", async () => {
  expect(await getTripStatus(statusClient({ data: null, error: null }), "t1")).toBeNull();
});

test("getTripStatus defaults pre-migration rows to ready", async () => {
  const s = await getTripStatus(statusClient({ data: { status: null, error_message: null }, error: null }), "t1");
  expect(s).toEqual({ status: "ready", errorMessage: undefined });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest lib/api.test.ts lib/trips.test.ts`
Expected: FAIL — `waitForTrip`/`getTripStatus` not exported; old-shape `generateItinerary` test fails; chain mocks mismatch.

- [ ] **Step 3: Implement api.ts**

Keep `ApiError`, `GenerateRequest`, `GenerateResult`. Change `generateItinerary`'s return type/annotation to `Promise<StartGenerateResult>` (fetch/error handling identical — the success body is now `{ tripId }`). Add:

```ts
export interface StartGenerateResult { tripId: string }

export interface TripGenStatus { status: "generating" | "ready" | "failed"; errorMessage?: string }

// Poll until the background pipeline lands. The row may briefly be invisible
// right after the 202 (read-after-write lag) — treat null as "keep waiting".
export async function waitForTrip(opts: {
  getStatus: () => Promise<TripGenStatus | null>;
  intervalMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxMs = opts.maxMs ?? 300_000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let waited = 0; waited <= maxMs; waited += intervalMs) {
    const s = await opts.getStatus();
    if (s?.status === "ready") return;
    if (s?.status === "failed") throw new ApiError(502, s.errorMessage ?? "could not build itinerary");
    await sleep(intervalMs);
  }
  throw new ApiError(408, "Still building — check Your Trips in a minute.");
}
```

- [ ] **Step 4: Implement trips.ts changes**

- `TripRow` gains `status: string | null; error_message: string | null` (add to both selects' column lists: `status`); `TripSummary` unchanged (list/get only ever return ready rows).
- `listTrips`: `.select("id, location, itinerary, created_at, start_date, end_date, trip_type").eq("status", "ready").order(...)`.
- `getTrip`: `.eq("id", id).eq("status", "ready").maybeSingle()`.
- Add:

```ts
export type TripStatus = "generating" | "ready" | "failed";

export async function getTripStatus(
  client: SupabaseClient,
  id: string,
): Promise<{ status: TripStatus; errorMessage?: string } | null> {
  const { data, error } = await client.from("trips").select("status, error_message").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { status: string | null; error_message: string | null };
  const status = row.status === "generating" || row.status === "failed" ? row.status : "ready";
  return { status, errorMessage: row.error_message ?? undefined };
}
```

- [ ] **Step 5: Implement useGenerateItinerary orchestration**

Replace the mutationFn:

```ts
import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import Constants from "expo-constants";
import { generateItinerary, waitForTrip, ApiError, type GenerateRequest, type GenerateResult } from "./api";
import { getTrip, getTripStatus } from "./trips";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

const extra = Constants.expoConfig?.extra as { supabaseUrl: string };

export function useGenerateItinerary(): UseMutationResult<GenerateResult, ApiError, GenerateRequest> {
  const { session } = useAuth();
  return useMutation<GenerateResult, ApiError, GenerateRequest>({
    mutationFn: async (req) => {
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("not authenticated");
      const { tripId } = await generateItinerary({ req, accessToken, baseUrl: extra.supabaseUrl });
      await waitForTrip({ getStatus: () => getTripStatus(supabase, tripId) });
      const trip = await getTrip(supabase, tripId);
      if (!trip) throw new ApiError(500, "trip missing after generation");
      return { tripId, itinerary: trip.itinerary };
    },
  });
}
```

(`generating.tsx` and `itinerary.tsx` consume `flow.status`/`flow.data` unchanged — no edits there.)

- [ ] **Step 6: Run full mobile suite + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: all PASS. If other tests mock the old `select().order()` chain (e.g. postAuth tests via `listTrips`), update those mocks with the same `eq`-inserted chain.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/api.ts mobile/lib/api.test.ts mobile/lib/trips.ts mobile/lib/trips.test.ts mobile/lib/useGenerateItinerary.ts
git commit -m "feat(client): async generation — start returns tripId, poll trip row, ready-only trip queries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Autocomplete — drop whitespace-only suggestions

**Files:**
- Modify: `mobile/lib/placesClient.ts:25`
- Modify: `supabase/functions/places-autocomplete/handler.ts`
- Test: `mobile/lib/placesClient.test.ts`, `supabase/functions/places-autocomplete/handler_test.ts`

**Interfaces:** none new — same shapes, tighter filtering.

- [ ] **Step 1: Write failing tests**

`placesClient.test.ts`, extend the existing "drops suggestions with empty text or placeId" test's fixture with a whitespace row:

```ts
{ text: "   ", placeId: "p3" },
```

and assert it is absent from the output (output stays `[{ text: "Japan", placeId: "p2", types: [] }]`).

`places-autocomplete/handler_test.ts`, add:

```ts
Deno.test("filters blank suggestions from upstream", async () => {
  const deps = {
    search: () => Promise.resolve([
      { text: "  ", placeId: "p1", types: [] },
      { text: "Kyoto, Japan", placeId: "p2", types: ["locality"] },
      { text: "No id", placeId: "", types: [] },
    ]),
  };
  const r = await handleAutocomplete({ query: "Kyo" }, deps);
  assertEquals(r.status, 200);
  assertEquals((r.body as { suggestions: unknown[] }).suggestions, [{ text: "Kyoto, Japan", placeId: "p2", types: ["locality"] }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mobile && npx jest lib/placesClient.test.ts` and `cd supabase && deno test functions/places-autocomplete/handler_test.ts`
Expected: both FAIL (whitespace row passes through).

- [ ] **Step 3: Implement**

`placesClient.ts:25`:

```ts
.filter((s) => s.text.trim().length > 0 && s.placeId); // never render an icon-only row
```

`places-autocomplete/handler.ts`, in the success path:

```ts
const suggestions = (await deps.search(query, body?.addresses))
  .filter((s) => s.text?.trim() && s.placeId);
return { status: 200, body: { suggestions } };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mobile && npx jest lib/placesClient.test.ts && cd ../supabase && deno test functions/places-autocomplete/handler_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/placesClient.ts mobile/lib/placesClient.test.ts supabase/functions/places-autocomplete/
git commit -m "fix(autocomplete): drop whitespace-only suggestions on both sides

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Dates step — per-type copy, one day-count

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx` (PROMPTS.dates, subtitle render, dates page block)

**Interfaces:** none — copy/layout only.

- [ ] **Step 1: Per-type subtitle**

In `PROMPTS`, change the `dates` entry to `{ title: "When?" }` (drop the static sub). In the component body (near `const prompt = PROMPTS[page];`) add:

```ts
const datesSub = state.tripType === "round"
  ? "Pick start and end days — you'll loop back to where you began."
  : "Pick start and end days — you'll end in a different area.";
```

Change the subtitle render from:

```tsx
{prompt.sub ? <Text variant="body" className="text-ink-muted">{prompt.sub}</Text> : null}
```

to:

```tsx
{page === "dates" ? (
  <Text variant="body" className="text-ink-muted">{datesSub}</Text>
) : prompt.sub ? (
  <Text variant="body" className="text-ink-muted">{prompt.sub}</Text>
) : null}
```

- [ ] **Step 2: Remove the duplicate day-count line**

In the `page === "dates"` block, replace the trailing conditional (the `state.startDate && state.endDate ? <Text ...Jul 3 → Jul 10 · 8 days...> : <Text ...Tap a start day...>` block) with only the empty-state hint — the calendar's own pill already shows the count:

```tsx
{!state.startDate || !state.endDate ? (
  <Text variant="caption" className="text-center">Tap a start day, then an end day</Text>
) : null}
```

(`formatShort` stays imported — the review row still uses it. `days` variable stays — review row + `buildRequest` use it.)

- [ ] **Step 3: Verify suite + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: PASS (this screen has no jest coverage; tsc catches slips).

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): trip-type-aware dates copy, single day-count display

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Itinerary — honest short-plan notice

**Files:**
- Modify: `mobile/app/(app)/itinerary.tsx`

**Interfaces:**
- Consumes: Task 4's behavior (itinerary may have fewer days than the requested date range), `inclusiveDayCount` from `lib/dates`.

- [ ] **Step 1: Compute requested vs planned days**

In `itinerary.tsx`, next to the existing `startDate` line (~line 102), add:

```ts
const endDate = tripId ? tripQuery.data?.endDate : flow.lastRequest?.endDate;
const requestedDays = startDate && endDate ? inclusiveDayCount(startDate, endDate) : null;
```

(add `inclusiveDayCount` to the existing `lib/dates` import.)

- [ ] **Step 2: Render the notice**

Directly after `<Toggle />` in the return:

```tsx
{requestedDays != null && requestedDays > days.length ? (
  <Text variant="caption" className="text-center mb-2">
    Only enough local highlights for {days.length} full {days.length === 1 ? "day" : "days"} — shorter than your dates.
  </Text>
) : null}
```

- [ ] **Step 3: Verify suite + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/itinerary.tsx"
git commit -m "feat(itinerary): notice when sparse destination yields fewer days than requested

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Pinned CTA bar

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx` (footer)
- Modify: `mobile/app/(app)/generating.tsx` (error-state footer)

**Interfaces:** none.

- [ ] **Step 1: Onboarding footer becomes an anchored bar**

Import the inset hook (top of file):

```ts
import { useSafeAreaInsets } from "react-native-safe-area-context";
```

In the component: `const insets = useSafeAreaInsets();`

Change the footer wrapper (currently `<View className="gap-2 pt-3">`) to:

```tsx
<View
  className="gap-2 pt-3 border-t border-border bg-bg -mx-6 px-6"
  style={{ paddingBottom: Math.max(insets.bottom, 12) }}
>
```

(`-mx-6/px-6` stretch the hairline across the Screen's horizontal padding so it reads as a full-width bar.)

- [ ] **Step 2: Same treatment on the generating error footer**

In `generating.tsx`, add the same import + `const insets = useSafeAreaInsets();` (inside the component, before the early return), and change the error-state footer `<View className="gap-3 pb-2">` to:

```tsx
<View className="gap-3 pt-3 border-t border-border bg-bg -mx-6 px-6" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
```

- [ ] **Step 3: Verify suite + types**

Run: `cd mobile && npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(app)/onboarding.tsx" "mobile/app/(app)/generating.tsx"
git commit -m "feat(ui): anchored CTA bar — hairline, solid bg, safe-area bottom padding

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Gradient discipline

**Files:**
- Modify: `mobile/app/(auth)/email.tsx:98,100`

**Interfaces:** none.

- [ ] **Step 1: Demote the OTP buttons to solid primary**

Gradient is reserved for one hero action per flow (welcome CTA, home "Plan a trip", "Generate my trip"). In `email.tsx`, remove `variant="gradient"` from both buttons (primary is the default):

```tsx
<Button title="Send code" size="lg" disabled={!emailOk} loading={busy} onPress={send} />
```

```tsx
<Button title="Verify" size="lg" disabled={code.length !== 6} loading={busy} onPress={verify} />
```

- [ ] **Step 2: Verify + commit**

Run: `cd mobile && npm test && npx tsc --noEmit` → PASS.

```bash
git add "mobile/app/(auth)/email.tsx"
git commit -m "style(auth): solid primary OTP buttons — gradient reserved for flow heroes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Merge, deploy, OTA, device smoke

**Files:** none new.

- [ ] **Step 1: Full verification on the branch**

Run: `cd mobile && npm test && npx tsc --noEmit && cd ../supabase && deno test`
Expected: everything green.

- [ ] **Step 2: Merge to main** (superpowers:finish-branch workflow — merge `render-fix-hardening` → `main`; push only if the user asks)

- [ ] **Step 3: Apply migration + deploy functions**

```bash
cd /home/myen/tour
supabase db push
supabase functions deploy generate-itinerary places-autocomplete
```

Expected: migration 0006 applied; both functions deployed.
Note: from this moment the OLD JS on the device gets `{tripId}` without an itinerary and will error on generate — publish the OTA immediately after.

- [ ] **Step 4: Publish OTA update**

```bash
cd mobile && eas update
```

(match the branch/channel of the installed binary when prompted). Device picks it up on the second launch after the update.

- [ ] **Step 5: Device smoke checklist (user)**

- Continue button: visible crimson pill on every onboarding step; dimmed at 50% when step incomplete.
- Budget/pace/transport: bordered option cards with soft-pink selected fill + crimson border + right-aligned check.
- Interests: pill chips with borders; selected = pink fill + crimson text.
- Destination suggestions: horizontal rows (pin left, text right), no icon-only rows.
- Progress bar fills crimson as steps advance.
- "Plan a trip" / "Generate my trip": full-height gradient pill.
- Dates: subtitle changes with Round trip / One way toggle; single day-count pill.
- Generate 12-day Portola Valley trip: 202-fast start, generating screen polls, itinerary arrives (fewer days + notice) — no timeout error.
- Kill the app mid-generation, reopen: trip appears in Your Trips when done.
- Failed generation shows readable message with Try again / Edit trip on the anchored bar.

- [ ] **Step 6: Update memory**

Update `nativewind-cssinterop-device-bug` memory (fix shipped) and add plan-state note per the established pattern.
