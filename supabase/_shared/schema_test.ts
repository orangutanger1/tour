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

Deno.test("sanitizeItinerary drops duplicate placeIds across the whole itinerary, keeping the first", () => {
  const dup: Itinerary = {
    days: [
      { day: 1, lodgingPlaceId: null, stops: [
        { placeId: "A", name: "A", blurb: "x" },
        { placeId: "A", name: "A again", blurb: "x2" },
        { placeId: "B", name: "B", blurb: "y" },
      ] },
      { day: 2, lodgingPlaceId: null, stops: [
        { placeId: "A", name: "A third", blurb: "x3" },
        { placeId: "C", name: "C", blurb: "z" },
      ] },
    ],
  };
  const clean = sanitizeItinerary(dup, new Set(["A", "B", "C"]));
  assertEquals(clean.days[0].stops.map((s) => s.placeId), ["A", "B"]);
  assertEquals(clean.days[1].stops.map((s) => s.placeId), ["C"]);
});

Deno.test("sanitizeItinerary preserves dwellMinutes and kind", () => {
  const it: Itinerary = {
    days: [{ day: 1, lodgingPlaceId: null, stops: [
      { placeId: "A", name: "A", blurb: "x", dwellMinutes: 90, kind: "attraction" },
      { placeId: "", name: "Lunch", blurb: "y", kind: "meal-gap", dwellMinutes: 60, startTime: "12:30 PM" },
    ] }],
  };
  const out = sanitizeItinerary(it, new Set(["A"]));
  assertEquals(out.days[0].stops[0].dwellMinutes, 90);
  assertEquals(out.days[0].stops[0].kind, "attraction");
});
