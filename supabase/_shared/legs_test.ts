import { assertEquals, assert } from "jsr:@std/assert";
import { planLegs, legCenters, partitionByNearest, splitRoundRobin, MAX_LEG_DAYS, effectiveTripDays } from "./legs.ts";

Deno.test("planLegs: short trips are one leg", () => {
  assertEquals(planLegs(1), [1]);
  assertEquals(planLegs(7), [7]);
});

Deno.test("planLegs: long trips split into balanced legs of <= MAX_LEG_DAYS", () => {
  assertEquals(planLegs(8), [4, 4]);
  assertEquals(planLegs(16), [6, 5, 5]);
  assertEquals(planLegs(30), [6, 6, 6, 6, 6]);
  const legs = planLegs(365);
  assertEquals(legs.reduce((a, b) => a + b, 0), 365);
  assert(legs.every((l) => l >= 1 && l <= MAX_LEG_DAYS));
});

const vp = { low: { lat: 0, lng: 0 }, high: { lat: 10, lng: 10 } };

Deno.test("legCenters oneway: progresses across the viewport low → high", () => {
  const c = legCenters({ center: { lat: 5, lng: 5 }, viewport: vp, legs: 3, tripType: "oneway" });
  assertEquals(c, [{ lat: 0, lng: 0 }, { lat: 5, lng: 5 }, { lat: 10, lng: 10 }]);
});

Deno.test("legCenters round: goes out and comes back (last leg near the first)", () => {
  const c = legCenters({ center: { lat: 5, lng: 5 }, viewport: vp, legs: 3, tripType: "round" });
  assertEquals(c[0], { lat: 0, lng: 0 });
  assertEquals(c[1], { lat: 10, lng: 10 });   // farthest mid-trip
  assertEquals(c[2], { lat: 0, lng: 0 });     // back near the start
});

Deno.test("legCenters round: legs=2 spreads across the region instead of collapsing to one corner", () => {
  const c = legCenters({ center: { lat: 5, lng: 5 }, viewport: vp, legs: 2, tripType: "round" });
  assertEquals(c, [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }]);
});

Deno.test("legCenters: no viewport → all legs at the region center", () => {
  const c = legCenters({ center: { lat: 5, lng: 5 }, viewport: null, legs: 3, tripType: "oneway" });
  assertEquals(c, [{ lat: 5, lng: 5 }, { lat: 5, lng: 5 }, { lat: 5, lng: 5 }]);
});

Deno.test("partitionByNearest: disjoint pools by nearest center", () => {
  const centers = [{ lat: 0, lng: 0 }, { lat: 10, lng: 10 }];
  const items = [
    { id: "a", lat: 1, lng: 1 }, { id: "b", lat: 9, lng: 9 }, { id: "c", lat: 0.5, lng: 0 },
  ];
  const parts = partitionByNearest(items, centers);
  assertEquals(parts[0].map((i) => i.id), ["a", "c"]);
  assertEquals(parts[1].map((i) => i.id), ["b"]);
});

Deno.test("partitionByNearest: identical centers (round-trip first/last leg) split ties instead of starving a pool", () => {
  // Round trips duplicate the start-area center for the first and last legs.
  // First-wins tie-breaking sent every tied item to the first pool, leaving the
  // return leg empty — curation then failed the whole trip.
  const c = { lat: 0, lng: 0 };
  const centers = [c, { lat: 10, lng: 10 }, { ...c }];
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}`, lat: 0.001 * i, lng: 0 }));
  const parts = partitionByNearest(items, centers);
  assertEquals(parts[1].length, 0); // far center gets nothing — items all sit near the start
  assert(parts[0].length > 0 && parts[2].length > 0, `tied pools must both be fed, got [${parts.map((p) => p.length)}]`);
  assert(Math.abs(parts[0].length - parts[2].length) <= 1, "ties split evenly");
  assertEquals(parts[0].length + parts[2].length, 10); // disjoint, nothing lost
});

Deno.test("splitRoundRobin deals items evenly", () => {
  assertEquals(splitRoundRobin([1, 2, 3, 4, 5], 2), [[1, 3, 5], [2, 4]]);
});

Deno.test("effectiveTripDays caps days at floor(pool/2), min 1", () => {
  assertEquals(effectiveTripDays(40, 12), 12);  // plenty
  assertEquals(effectiveTripDays(10, 12), 5);   // sparse: 10 pois → 5 days
  assertEquals(effectiveTripDays(1, 12), 1);    // never 0
  assertEquals(effectiveTripDays(0, 3), 1);
  assertEquals(effectiveTripDays(6, 2), 2);     // never exceeds request
});
