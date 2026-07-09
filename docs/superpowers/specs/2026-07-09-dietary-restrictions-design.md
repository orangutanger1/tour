# Dietary restrictions — design

**Date:** 2026-07-09
**Status:** Approved, ready for plan
**Build order:** 1 of 3 (A → B → C). Independent; ships on its own.

## Purpose

Let a user declare dietary restrictions during onboarding and have the
generated itinerary's restaurant picks respect them. Backend already accepts
`prefs.diet: string[]` and injects it into the LLM prompt (`llm.ts:14`), but
nothing collects it in the UI and nothing hard-filters restaurant search.

## Enforcement model — hybrid

- **Allergies** (`gluten-free`, `dairy-free`, `nut allergy`, `shellfish allergy`)
  are **hard**: if no matching restaurant exists near a meal slot, leave the
  slot as a meal-gap rather than suggest an unsafe fallback.
- **Lifestyle** (`vegetarian`, `vegan`, `pescatarian`, `halal`, `kosher`) and
  **free-text** entries are **soft**: prefer matching spots, but fall back to a
  generic restaurant when the pool is empty (never strand a meal slot).

The distinction is data-driven: a backend `ALLERGY_SET` classifies each term.
Free-text terms are unknown → treated as soft (like lifestyle).

## Data

`prefs.diet: string[]` — already present in both `mobile/lib/types.ts` and
`supabase/_shared/types.ts`. Flat array of lowercase term strings. No schema
change. `"No restrictions"` stores as an empty array (not a sentinel string).

## Components

### 1. Onboarding step (`mobile/app/(app)/onboarding.tsx`)

New one-question page `diet`, inserted after `interests`. Reuses the existing
chip/toggle pattern (`toggleInterest` → `toggleDiet`). Layout:

- **Lifestyle** group: Vegetarian, Vegan, Pescatarian, Halal, Kosher
- **Allergy** group: Gluten-free, Dairy-free, Nut allergy, Shellfish allergy
- **No restrictions** chip — selecting it clears all others; selecting any
  other chip clears it. Mutually exclusive with the rest.
- **Free-text add** — a text input + "add" that appends a custom lowercase term
  chip (removable).

Step is optional (can advance with nothing selected = no restrictions). Add to
the `STEPS` array, the page title map, and the review summary row list.

### 2. Diet-aware food search (`supabase/_shared/places.ts`)

`fetchPois` gains an optional `dietTerms?: string[]` input, used only when
`kind === "food"`:

- Build the food query as `"<diet terms joined> restaurant in <location>"`
  (e.g. `"vegan gluten-free restaurant in Kyoto"`). Non-food kinds ignore it.
- After the existing region/budget filtering, if the food pool is empty **and**
  any term ∈ `ALLERGY_SET`: return `[]` (→ meal-gap downstream). Log it.
- If empty and terms are lifestyle/free-text only: re-query once with the plain
  `"restaurant in <location>"` query (soft fallback) and return that.

Define `const ALLERGY_SET = new Set(["gluten-free","dairy-free","nut allergy","shellfish allergy"])`.

### 3. Thread through the handler (`supabase/functions/generate-itinerary/handler.ts`)

Pass `prefs.diet` as `dietTerms` into the `fetchPois` call(s) that fetch food.
No change to attraction/lodging calls.

## Data flow

onboarding → `prefs.diet` → generate-itinerary request → handler → `fetchPois({kind:"food", dietTerms})` → diet-aware Google Places query → hard/soft empty-pool handling → meals or meal-gaps in the itinerary. LLM prompt already carries diet for blurb tone.

## Error handling

- Empty food pool with an allergy term → meal-gap (existing render path handles
  `kind:"meal-gap"`). No crash, no unsafe pick.
- Soft fallback re-query failure → treat as empty pool (meal-gap). Never throws
  past the existing `fetchPois` error contract.

## Testing

- `places_test.ts`: food query string includes diet terms; allergy empty-pool →
  `[]`; lifestyle empty-pool → generic re-query result; non-food kinds unaffected.
- `handler_test.ts`: `prefs.diet` reaches the food fetch as `dietTerms`.
- Mobile: onboarding diet step toggles, "No restrictions" mutual exclusion,
  free-text add/remove, value persisted into the generate request.

## Out of scope (v1)

Per-restaurant menu verification (Google data can't guarantee it), editing diet
after generation (covered indirectly once Spec B lands), diet filtering of the
nearby map (Spec C v1 is view-only).
