import { assertEquals, assert } from "jsr:@std/assert";
import { planLegs, legCenters, partitionByNearest, splitRoundRobin, MAX_LEG_DAYS } from "./legs.ts";

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

Deno.test("splitRoundRobin deals items evenly", () => {
  assertEquals(splitRoundRobin([1, 2, 3, 4, 5], 2), [[1, 3, 5], [2, 4]]);
});
