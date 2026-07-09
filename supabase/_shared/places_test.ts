// supabase/_shared/places_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { fetchPois, searchAutocomplete, fetchPlaceDetails, foodTextQuery, ALLERGY_SET } from "./places.ts";
import type { HttpFetch, Poi, Prefs } from "./types.ts";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced", transport: "balanced" };

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

Deno.test("searchAutocomplete sends includedPrimaryTypes and maps text+placeId", async () => {
  let sentBody: any = null;
  const httpFetch = ((_url: string, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify({
      suggestions: [
        { placePrediction: { placeId: "p1", text: { text: "Lisbon, Portugal" } } },
        { placePrediction: { placeId: "p2", text: { text: "Lisbon, OH, USA" } } },
      ],
    }), { status: 200 }));
  }) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "Lis", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(out, [
    { text: "Lisbon, Portugal", placeId: "p1", types: [] },
    { text: "Lisbon, OH, USA", placeId: "p2", types: [] },
  ]);
  assertEquals(sentBody.includedPrimaryTypes, ["locality", "administrative_area_level_1", "country", "tourist_attraction"]);
});

Deno.test("searchAutocomplete in address mode omits type restriction (streets+buildings)", async () => {
  let sentBody: any = null;
  const httpFetch = ((_url: string, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body));
    return Promise.resolve(new Response(JSON.stringify({ suggestions: [] }), { status: 200 }));
  }) as unknown as typeof fetch;
  await searchAutocomplete({ query: "1 Main St", httpFetch: httpFetch as any, apiKey: "k", addresses: true });
  assertEquals(sentBody.includedPrimaryTypes, undefined);
});

Deno.test("searchAutocomplete returns [] for empty suggestions", async () => {
  const httpFetch = (() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "zzzz", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(out, []);
});

Deno.test("fetchPois sends locationBias circle capped at 50km", async () => {
  let sentBody: any = null;
  const httpFetch = (_url: string, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body));
    return Promise.resolve(fakeResponse(placesBody));
  };
  await fetchPois({
    location: "Lisbon", kind: "attraction", prefs, httpFetch, apiKey: "k",
    locationBias: { center: { lat: 38.7, lng: -9.1 }, radiusKm: 150 },
  });
  assertEquals(sentBody.locationBias.circle.center, { latitude: 38.7, longitude: -9.1 });
  assertEquals(sentBody.locationBias.circle.radius, 50000); // capped at 50000 m
});

Deno.test("fetchPois drops places outside the region radius (hard filter, not just soft bias)", async () => {
  const body = {
    places: [
      { id: "near", displayName: { text: "In region" }, location: { latitude: 1.03, longitude: 2.03 } },
      { id: "far", displayName: { text: "Wrong region" }, location: { latitude: 40, longitude: -70 } },
    ],
  };
  const httpFetch = () => Promise.resolve(fakeResponse(body));
  const ids = (await fetchPois({
    location: "Somewhere", kind: "food", prefs, httpFetch, apiKey: "k",
    locationBias: { center: { lat: 1, lng: 2 }, radiusKm: 10 },
  })).map((p) => p.placeId);
  assertEquals(ids, ["near"]);
});

Deno.test("fetchPois keeps all places when no locationBias (no center to filter against)", async () => {
  const body = {
    places: [
      { id: "a", displayName: { text: "A" }, location: { latitude: 1, longitude: 2 } },
      { id: "b", displayName: { text: "B" }, location: { latitude: 40, longitude: -70 } },
    ],
  };
  const httpFetch = () => Promise.resolve(fakeResponse(body));
  const ids = (await fetchPois({ location: "X", kind: "food", prefs, httpFetch, apiKey: "k" })).map((p) => p.placeId);
  assertEquals(ids.sort(), ["a", "b"]);
});

Deno.test("fetchPlaceDetails parses center, viewport, types", async () => {
  let sawUrl = "", sawMask = "";
  const httpFetch = ((url: string, init?: RequestInit) => {
    sawUrl = url;
    sawMask = (init?.headers as Record<string, string>)["X-Goog-FieldMask"] ?? "";
    return Promise.resolve(new Response(JSON.stringify({
      location: { latitude: 38.7, longitude: -9.1 },
      viewport: { low: { latitude: 38.6, longitude: -9.2 }, high: { latitude: 38.8, longitude: -9.0 } },
      types: ["locality", "political"],
      displayName: { text: "Lisbon" },
    }), { status: 200 }));
  }) as unknown as typeof fetch;
  const d = await fetchPlaceDetails({ placeId: "p1", httpFetch: httpFetch as any, apiKey: "k" });
  assertEquals(d.center, { lat: 38.7, lng: -9.1 });
  assertEquals(d.viewport, { low: { lat: 38.6, lng: -9.2 }, high: { lat: 38.8, lng: -9.0 } });
  assertEquals(d.types, ["locality", "political"]);
  assertEquals(d.name, "Lisbon");
  assert(sawUrl.includes("/v1/places/p1"));
  assert(sawMask.includes("viewport"));
});

Deno.test("searchAutocomplete surfaces prediction types", async () => {
  const httpFetch = ((_url: string, _init?: RequestInit) => Promise.resolve(new Response(JSON.stringify({
    suggestions: [{ placePrediction: { placeId: "c1", text: { text: "China" }, types: ["country"] } }],
  })))) as unknown as typeof fetch;
  const out = await searchAutocomplete({ query: "china", httpFetch, apiKey: "k" });
  assertEquals(out[0].types, ["country"]);
});

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
