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
