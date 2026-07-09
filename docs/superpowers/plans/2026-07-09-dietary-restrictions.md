# Dietary Restrictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect dietary restrictions in onboarding and make restaurant search honor them (hard-filter allergies, soft-hint lifestyle).

**Architecture:** `prefs.diet: string[]` already exists in both type files and is already injected into the LLM prompt. Wire it end-to-end: (1) backend `fetchPois` reads `prefs.diet` for food searches and applies hybrid empty-pool logic; (2) mobile onboarding collects it; (3) mobile `prefsFromState` stops dropping it.

**Tech Stack:** Deno + TypeScript (Supabase edge / shared), Expo React Native + NativeWind (mobile), deno test + jest.

## Global Constraints

- Diet terms are lowercase strings; `"No restrictions"` = empty array (no sentinel string).
- Allergy terms are hard (empty pool → no fallback); lifestyle + free-text are soft (empty pool → plain restaurant re-query).
- `ALLERGY_SET = {"gluten-free","dairy-free","nut allergy","shellfish allergy"}`.
- Lifestyle presets: Vegetarian, Vegan, Pescatarian, Halal, Kosher.
- `fetchPois` already receives `prefs` — do NOT add a new param; read `prefs.diet`.
- Backend tests: `deno test <path>`. Mobile tests: `npm test` (run from `mobile/`).
- Follow existing chip/toggle UI patterns in `onboarding.tsx`; no raw RN primitives.

---

## File Structure

- `supabase/_shared/places.ts` — MODIFY: diet-aware food query + hybrid empty-pool.
- `supabase/_shared/places_test.ts` — MODIFY: add diet cases.
- `mobile/lib/onboarding.ts` — MODIFY: diet in state + prefs mapping + `DIET_LIFESTYLE`/`DIET_ALLERGY` constants + `STEPS` insert.
- `mobile/lib/onboarding.test.ts` — CREATE or MODIFY: diet mapping tests.
- `mobile/app/(app)/onboarding.tsx` — MODIFY: diet page + review row.

---

### Task 1: Diet-aware food search (backend)

**Files:**
- Modify: `supabase/_shared/places.ts`
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Consumes: existing `fetchPois(opts)` where `opts.prefs: Prefs` (Prefs has optional `diet?: string[]`).
- Produces: same `fetchPois` signature (unchanged); new exported `const ALLERGY_SET: Set<string>` and `export function foodTextQuery(location: string, dietTerms: string[]): string`.

- [ ] **Step 1: Write failing tests**

Add to `supabase/_shared/places_test.ts` (import `foodTextQuery, ALLERGY_SET` from `./places.ts`):

```ts
import { assertEquals } from "jsr:@std/assert";
import { fetchPois, foodTextQuery, ALLERGY_SET } from "./places.ts";
import type { HttpFetch, Prefs } from "./types.ts";

const basePrefs: Prefs = { interests: [], budget: "high", pace: "balanced", transport: "balanced" };

Deno.test("foodTextQuery folds diet terms before 'restaurant'", () => {
  assertEquals(foodTextQuery("Kyoto", ["vegan", "gluten-free"]), "vegan gluten-free restaurant in Kyoto");
  assertEquals(foodTextQuery("Kyoto", []), "restaurant in Kyoto");
});

Deno.test("ALLERGY_SET holds the four allergy terms", () => {
  assertEquals(ALLERGY_SET.has("nut allergy"), true);
  assertEquals(ALLERGY_SET.has("vegan"), false);
});

function stubFetch(placesByCall: unknown[][]): { fn: HttpFetch; queries: string[] } {
  const queries: string[] = [];
  let call = 0;
  const fn: HttpFetch = (_url, init) => {
    queries.push(JSON.parse(String(init?.body)).textQuery);
    const places = placesByCall[Math.min(call, placesByCall.length - 1)];
    call++;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ places }) } as Response);
  };
  return { fn, queries };
}

Deno.test("food + allergy + empty pool → [] (no fallback)", async () => {
  const { fn, queries } = stubFetch([[]]);
  const out = await fetchPois({ location: "Nowhere", kind: "food", prefs: { ...basePrefs, diet: ["nut allergy"] }, httpFetch: fn, apiKey: "k" });
  assertEquals(out, []);
  assertEquals(queries.length, 1);
  assertEquals(queries[0], "nut allergy restaurant in Nowhere");
});

Deno.test("food + lifestyle-only + empty pool → re-query plain restaurant", async () => {
  const place = { id: "p1", displayName: { text: "Bistro" }, location: { latitude: 1, longitude: 1 } };
  const { fn, queries } = stubFetch([[], [place]]);
  const out = await fetchPois({ location: "Town", kind: "food", prefs: { ...basePrefs, diet: ["vegan"] }, httpFetch: fn, apiKey: "k" });
  assertEquals(out.length, 1);
  assertEquals(queries[0], "vegan restaurant in Town");
  assertEquals(queries[1], "restaurant in Town");
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `deno test supabase/_shared/places_test.ts`
Expected: FAIL — `foodTextQuery`/`ALLERGY_SET` not exported; diet not used.

- [ ] **Step 3: Implement in `places.ts`**

Add near the top (after `TYPE_QUERY`):

```ts
export const ALLERGY_SET = new Set(["gluten-free", "dairy-free", "nut allergy", "shellfish allergy"]);

export function foodTextQuery(location: string, dietTerms: string[]): string {
  const prefix = dietTerms.length ? `${dietTerms.join(" ")} ` : "";
  return `${prefix}restaurant in ${location}`;
}
```

In `fetchPois`, replace the `textQuery` line in `body`:

```ts
const dietTerms = opts.kind === "food" ? (opts.prefs.diet ?? []) : [];
const textQuery = opts.kind === "food"
  ? foodTextQuery(location, dietTerms)
  : `${TYPE_QUERY[opts.kind]} in ${location}`;
const body: Record<string, unknown> = { textQuery, maxResultCount: 20 };
```

Just before `if (cache) await cache.write(inRegion); return inRegion;`, add the hybrid fallback:

```ts
// Diet hybrid: an empty food pool with a lifestyle/free-text restriction retries
// once with a plain restaurant query (soft). An allergy restriction does NOT
// fall back — an unsafe suggestion is worse than a meal-gap.
if (opts.kind === "food" && inRegion.length === 0 && dietTerms.length > 0) {
  const hasAllergy = dietTerms.some((t) => ALLERGY_SET.has(t));
  if (!hasAllergy) {
    return await fetchPois({ ...opts, prefs: { ...opts.prefs, diet: [] } });
  }
}
```

(The recursive call passes `diet: []`, so `dietTerms` becomes empty and it cannot recurse again.)

- [ ] **Step 4: Run tests, verify pass**

Run: `deno test supabase/_shared/places_test.ts`
Expected: PASS (all, including pre-existing cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat(places): diet-aware food search with hybrid allergy hard-filter"
```

---

### Task 2: Wire diet through mobile onboarding state

**Files:**
- Modify: `mobile/lib/onboarding.ts`
- Test: `mobile/lib/onboarding.test.ts` (create if absent)

**Interfaces:**
- Consumes: `Prefs.diet?: string[]` (already in `mobile/lib/types.ts`).
- Produces: `OnboardingState.diet: string[]`; `prefsFromState` includes `diet`; `DIET_LIFESTYLE`, `DIET_ALLERGY` exported string arrays; `STEPS` contains `"diet"` between `"interests"` and `"travelParty"`.

- [ ] **Step 1: Write failing test**

Create/append `mobile/lib/onboarding.test.ts`:

```ts
import { prefsFromState, stateFromRequest, stateFromProfile, STEPS, DIET_LIFESTYLE, DIET_ALLERGY } from "./onboarding";

const base = stateFromProfile(null);

test("prefsFromState carries diet", () => {
  expect(prefsFromState({ ...base, diet: ["vegan", "nut allergy"] }).diet).toEqual(["vegan", "nut allergy"]);
});

test("stateFromProfile reads diet (default [])", () => {
  expect(stateFromProfile(null).diet).toEqual([]);
  expect(stateFromProfile({ interests: [], budget: "mid", pace: "balanced", transport: "balanced", diet: ["halal"] }).diet).toEqual(["halal"]);
});

test("stateFromRequest reads diet", () => {
  const req = { location: "X", tripDays: 2, prefs: { interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced", diet: ["kosher"] } } as never;
  expect(stateFromRequest(req).diet).toEqual(["kosher"]);
});

test("diet step sits between interests and travelParty", () => {
  expect(STEPS.indexOf("diet")).toBe(STEPS.indexOf("interests") + 1);
  expect(STEPS.indexOf("diet")).toBeLessThan(STEPS.indexOf("travelParty"));
});

test("diet option sets are non-empty and disjoint", () => {
  expect(DIET_LIFESTYLE.length).toBeGreaterThan(0);
  expect(DIET_ALLERGY.length).toBeGreaterThan(0);
  expect(DIET_LIFESTYLE.some((d) => DIET_ALLERGY.includes(d))).toBe(false);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd mobile && npm test -- onboarding`
Expected: FAIL — `DIET_LIFESTYLE` undefined, `diet` missing on state/prefs, `"diet"` not in STEPS.

- [ ] **Step 3: Implement in `onboarding.ts`**

Add constants near `INTERESTS`:

```ts
export const DIET_LIFESTYLE = ["vegetarian", "vegan", "pescatarian", "halal", "kosher"] as const;
export const DIET_ALLERGY = ["gluten-free", "dairy-free", "nut allergy", "shellfish allergy"] as const;
```

Insert `"diet"` into `STEPS` immediately after `"interests"`:

```ts
"destination", "subDestinations", "dates", "classics", "interests", "diet", "travelParty",
```

Add `diet: string[]` to `OnboardingState`:

```ts
export interface OnboardingState {
  interests: string[];
  diet: string[];
  budget: Prefs["budget"];
  // ...rest unchanged
```

In `stateFromProfile` add `diet: prefs?.diet ?? [],`.
In `stateFromRequest` add `diet: req.prefs.diet ?? [],`.
In `prefsFromState`:

```ts
export function prefsFromState(s: OnboardingState): Prefs {
  return { interests: s.interests, budget: s.budget, pace: s.pace, transport: s.transport, diet: s.diet };
}
```

`canContinue` needs no `diet` case (optional → default `true`).

- [ ] **Step 4: Run test, verify pass**

Run: `cd mobile && npm test -- onboarding`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/onboarding.ts mobile/lib/onboarding.test.ts
git commit -m "feat(onboarding): carry diet through state and generate request"
```

---

### Task 3: Diet onboarding page + review row (UI)

**Files:**
- Modify: `mobile/app/(app)/onboarding.tsx`

**Interfaces:**
- Consumes: `DIET_LIFESTYLE`, `DIET_ALLERGY` from `./lib/onboarding`; `state.diet`; existing `Chip`, `Input`, `Text` from `components/ui`; existing `setState` pattern.
- Produces: a `diet` page render branch + a `toggleDiet` helper + a review summary row.

- [ ] **Step 1: Add `toggleDiet` + free-text state**

Near `toggleInterest` add:

```ts
const [dietDraft, setDietDraft] = useState("");
function toggleDiet(term: string) {
  setState((s) => ({
    ...s,
    diet: s.diet.includes(term) ? s.diet.filter((x) => x !== term) : [...s.diet, term],
  }));
}
function addDietDraft() {
  const t = dietDraft.trim().toLowerCase();
  if (t && !state.diet.includes(t)) setState((s) => ({ ...s, diet: [...s.diet, t] }));
  setDietDraft("");
}
function clearDiet() {
  setState((s) => ({ ...s, diet: [] }));
}
```

Import the constants:

```ts
import { /* existing */, DIET_LIFESTYLE, DIET_ALLERGY } from "../../lib/onboarding";
```

- [ ] **Step 2: Add the page title**

In the page title map (alongside `interests: { title: "What do you love?", ... }`):

```ts
diet: { title: "Any dietary needs?", sub: "Optional — we'll match restaurants." },
```

- [ ] **Step 3: Add the render branch**

Alongside the `interests` render branch (`{page === "interests" ? ( ... ) : null}`), add:

```tsx
{page === "diet" ? (
  <ScrollView contentContainerClassName="gap-4">
    <View className="gap-2">
      <Text variant="label" className="text-ink-muted">Lifestyle</Text>
      <View className="flex-row flex-wrap gap-2">
        {DIET_LIFESTYLE.map((d) => (
          <Chip key={d} label={d} selected={state.diet.includes(d)} onPress={() => toggleDiet(d)} />
        ))}
      </View>
    </View>
    <View className="gap-2">
      <Text variant="label" className="text-ink-muted">Allergies</Text>
      <View className="flex-row flex-wrap gap-2">
        {DIET_ALLERGY.map((d) => (
          <Chip key={d} label={d} selected={state.diet.includes(d)} onPress={() => toggleDiet(d)} />
        ))}
      </View>
    </View>
    {state.diet.filter((d) => !DIET_LIFESTYLE.includes(d as never) && !DIET_ALLERGY.includes(d as never)).length > 0 ? (
      <View className="flex-row flex-wrap gap-2">
        {state.diet
          .filter((d) => !DIET_LIFESTYLE.includes(d as never) && !DIET_ALLERGY.includes(d as never))
          .map((d) => (
            <Chip key={d} label={d} selected onPress={() => toggleDiet(d)} />
          ))}
      </View>
    ) : null}
    <View className="flex-row gap-2 items-center">
      <View className="flex-1">
        <Input value={dietDraft} onChangeText={setDietDraft} placeholder="Add your own…" onSubmitEditing={addDietDraft} returnKeyType="done" />
      </View>
      <Button title="Add" variant="secondary" onPress={addDietDraft} />
    </View>
    <Pressable onPress={clearDiet} hitSlop={8}>
      <Text variant="label" className={state.diet.length === 0 ? "text-accent" : "text-ink-muted"}>No restrictions</Text>
    </Pressable>
  </ScrollView>
) : null}
```

(If `Button` has no `variant` prop, use the existing secondary style used elsewhere; check `components/ui`.)

- [ ] **Step 4: Add the review summary row**

In the review summary rows list (alongside the Interests row at the `review` step), add:

```ts
{ label: "Dietary", value: state.diet.length ? state.diet.join(", ") : "No restrictions", step: STEPS.indexOf("diet") },
```

- [ ] **Step 5: Typecheck + run app path**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.
Then verify via the run skill / device: onboarding shows the diet step after interests; toggling chips, adding a custom term, and "No restrictions" all update; the review row reflects the choice.

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(app)/onboarding.tsx"
git commit -m "feat(onboarding): dietary restrictions step (lifestyle, allergies, custom)"
```

---

## Self-Review

- **Spec coverage:** Collection (Task 2/3), lifestyle+allergy+none+free-text (Task 3), hybrid enforcement (Task 1), LLM prompt already carries diet (no task needed). ✓
- **Placeholder scan:** none — all code shown.
- **Type consistency:** `diet: string[]` on state; `prefsFromState`→`Prefs.diet`; `foodTextQuery`/`ALLERGY_SET` names match across Task 1 test + impl. ✓
- **Note:** confirm `Chip`, `Input`, `Button` prop names against `mobile/components/ui` before wiring Task 3 (adjust `variant`/`onPress` to actual API).
