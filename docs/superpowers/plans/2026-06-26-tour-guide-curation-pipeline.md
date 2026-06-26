# Tour Guide — Curation Pipeline (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend engine that turns a location + trip length + preferences into a validated, day-by-day itinerary (real POIs, local-voice blurbs, lodging-anchored ordering).

**Architecture:** Deno/TypeScript modules under `supabase/`, composed by one Supabase edge function. All external services (Google Places, Google Routes, the LLM) and the database are reached through injected dependencies so every module is unit-testable with fakes. The LLM is a provider-neutral seam (`LlmComplete = (prompt) => Promise<string>`): the testable core builds the prompt, parses, sanitizes (drops hallucinated places), and validates; the provider is a thin adapter chosen later by bench test.

**Tech Stack:** Deno, TypeScript, Supabase (Postgres + edge functions), `@supabase/supabase-js`, `@std/assert` for tests. Google Places API (New) and Google Routes API over HTTP.

## Global Constraints

- Runtime: Deno (Supabase edge functions). TypeScript only.
- No new runtime dependencies beyond `jsr:@supabase/supabase-js@2` and `jsr:@std/assert` (tests). No LLM SDK — the curation seam is provider-neutral.
- The LLM is reached only through `LlmComplete = (prompt: string) => Promise<string>`. No provider-specific code outside the (later) adapter.
- Every Google Places request MUST send an `X-Goog-FieldMask` header (unmasked requests are the largest silent cost leak).
- Cap stops per day at 8 (Routes cost is N×N).
- Enforce a per-user daily itinerary-generation cap (default 10).
- Trust boundary: any place ID the LLM returns that is not in the fetched input set MUST be dropped before the itinerary is persisted or returned.
- Itinerary shape is the contract in `types.ts` — all tasks use those exact type names.

---

### Task 1: Core types + itinerary schema (parse / validate / sanitize)

**Files:**
- Create: `supabase/_shared/types.ts`
- Create: `supabase/_shared/schema.ts`
- Test: `supabase/_shared/schema_test.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces:
  - Types: `Prefs`, `Poi`, `Stop`, `ItineraryDay`, `Itinerary`, `LlmComplete`, `HttpFetch`.
  - `parseItinerary(raw: string): Itinerary` — JSON.parse + structural narrowing, throws `Error` on bad input.
  - `validateItinerary(value: unknown, opts: { validPlaceIds: Set<string>; expectedDays: number }): { ok: boolean; errors: string[] }`.
  - `sanitizeItinerary(it: Itinerary, validPlaceIds: Set<string>): Itinerary` — drops stops whose `placeId` is not in the set.

- [ ] **Step 1: Write `types.ts`** (no test — pure type declarations)

```typescript
// supabase/_shared/types.ts
export interface Prefs {
  interests: string[];                 // e.g. ["scenic", "food", "history"]
  budget: "low" | "mid" | "high";
  pace: "relaxed" | "balanced" | "packed";
  diet?: string[];                     // optional, e.g. ["vegetarian"]
  accessibility?: string[];            // optional
}

export interface Poi {
  placeId: string;
  name: string;
  kind: "attraction" | "food" | "lodging";
  lat: number;
  lng: number;
  priceLevel?: number;                 // 0-4
  rating?: number;
  address?: string;
  deepLink?: string;                   // booking/airbnb link for lodging
}

export interface Stop {
  placeId: string;
  name: string;
  blurb: string;                       // "why a local picks this"
  travelMinutesFromPrev?: number;
}

export interface ItineraryDay {
  day: number;                         // 1-indexed
  lodgingPlaceId: string | null;
  stops: Stop[];
}

export interface Itinerary {
  days: ItineraryDay[];
}

export type LlmComplete = (prompt: string) => Promise<string>;
export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;
```

- [ ] **Step 2: Write the failing tests**

```typescript
// supabase/_shared/schema_test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseItinerary, validateItinerary, sanitizeItinerary } from "./schema.ts";
import type { Itinerary } from "./types.ts";

const good: Itinerary = {
  days: [{ day: 1, lodgingPlaceId: "L1", stops: [{ placeId: "A", name: "A", blurb: "Locals love it." }] }],
};

Deno.test("parseItinerary parses valid JSON", () => {
  const it = parseItinerary(JSON.stringify(good));
  assertEquals(it.days.length, 1);
});

Deno.test("parseItinerary throws on non-JSON", () => {
  assertThrows(() => parseItinerary("not json"));
});

Deno.test("parseItinerary throws when days missing", () => {
  assertThrows(() => parseItinerary(JSON.stringify({ foo: 1 })));
});

Deno.test("validateItinerary ok for valid itinerary", () => {
  const r = validateItinerary(good, { validPlaceIds: new Set(["A"]), expectedDays: 1 });
  assertEquals(r.ok, true);
  assertEquals(r.errors, []);
});

Deno.test("validateItinerary flags wrong day count", () => {
  const r = validateItinerary(good, { validPlaceIds: new Set(["A"]), expectedDays: 2 });
  assertEquals(r.ok, false);
});

Deno.test("validateItinerary flags unknown placeId", () => {
  const r = validateItinerary(good, { validPlaceIds: new Set(["B"]), expectedDays: 1 });
  assertEquals(r.ok, false);
});

Deno.test("validateItinerary flags empty day", () => {
  const empty: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [] }] };
  const r = validateItinerary(empty, { validPlaceIds: new Set(), expectedDays: 1 });
  assertEquals(r.ok, false);
});

Deno.test("sanitizeItinerary drops unknown placeIds", () => {
  const dirty: Itinerary = {
    days: [{ day: 1, lodgingPlaceId: null, stops: [
      { placeId: "A", name: "A", blurb: "x" },
      { placeId: "GHOST", name: "Ghost", blurb: "y" },
    ] }],
  };
  const clean = sanitizeItinerary(dirty, new Set(["A"]));
  assertEquals(clean.days[0].stops.map((s) => s.placeId), ["A"]);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `deno test supabase/_shared/schema_test.ts`
Expected: FAIL — `Module not found "./schema.ts"`.

- [ ] **Step 4: Write `schema.ts`**

```typescript
// supabase/_shared/schema.ts
import type { Itinerary } from "./types.ts";

export function parseItinerary(raw: string): Itinerary {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("itinerary: invalid JSON");
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { days?: unknown }).days)) {
    throw new Error("itinerary: missing days array");
  }
  return data as Itinerary;
}

export function validateItinerary(
  value: unknown,
  opts: { validPlaceIds: Set<string>; expectedDays: number },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const it = value as Itinerary;
  if (!it || !Array.isArray(it.days)) {
    return { ok: false, errors: ["days is not an array"] };
  }
  if (it.days.length !== opts.expectedDays) {
    errors.push(`expected ${opts.expectedDays} days, got ${it.days.length}`);
  }
  it.days.forEach((d, i) => {
    if (d.day !== i + 1) errors.push(`day index ${i}: day number ${d.day} not sequential`);
    if (!Array.isArray(d.stops) || d.stops.length === 0) {
      errors.push(`day ${d.day}: no stops`);
    }
    (d.stops ?? []).forEach((s) => {
      if (!opts.validPlaceIds.has(s.placeId)) errors.push(`day ${d.day}: unknown placeId ${s.placeId}`);
      if (!s.blurb || typeof s.blurb !== "string") errors.push(`day ${d.day}: stop ${s.placeId} missing blurb`);
    });
  });
  return { ok: errors.length === 0, errors };
}

export function sanitizeItinerary(it: Itinerary, validPlaceIds: Set<string>): Itinerary {
  return {
    days: it.days.map((d) => ({
      ...d,
      stops: d.stops.filter((s) => validPlaceIds.has(s.placeId)),
    })),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test supabase/_shared/schema_test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/_shared/types.ts supabase/_shared/schema.ts supabase/_shared/schema_test.ts
git commit -m "feat: itinerary types + parse/validate/sanitize"
```

---

### Task 2: LLM prompt builder

**Files:**
- Create: `supabase/_shared/llm.ts`
- Test: `supabase/_shared/llm_test.ts`

**Interfaces:**
- Consumes: `Poi`, `Prefs` from `types.ts`.
- Produces: `buildPrompt(pois: Poi[], prefs: Prefs, tripDays: number): string`.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/_shared/llm_test.ts
import { assert, assertStringIncludes } from "jsr:@std/assert";
import { buildPrompt } from "./llm.ts";
import type { Poi, Prefs } from "./types.ts";

const pois: Poi[] = [
  { placeId: "A1", name: "Old Town", kind: "attraction", lat: 0, lng: 0 },
  { placeId: "F1", name: "Corner Cafe", kind: "food", lat: 0, lng: 0 },
];
const prefs: Prefs = { interests: ["history"], budget: "mid", pace: "balanced" };

Deno.test("buildPrompt mentions trip length", () => {
  assertStringIncludes(buildPrompt(pois, prefs, 3), "3-day");
});

Deno.test("buildPrompt includes the input placeIds", () => {
  const p = buildPrompt(pois, prefs, 2);
  assertStringIncludes(p, "A1");
  assertStringIncludes(p, "F1");
});

Deno.test("buildPrompt forbids inventing places", () => {
  const p = buildPrompt(pois, prefs, 2).toLowerCase();
  assert(p.includes("only") && p.includes("do not invent"));
});

Deno.test("buildPrompt includes preferences", () => {
  assertStringIncludes(buildPrompt(pois, prefs, 2), "history");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: FAIL — `Module not found "./llm.ts"`.

- [ ] **Step 3: Write `llm.ts`**

```typescript
// supabase/_shared/llm.ts
import type { Poi, Prefs } from "./types.ts";

export function buildPrompt(pois: Poi[], prefs: Prefs, tripDays: number): string {
  const poiList = pois.map((p) => ({
    placeId: p.placeId,
    name: p.name,
    kind: p.kind,
    priceLevel: p.priceLevel ?? null,
    rating: p.rating ?? null,
  }));
  const prefLine =
    `interests=${prefs.interests.join(", ") || "any"}; budget=${prefs.budget}; pace=${prefs.pace};` +
    (prefs.diet?.length ? ` diet=${prefs.diet.join(", ")};` : "") +
    (prefs.accessibility?.length ? ` accessibility=${prefs.accessibility.join(", ")};` : "");
  return [
    `You are a local guide planning a ${tripDays}-day trip.`,
    `Traveler preferences: ${prefLine}`,
    `Choose from ONLY these places. Use the exact placeId values. Do not invent places:`,
    JSON.stringify(poiList),
    `Build a ${tripDays}-day plan. Group nearby places into the same day. For each stop write a one-sentence "why a local picks this" blurb.`,
    `Respond with ONLY valid JSON (no markdown fences), matching exactly this shape:`,
    `{"days":[{"day":1,"lodgingPlaceId":null,"stops":[{"placeId":"...","name":"...","blurb":"..."}]}]}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/_shared/llm_test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/llm.ts supabase/_shared/llm_test.ts
git commit -m "feat: provider-neutral LLM prompt builder"
```

---

### Task 3: Curation orchestrator (the trust boundary)

**Files:**
- Create: `supabase/_shared/curate.ts`
- Test: `supabase/_shared/curate_test.ts`

**Interfaces:**
- Consumes: `buildPrompt` (Task 2); `parseItinerary`, `validateItinerary`, `sanitizeItinerary` (Task 1); types `Poi`, `Prefs`, `Itinerary`, `LlmComplete`.
- Produces:
  - `curateItinerary(opts: { pois: Poi[]; prefs: Prefs; tripDays: number; llmComplete: LlmComplete }): Promise<Itinerary>`.
  - `class CurationError extends Error`.

  Behaviour: build prompt → call `llmComplete` → parse → sanitize (drop hallucinated IDs) → validate. On parse error or invalid result, retry once. After two failed attempts, throw `CurationError`.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/_shared/curate_test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { curateItinerary, CurationError } from "./curate.ts";
import type { Poi, Prefs, Itinerary } from "./types.ts";

const pois: Poi[] = [
  { placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 },
  { placeId: "B", name: "B", kind: "food", lat: 0, lng: 0 },
];
const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced" };

function reply(it: unknown): string {
  return JSON.stringify(it);
}
const valid: Itinerary = {
  days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }],
};

Deno.test("curate returns valid itinerary", async () => {
  const it = await curateItinerary({ pois, prefs, tripDays: 1, llmComplete: () => Promise.resolve(reply(valid)) });
  assertEquals(it.days.length, 1);
});

Deno.test("curate drops hallucinated placeIds", async () => {
  const dirty: Itinerary = {
    days: [{ day: 1, lodgingPlaceId: null, stops: [
      { placeId: "A", name: "A", blurb: "x" },
      { placeId: "GHOST", name: "Ghost", blurb: "y" },
    ] }],
  };
  const it = await curateItinerary({ pois, prefs, tripDays: 1, llmComplete: () => Promise.resolve(reply(dirty)) });
  assertEquals(it.days[0].stops.map((s) => s.placeId), ["A"]);
});

Deno.test("curate retries once after malformed reply", async () => {
  let n = 0;
  const llm = () => Promise.resolve(n++ === 0 ? "garbage" : reply(valid));
  const it = await curateItinerary({ pois, prefs, tripDays: 1, llmComplete: llm });
  assertEquals(it.days.length, 1);
  assertEquals(n, 2);
});

Deno.test("curate throws CurationError after two bad replies", async () => {
  await assertRejects(
    () => curateItinerary({ pois, prefs, tripDays: 1, llmComplete: () => Promise.resolve("garbage") }),
    CurationError,
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/_shared/curate_test.ts`
Expected: FAIL — `Module not found "./curate.ts"`.

- [ ] **Step 3: Write `curate.ts`**

```typescript
// supabase/_shared/curate.ts
import type { Itinerary, Poi, Prefs, LlmComplete } from "./types.ts";
import { buildPrompt } from "./llm.ts";
import { parseItinerary, sanitizeItinerary, validateItinerary } from "./schema.ts";

export class CurationError extends Error {}

export async function curateItinerary(opts: {
  pois: Poi[];
  prefs: Prefs;
  tripDays: number;
  llmComplete: LlmComplete;
}): Promise<Itinerary> {
  const { pois, prefs, tripDays, llmComplete } = opts;
  const validIds = new Set(pois.map((p) => p.placeId));
  const prompt = buildPrompt(pois, prefs, tripDays);

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llmComplete(prompt);
    let itinerary: Itinerary;
    try {
      itinerary = parseItinerary(raw);
    } catch {
      continue; // malformed → retry
    }
    itinerary = sanitizeItinerary(itinerary, validIds);
    const { ok } = validateItinerary(itinerary, { validPlaceIds: validIds, expectedDays: tripDays });
    if (ok) return itinerary;
  }
  throw new CurationError("curation failed validation after retry");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/_shared/curate_test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/curate.ts supabase/_shared/curate_test.ts
git commit -m "feat: curation orchestrator with hallucination drop + retry"
```

---

### Task 4: Google Places adapter (field-masked fetch + filter + cache write)

**Files:**
- Create: `supabase/_shared/places.ts`
- Test: `supabase/_shared/places_test.ts`

**Interfaces:**
- Consumes: types `Poi`, `Prefs`, `HttpFetch`.
- Produces:
  - `interface PoiCache { write(pois: Poi[]): Promise<void>; }`
  - `fetchPois(opts: { location: string; kind: Poi["kind"]; prefs: Prefs; httpFetch: HttpFetch; apiKey: string; cache?: PoiCache }): Promise<Poi[]>`.

  Behaviour: POST to Places Text Search with an `X-Goog-FieldMask` header; map results to `Poi[]`; filter by budget (low → priceLevel ≤ 1, mid → ≤ 2, high → no cap; places with no priceLevel always kept); write results to `cache` if provided. Throws on non-OK HTTP.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/_shared/places_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { fetchPois } from "./places.ts";
import type { Poi, Prefs } from "./types.ts";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced" };

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const placesBody = {
  places: [
    { id: "A", displayName: { text: "Cheap Spot" }, location: { latitude: 1, longitude: 2 }, priceLevel: "PRICE_LEVEL_INEXPENSIVE", rating: 4.5, formattedAddress: "1 St" },
    { id: "B", displayName: { text: "Pricey Spot" }, location: { latitude: 3, longitude: 4 }, priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE", rating: 4.0, formattedAddress: "2 St" },
    { id: "C", displayName: { text: "Unknown Price" }, location: { latitude: 5, longitude: 6 }, rating: 4.2, formattedAddress: "3 St" },
  ],
};

Deno.test("fetchPois sends a field mask header", async () => {
  let sawMask = "";
  const httpFetch = (_url: string, init?: RequestInit) => {
    sawMask = (init?.headers as Record<string, string>)["X-Goog-FieldMask"] ?? "";
    return Promise.resolve(fakeResponse(placesBody));
  };
  await fetchPois({ location: "Lisbon", kind: "attraction", prefs, httpFetch, apiKey: "k" });
  assert(sawMask.includes("places.id"));
});

Deno.test("fetchPois maps places to Poi", async () => {
  const httpFetch = () => Promise.resolve(fakeResponse(placesBody));
  const pois = await fetchPois({ location: "Lisbon", kind: "food", prefs, httpFetch, apiKey: "k" });
  const a = pois.find((p) => p.placeId === "A")!;
  assertEquals(a.name, "Cheap Spot");
  assertEquals(a.kind, "food");
  assertEquals(a.priceLevel, 1);
});

Deno.test("fetchPois filters out over-budget places but keeps unknown price", async () => {
  const httpFetch = () => Promise.resolve(fakeResponse(placesBody));
  const ids = (await fetchPois({ location: "Lisbon", kind: "food", prefs, httpFetch, apiKey: "k" })).map((p) => p.placeId);
  assertEquals(ids.sort(), ["A", "C"]); // B (very expensive) dropped at budget=mid
});

Deno.test("fetchPois writes results to cache", async () => {
  const written: Poi[][] = [];
  const httpFetch = () => Promise.resolve(fakeResponse(placesBody));
  await fetchPois({ location: "Lisbon", kind: "food", prefs, httpFetch, apiKey: "k", cache: { write: (p) => { written.push(p); return Promise.resolve(); } } });
  assertEquals(written.length, 1);
});

Deno.test("fetchPois throws on non-OK response", async () => {
  const httpFetch = () => Promise.resolve(fakeResponse({}, false, 429));
  let threw = false;
  try { await fetchPois({ location: "X", kind: "food", prefs, httpFetch, apiKey: "k" }); } catch { threw = true; }
  assert(threw);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/_shared/places_test.ts`
Expected: FAIL — `Module not found "./places.ts"`.

- [ ] **Step 3: Write `places.ts`**

```typescript
// supabase/_shared/places.ts
import type { HttpFetch, Poi, Prefs } from "./types.ts";

export interface PoiCache {
  write(pois: Poi[]): Promise<void>;
}

const TYPE_QUERY: Record<Poi["kind"], string> = {
  attraction: "tourist attraction",
  food: "restaurant",
  lodging: "hotel",
};

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const BUDGET_CAP: Record<Prefs["budget"], number> = { low: 1, mid: 2, high: 4 };

const FIELD_MASK =
  "places.id,places.displayName,places.location,places.priceLevel,places.rating,places.formattedAddress";

export async function fetchPois(opts: {
  location: string;
  kind: Poi["kind"];
  prefs: Prefs;
  httpFetch: HttpFetch;
  apiKey: string;
  cache?: PoiCache;
}): Promise<Poi[]> {
  const { location, kind, prefs, httpFetch, apiKey, cache } = opts;
  const res = await httpFetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${TYPE_QUERY[kind]} in ${location}`, maxResultCount: 20 }),
  });
  if (!res.ok) throw new Error(`places: HTTP ${res.status}`);
  const data = await res.json() as { places?: Array<Record<string, unknown>> };

  const cap = BUDGET_CAP[prefs.budget];
  const pois: Poi[] = (data.places ?? [])
    .map((p): Poi => {
      const priceLevel = typeof p.priceLevel === "string" ? PRICE_MAP[p.priceLevel] : undefined;
      const loc = p.location as { latitude?: number; longitude?: number } | undefined;
      const name = p.displayName as { text?: string } | undefined;
      return {
        placeId: String(p.id),
        name: name?.text ?? "",
        kind,
        lat: loc?.latitude ?? 0,
        lng: loc?.longitude ?? 0,
        priceLevel,
        rating: typeof p.rating === "number" ? p.rating : undefined,
        address: typeof p.formattedAddress === "string" ? p.formattedAddress : undefined,
      };
    })
    .filter((p) => p.priceLevel === undefined || p.priceLevel <= cap);

  if (cache) await cache.write(pois);
  return pois;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/_shared/places_test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/places.ts supabase/_shared/places_test.ts
git commit -m "feat: Google Places adapter with field mask, budget filter, cache write"
```

---

### Task 5: Google Routes adapter (optimized order + fallback)

**Files:**
- Create: `supabase/_shared/routes.ts`
- Test: `supabase/_shared/routes_test.ts`

**Interfaces:**
- Consumes: types `Poi`, `HttpFetch`.
- Produces:
  - `orderStops(opts: { stops: Poi[]; anchor: { lat: number; lng: number }; httpFetch: HttpFetch; apiKey: string; maxStops?: number }): Promise<{ placeId: string; travelMinutesFromPrev: number }[]>`.

  Behaviour: cap to `maxStops` (default 8); call Routes `computeRoutes` with `optimizeWaypointOrder: true`, anchor as origin and destination (loop); reorder stops by `optimizedIntermediateWaypointIndex`; set `travelMinutesFromPrev` from each leg's `duration` (`"1234s"` → minutes, rounded). On any error or non-OK response, fall back to input order with `travelMinutesFromPrev: 0`.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/_shared/routes_test.ts
import { assertEquals } from "jsr:@std/assert";
import { orderStops } from "./routes.ts";
import type { Poi } from "./types.ts";

const stops: Poi[] = [
  { placeId: "P0", name: "P0", kind: "attraction", lat: 0, lng: 0 },
  { placeId: "P1", name: "P1", kind: "attraction", lat: 1, lng: 1 },
  { placeId: "P2", name: "P2", kind: "food", lat: 2, lng: 2 },
];
const anchor = { lat: 5, lng: 5 };

function res(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

Deno.test("orderStops reorders by optimized index and parses leg minutes", async () => {
  // optimized order: P2 (idx 2), P0 (idx 0), P1 (idx 1); 4 legs (anchor->..->anchor)
  const body = {
    routes: [{
      optimizedIntermediateWaypointIndex: [2, 0, 1],
      legs: [
        { duration: "600s" },   // anchor -> P2 (10 min)
        { duration: "300s" },   // P2 -> P0 (5 min)
        { duration: "120s" },   // P0 -> P1 (2 min)
        { duration: "900s" },   // P1 -> anchor (ignored)
      ],
    }],
  };
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.resolve(res(body)), apiKey: "k" });
  assertEquals(out.map((s) => s.placeId), ["P2", "P0", "P1"]);
  assertEquals(out.map((s) => s.travelMinutesFromPrev), [10, 5, 2]);
});

Deno.test("orderStops caps to maxStops", async () => {
  const body = { routes: [{ optimizedIntermediateWaypointIndex: [0, 1], legs: [{ duration: "60s" }, { duration: "60s" }, { duration: "60s" }] }] };
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.resolve(res(body)), apiKey: "k", maxStops: 2 });
  assertEquals(out.length, 2);
});

Deno.test("orderStops falls back to input order on HTTP error", async () => {
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.resolve(res({}, false, 500)), apiKey: "k" });
  assertEquals(out.map((s) => s.placeId), ["P0", "P1", "P2"]);
  assertEquals(out.every((s) => s.travelMinutesFromPrev === 0), true);
});

Deno.test("orderStops falls back when fetch throws", async () => {
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.reject(new Error("network")), apiKey: "k" });
  assertEquals(out.map((s) => s.placeId), ["P0", "P1", "P2"]);
});

Deno.test("orderStops returns [] for no stops", async () => {
  const out = await orderStops({ stops: [], anchor, httpFetch: () => Promise.resolve(res({})), apiKey: "k" });
  assertEquals(out, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/_shared/routes_test.ts`
Expected: FAIL — `Module not found "./routes.ts"`.

- [ ] **Step 3: Write `routes.ts`**

```typescript
// supabase/_shared/routes.ts
import type { HttpFetch, Poi } from "./types.ts";

type Ordered = { placeId: string; travelMinutesFromPrev: number };

const FIELD_MASK = "routes.optimizedIntermediateWaypointIndex,routes.legs.duration";

function durationToMinutes(d: unknown): number {
  if (typeof d !== "string") return 0;
  const seconds = Number(d.replace(/s$/, ""));
  return Number.isFinite(seconds) ? Math.round(seconds / 60) : 0;
}

function fallback(stops: Poi[]): Ordered[] {
  return stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 0 }));
}

export async function orderStops(opts: {
  stops: Poi[];
  anchor: { lat: number; lng: number };
  httpFetch: HttpFetch;
  apiKey: string;
  maxStops?: number;
}): Promise<Ordered[]> {
  const { anchor, httpFetch, apiKey } = opts;
  const capped = opts.stops.slice(0, opts.maxStops ?? 8);
  if (capped.length === 0) return [];

  const waypoint = (lat: number, lng: number) => ({ location: { latLng: { latitude: lat, longitude: lng } } });

  try {
    const res = await httpFetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        origin: waypoint(anchor.lat, anchor.lng),
        destination: waypoint(anchor.lat, anchor.lng),
        intermediates: capped.map((s) => waypoint(s.lat, s.lng)),
        travelMode: "DRIVE",
        optimizeWaypointOrder: true,
      }),
    });
    if (!res.ok) return fallback(capped);

    const data = await res.json() as {
      routes?: Array<{ optimizedIntermediateWaypointIndex?: number[]; legs?: Array<{ duration?: string }> }>;
    };
    const route = data.routes?.[0];
    const order = route?.optimizedIntermediateWaypointIndex;
    if (!order || order.length !== capped.length) return fallback(capped);

    const legs = route?.legs ?? [];
    // legs[0] = anchor -> first stop; legs[i] = (i-1)th stop -> ith stop
    return order.map((origIdx, position) => ({
      placeId: capped[origIdx].placeId,
      travelMinutesFromPrev: durationToMinutes(legs[position]?.duration),
    }));
  } catch {
    return fallback(capped);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/_shared/routes_test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/_shared/routes.ts supabase/_shared/routes_test.ts
git commit -m "feat: Google Routes adapter with optimized order + fallback"
```

---

### Task 6: Database migration (profiles, trips, cached_pois + RLS)

**Files:**
- Create: `supabase/migrations/0001_init.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.profiles`, `public.trips`, `public.cached_pois`. The edge function (Task 7) reads/writes these with the service-role key.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0001_init.sql
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  default_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  location text not null,
  start_date date,
  end_date date,
  prefs jsonb not null,
  itinerary jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists trips_user_created_idx on public.trips (user_id, created_at);

create table if not exists public.cached_pois (
  place_id text primary key,
  payload jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.cached_pois enable row level security;

-- Owner-only access for user data. The edge function uses the service-role key, which bypasses RLS.
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own trips" on public.trips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cached_pois: no client policies (service-role only). Readable to authenticated for future detail lookups.
create policy "read cached pois" on public.cached_pois
  for select using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply the migration to a local Supabase instance**

Run: `supabase start && supabase migration up`
Expected: completes without error.

- [ ] **Step 3: Verify the tables exist**

Run: `supabase db execute --query "select table_name from information_schema.tables where table_schema='public' order by 1;"`
Expected: output lists `cached_pois`, `profiles`, `trips`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: initial schema (profiles, trips, cached_pois) with RLS"
```

---

### Task 7: Edge function handler (compose pipeline + regen cap + persist)

**Files:**
- Create: `supabase/functions/generate-itinerary/handler.ts`
- Create: `supabase/functions/generate-itinerary/index.ts`
- Test: `supabase/functions/generate-itinerary/handler_test.ts`

**Interfaces:**
- Consumes: `fetchPois` (Task 4), `curateItinerary` + `CurationError` (Task 3), `orderStops` (Task 5); types `Poi`, `Prefs`, `Itinerary`.
- Produces:
  - `interface HandlerDeps` — injectable seams (auth, regen-count, fetchPois, curate, orderStops, persist).
  - `handleGenerate(body: GenerateRequest, userId: string, deps: HandlerDeps): Promise<{ status: number; body: unknown }>`.
  - `GenerateRequest = { location: string; tripDays: number; prefs: Prefs }`.
  - `DAILY_CAP = 10`.

  Behaviour: reject `tripDays < 1` (400). Enforce `deps.countTripsToday(userId) < DAILY_CAP` else 429. Fetch attractions + food + lodging. Anchor = first lodging POI (or null). Curate over attractions+food. For each day, `orderStops` anchored at lodging and stitch `travelMinutesFromPrev` + `lodgingPlaceId` into the stops. Persist via `deps.saveTrip`. Return `{ status: 200, body: { tripId, itinerary } }`. On `CurationError`, return 502.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/functions/generate-itinerary/handler_test.ts
import { assertEquals } from "jsr:@std/assert";
import { handleGenerate, DAILY_CAP, type HandlerDeps } from "./handler.ts";
import { CurationError } from "../../_shared/curate.ts";
import type { Poi, Prefs, Itinerary } from "../../_shared/types.ts";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced" };
const attractions: Poi[] = [{ placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 }];
const lodging: Poi[] = [{ placeId: "L", name: "Hotel", kind: "lodging", lat: 9, lng: 9, deepLink: "https://book/L" }];
const itinerary: Itinerary = { days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] };

function baseDeps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    countTripsToday: () => Promise.resolve(0),
    fetchPois: ({ kind }) => Promise.resolve(kind === "lodging" ? lodging : attractions),
    curate: () => Promise.resolve(itinerary),
    orderStops: ({ stops }) => Promise.resolve(stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 7 }))),
    saveTrip: () => Promise.resolve("trip-123"),
    ...over,
  };
}

Deno.test("rejects tripDays < 1", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 0, prefs }, "u1", baseDeps());
  assertEquals(r.status, 400);
});

Deno.test("enforces daily cap", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps({ countTripsToday: () => Promise.resolve(DAILY_CAP) }));
  assertEquals(r.status, 429);
});

Deno.test("happy path returns trip id + itinerary with lodging anchor and travel times", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps());
  assertEquals(r.status, 200);
  const body = r.body as { tripId: string; itinerary: Itinerary };
  assertEquals(body.tripId, "trip-123");
  assertEquals(body.itinerary.days[0].lodgingPlaceId, "L");
  assertEquals(body.itinerary.days[0].stops[0].travelMinutesFromPrev, 7);
});

Deno.test("returns 502 on CurationError", async () => {
  const r = await handleGenerate({ location: "X", tripDays: 1, prefs }, "u1", baseDeps({ curate: () => Promise.reject(new CurationError("boom")) }));
  assertEquals(r.status, 502);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: FAIL — `Module not found "./handler.ts"`.

- [ ] **Step 3: Write `handler.ts`**

```typescript
// supabase/functions/generate-itinerary/handler.ts
import type { Itinerary, Poi, Prefs } from "../../_shared/types.ts";
import { CurationError } from "../../_shared/curate.ts";

export const DAILY_CAP = 10;

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
}

export interface HandlerDeps {
  countTripsToday(userId: string): Promise<number>;
  fetchPois(opts: { location: string; kind: Poi["kind"]; prefs: Prefs }): Promise<Poi[]>;
  curate(opts: { pois: Poi[]; prefs: Prefs; tripDays: number }): Promise<Itinerary>;
  orderStops(opts: { stops: Poi[]; anchor: { lat: number; lng: number } }): Promise<{ placeId: string; travelMinutesFromPrev: number }[]>;
  saveTrip(opts: { userId: string; req: GenerateRequest; itinerary: Itinerary }): Promise<string>;
}

export async function handleGenerate(
  body: GenerateRequest,
  userId: string,
  deps: HandlerDeps,
): Promise<{ status: number; body: unknown }> {
  if (!body || body.tripDays < 1) {
    return { status: 400, body: { error: "tripDays must be >= 1" } };
  }
  if ((await deps.countTripsToday(userId)) >= DAILY_CAP) {
    return { status: 429, body: { error: "daily generation limit reached" } };
  }

  const [attractions, food, lodging] = await Promise.all([
    deps.fetchPois({ location: body.location, kind: "attraction", prefs: body.prefs }),
    deps.fetchPois({ location: body.location, kind: "food", prefs: body.prefs }),
    deps.fetchPois({ location: body.location, kind: "lodging", prefs: body.prefs }),
  ]);

  const pois = [...attractions, ...food];
  const anchorPoi = lodging[0] ?? null;

  let itinerary: Itinerary;
  try {
    itinerary = await deps.curate({ pois, prefs: body.prefs, tripDays: body.tripDays });
  } catch (e) {
    if (e instanceof CurationError) return { status: 502, body: { error: "could not build itinerary" } };
    throw e;
  }

  const byId = new Map(pois.map((p) => [p.placeId, p]));
  for (const day of itinerary.days) {
    day.lodgingPlaceId = anchorPoi?.placeId ?? null;
    if (!anchorPoi) continue;
    const dayPois = day.stops.map((s) => byId.get(s.placeId)).filter((p): p is Poi => !!p);
    const ordered = await deps.orderStops({ stops: dayPois, anchor: { lat: anchorPoi.lat, lng: anchorPoi.lng } });
    const minutesById = new Map(ordered.map((o) => [o.placeId, o.travelMinutesFromPrev]));
    // reorder stops to match optimized order, attach travel times
    day.stops = ordered.map((o) => {
      const stop = day.stops.find((s) => s.placeId === o.placeId)!;
      return { ...stop, travelMinutesFromPrev: minutesById.get(o.placeId) };
    });
  }

  const tripId = await deps.saveTrip({ userId, req: body, itinerary });
  return { status: 200, body: { tripId, itinerary } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/functions/generate-itinerary/handler_test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write `index.ts`** (the real wiring — no unit test; deps are exercised in Task 8 smoke test)

```typescript
// supabase/functions/generate-itinerary/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleGenerate, type GenerateRequest, type HandlerDeps } from "./handler.ts";
import { fetchPois } from "../../_shared/places.ts";
import { curateItinerary } from "../../_shared/curate.ts";
import { orderStops } from "../../_shared/routes.ts";
import type { LlmComplete } from "../../_shared/types.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;
const ROUTES_KEY = Deno.env.get("GOOGLE_ROUTES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Provider-neutral seam. Replace this body with the bench-test winner's adapter.
const llmComplete: LlmComplete = (prompt) => {
  throw new Error("LLM adapter not yet wired: " + prompt.slice(0, 0));
};

function startOfTodayISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

Deno.serve(async (req: Request) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const userId = userData.user.id;

  const body = await req.json() as GenerateRequest;

  const deps: HandlerDeps = {
    countTripsToday: async (uid) => {
      const { count } = await admin
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .gte("created_at", startOfTodayISO());
      return count ?? 0;
    },
    fetchPois: (o) =>
      fetchPois({
        ...o,
        httpFetch: fetch,
        apiKey: PLACES_KEY,
        cache: { write: async (pois) => { await admin.from("cached_pois").upsert(pois.map((p) => ({ place_id: p.placeId, payload: p, fetched_at: new Date().toISOString() }))); } },
      }),
    curate: (o) => curateItinerary({ ...o, llmComplete }),
    orderStops: (o) => orderStops({ ...o, httpFetch: fetch, apiKey: ROUTES_KEY }),
    saveTrip: async ({ userId: uid, req: r, itinerary }) => {
      const { data, error } = await admin
        .from("trips")
        .insert({ user_id: uid, location: r.location, prefs: r.prefs, itinerary })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
  };

  const result = await handleGenerate(body, userId, deps);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 6: Type-check the function and run the full suite**

Run: `deno check supabase/functions/generate-itinerary/index.ts && deno test supabase/`
Expected: type check passes; all tests across all modules PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/generate-itinerary/
git commit -m "feat: generate-itinerary edge function (pipeline + regen cap + persist)"
```

---

### Task 8: Wire one LLM provider adapter + end-to-end smoke test

**Files:**
- Create: `supabase/_shared/llm_adapter.ts`
- Modify: `supabase/functions/generate-itinerary/index.ts` (replace the stub `llmComplete`)
- Test: `supabase/_shared/llm_adapter_test.ts`

**Interfaces:**
- Consumes: `LlmComplete` type, `HttpFetch`.
- Produces: `makeLlmComplete(opts: { httpFetch: HttpFetch; apiKey: string; endpoint: string; model: string }): LlmComplete` — a thin HTTP adapter that POSTs the prompt and returns the model's text. This is the one place a provider lives; swapping providers = editing this file only.

> **Note:** the exact request/response shape depends on the bench-test winner (open decision in the spec). The test below pins the adapter's *contract* (sends the prompt, returns text, throws on non-OK) using a fake `httpFetch`, so it is provider-agnostic. When the provider is chosen, adjust `body`/response-path to match and update the fake in the test to that shape.

- [ ] **Step 1: Write the failing tests**

```typescript
// supabase/_shared/llm_adapter_test.ts
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { makeLlmComplete } from "./llm_adapter.ts";

function res(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

Deno.test("adapter sends the prompt and returns text", async () => {
  let sentBody = "";
  const httpFetch = (_url: string, init?: RequestInit) => {
    sentBody = String(init?.body ?? "");
    return Promise.resolve(res({ output: "the itinerary json" }));
  };
  const complete = makeLlmComplete({ httpFetch, apiKey: "k", endpoint: "https://llm.example/generate", model: "m1" });
  const out = await complete("PLAN THIS TRIP");
  assertStringIncludes(sentBody, "PLAN THIS TRIP");
  assertEquals(out, "the itinerary json");
});

Deno.test("adapter throws on non-OK", async () => {
  const complete = makeLlmComplete({ httpFetch: () => Promise.resolve(res({}, false, 500)), apiKey: "k", endpoint: "https://llm.example/generate", model: "m1" });
  let threw = false;
  try { await complete("x"); } catch { threw = true; }
  assert(threw);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test supabase/_shared/llm_adapter_test.ts`
Expected: FAIL — `Module not found "./llm_adapter.ts"`.

- [ ] **Step 3: Write `llm_adapter.ts`**

```typescript
// supabase/_shared/llm_adapter.ts
import type { HttpFetch, LlmComplete } from "./types.ts";

// Provider-neutral adapter. The request body and response path below are a
// generic shape; adjust both to the bench-test winner. Tests pin the contract
// (prompt in, text out, throw on non-OK), not the provider.
// ponytail: single-provider seam. Add a provider switch only if two run live.
export function makeLlmComplete(opts: {
  httpFetch: HttpFetch;
  apiKey: string;
  endpoint: string;
  model: string;
}): LlmComplete {
  return async (prompt: string) => {
    const res = await opts.httpFetch(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ model: opts.model, prompt }),
    });
    if (!res.ok) throw new Error(`llm: HTTP ${res.status}`);
    const data = await res.json() as { output?: string };
    return data.output ?? "";
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test supabase/_shared/llm_adapter_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the adapter into `index.ts`**

Replace the stub `llmComplete` block in `supabase/functions/generate-itinerary/index.ts` with:

```typescript
import { makeLlmComplete } from "../../_shared/llm_adapter.ts";

const LLM_KEY = Deno.env.get("LLM_API_KEY")!;
const LLM_ENDPOINT = Deno.env.get("LLM_ENDPOINT")!;
const LLM_MODEL = Deno.env.get("LLM_MODEL")!;
const llmComplete = makeLlmComplete({ httpFetch: fetch, apiKey: LLM_KEY, endpoint: LLM_ENDPOINT, model: LLM_MODEL });
```

(Delete the old throwing `llmComplete` constant and its unused `LlmComplete` import if no longer referenced.)

- [ ] **Step 6: Type-check + full suite**

Run: `deno check supabase/functions/generate-itinerary/index.ts && deno test supabase/`
Expected: type check passes; all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/_shared/llm_adapter.ts supabase/_shared/llm_adapter_test.ts supabase/functions/generate-itinerary/index.ts
git commit -m "feat: provider-neutral LLM adapter wired into edge function"
```

---

## Self-Review

**Spec coverage:**
- §2 Architecture / curation pipeline (Approach A) → Tasks 3–7 (fetch → curate → routes → assemble).
- §3 Data model (users/trips/cached_pois) → Task 6 (`profiles`/`trips`/`cached_pois`).
- §4 LLM provider open + isolated behind one function + prompt caching levers → Tasks 2, 3, 8 (`buildPrompt`, `curateItinerary`, `makeLlmComplete` seam). *Note: actual prompt-cache headers are provider-specific and land when the provider is chosen — flagged in Task 8.*
- §5 Routes: Google Routes for ordering + fallback → Task 5. *Manual reorder + custom stops are frontend — deferred to the mobile plan.*
- §7 Error handling: thin Places results, malformed LLM, hallucinated IDs, routing failure, quota cap → Tasks 3 (hallucination + retry), 4 (HTTP error), 5 (routing fallback), 7 (regen cap, CurationError → 502).
- §8 Cost: field masks (Task 4), stop cap (Task 5), per-user cap (Task 7), 30d cache write (Task 4 + index wiring).
- §9 Testing: `curateItinerary` golden + ID-set + day-count (Task 3); runtime schema validation (Task 1, used in Task 3).
- §10 Monetization (lodging deep-link): `Poi.deepLink` carried through (Task 1, used as lodging anchor in Task 7). Affiliate logic itself is deferred (frontend/business).
- §11 YAGNI: no multi-provider router (single seam, Task 8); no in-app booking, social, offline, payments.

**Gaps (intentional — out of Phase 1 scope):** mobile screens, auth UI, manual reorder UI, offline cache, push, i18n. These belong in the follow-on **mobile frontend plan**. The §12 open questions (provider bench winner, preference taxonomy, RN map SDK) are resolved during that plan / the bench test; the itinerary JSONB schema is now fixed by `types.ts` (Task 1).

**Placeholder scan:** none — every code step has complete code; the one provider-shape unknown (Task 8) is pinned by a contract test, not left as TODO.

**Type consistency:** `Poi`, `Prefs`, `Itinerary`, `Stop`, `ItineraryDay`, `LlmComplete`, `HttpFetch` defined once in Task 1 and imported everywhere. `curateItinerary` signature matches its use in Task 7's `curate` dep. `orderStops` return shape (`{placeId, travelMinutesFromPrev}`) matches Task 7's consumption. `fetchPois` options match Task 7's `fetchPois` dep call.
