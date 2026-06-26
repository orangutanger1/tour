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
