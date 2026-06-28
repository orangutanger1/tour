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

Deno.test("buildPrompt encodes pace as stops/day (packed)", () => {
  const p = buildPrompt(pois, { ...prefs, pace: "packed" }, 2);
  assertStringIncludes(p, "6");
  assertStringIncludes(p, "stops per day");
});

Deno.test("buildPrompt encodes pace as stops/day (relaxed)", () => {
  const p = buildPrompt(pois, { ...prefs, pace: "relaxed" }, 2);
  assertStringIncludes(p, "2");
  assertStringIncludes(p, "stops per day");
});
