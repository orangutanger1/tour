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
