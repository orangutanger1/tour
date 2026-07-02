// supabase/_shared/cluster_test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { assignDays } from "./cluster.ts";

type S = { placeId: string };
const ids = (group: S[]) => new Set(group.map((s) => s.placeId));

// Two tight clusters ~314 km apart: near (0,0) and near (2,2).
const coords: Record<string, { lat: number; lng: number }> = {
  N1: { lat: 0, lng: 0 },
  N2: { lat: 0.01, lng: 0.01 },
  F1: { lat: 2, lng: 2 },
  F2: { lat: 2.01, lng: 2.01 },
};
const stops: S[] = [{ placeId: "N1" }, { placeId: "N2" }, { placeId: "F1" }, { placeId: "F2" }];

Deno.test("returns exactly tripDays groups", () => {
  const groups = assignDays({ stops, coords, tripDays: 2, maxDriveKm: 100000 });
  assertEquals(groups.length, 2);
});

Deno.test("keeps nearby stops together, separates far clusters across days", () => {
  const groups = assignDays({ stops, coords, tripDays: 2, maxDriveKm: 100000 });
  // Each day should be one tight cluster, never a mix of the two.
  const sets = groups.map(ids);
  const nearTogether = sets.some((s) => s.has("N1") && s.has("N2") && !s.has("F1") && !s.has("F2"));
  const farTogether = sets.some((s) => s.has("F1") && s.has("F2") && !s.has("N1") && !s.has("N2"));
  assert(nearTogether, `near pair split: ${JSON.stringify(groups)}`);
  assert(farTogether, `far pair split: ${JSON.stringify(groups)}`);
});

Deno.test("drops stops that blow the per-day drive budget", () => {
  const c = { A: { lat: 0, lng: 0 }, B: { lat: 0.01, lng: 0 }, C: { lat: 5, lng: 5 } };
  const s: S[] = [{ placeId: "A" }, { placeId: "B" }, { placeId: "C" }];
  // 1 day, tiny budget: the far outlier C (~785 km away) must be dropped.
  const groups = assignDays({ stops: s, coords: c, tripDays: 1, maxDriveKm: 50 });
  assertEquals(groups.length, 1);
  assert(!ids(groups[0]).has("C"), `far stop not dropped: ${JSON.stringify(groups[0])}`);
  assert(ids(groups[0]).has("A") && ids(groups[0]).has("B"));
});

Deno.test("day 1 is the cluster nearest the start location", () => {
  const c = {
    P1: { lat: 0, lng: 0 }, P2: { lat: 0.01, lng: 0 },
    Q1: { lat: 10, lng: 10 }, Q2: { lat: 10.01, lng: 10 },
  };
  const s: S[] = [{ placeId: "Q1" }, { placeId: "Q2" }, { placeId: "P1" }, { placeId: "P2" }];
  const groups = assignDays({ stops: s, coords: c, tripDays: 2, maxDriveKm: 100000, start: { lat: 0, lng: 0 } });
  assert(ids(groups[0]).has("P1"), `day 1 not nearest start: ${JSON.stringify(groups)}`);
});

Deno.test("never drops the last stop of a day (budget can't empty a day)", () => {
  const c = { X: { lat: 0, lng: 0 }, Y: { lat: 9, lng: 9 } };
  const s: S[] = [{ placeId: "X" }, { placeId: "Y" }];
  // 2 days, impossible budget: each day keeps its single stop anyway.
  const groups = assignDays({ stops: s, coords: c, tripDays: 2, maxDriveKm: 1 });
  assertEquals(groups.flat().length, 2);
});

// Three clusters at increasing distance from start (0,0): near A, mid B, far C.
const tripTypeCoords: Record<string, { lat: number; lng: number }> = {
  A1: { lat: 0.1, lng: 0.1 }, A2: { lat: 0.12, lng: 0.1 },
  B1: { lat: 1.0, lng: 1.0 }, B2: { lat: 1.02, lng: 1.0 },
  C1: { lat: 2.0, lng: 2.0 }, C2: { lat: 2.02, lng: 2.0 },
};
const tripTypeStops = Object.keys(tripTypeCoords).map((placeId) => ({ placeId }));
const start = { lat: 0, lng: 0 };

Deno.test("assignDays oneway: days progress away from the start", () => {
  const days = assignDays({ stops: tripTypeStops, coords: tripTypeCoords, tripDays: 3, maxDriveKm: 1000, start, tripType: "oneway" });
  assertEquals(days.map((d) => d[0].placeId[0]), ["A", "B", "C"]);
});

Deno.test("assignDays round: first and last days are the two nearest clusters", () => {
  const days = assignDays({ stops: tripTypeStops, coords: tripTypeCoords, tripDays: 3, maxDriveKm: 1000, start, tripType: "round" });
  assertEquals(days[0][0].placeId[0], "A");   // out from the start…
  assertEquals(days[1][0].placeId[0], "C");   // …far in the middle…
  assertEquals(days[2][0].placeId[0], "B");   // …back near the start
});

Deno.test("assignDays without tripType keeps legacy ordering (no reorder)", () => {
  const legacy = assignDays({ stops: tripTypeStops, coords: tripTypeCoords, tripDays: 3, maxDriveKm: 1000, start });
  assertEquals(legacy.map((d) => d[0].placeId[0]), ["A", "B", "C"]); // nn-chain from start already ascends
});
