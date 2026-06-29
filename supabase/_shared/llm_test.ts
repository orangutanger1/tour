import { assert } from "jsr:@std/assert";
import { buildPrompt } from "./llm.ts";
import type { Poi, Prefs } from "./types.ts";

const pois: Poi[] = [{ placeId: "A", name: "A", kind: "attraction", lat: 0, lng: 0 }];

Deno.test("prompt never asks the LLM to pick food stops, even with food interest", () => {
  const prefs: Prefs = { interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced" };
  const prompt = buildPrompt(pois, prefs, 2);
  assert(!/food stops/i.test(prompt), "prompt should not mention food stops");
  assert(!/"kind":"meal"/.test(prompt), "prompt should not tell the LLM to mark meals");
});
