// supabase/_shared/routes_test.ts
import { assertEquals } from "jsr:@std/assert";
import { orderStops } from "./routes.ts";
import type { Poi } from "./types.ts";

const stops: Poi[] = [
  { placeId: "P0", name: "P0", kind: "attraction", lat: 0, lng: 0 },
  { placeId: "P1", name: "P1", kind: "attraction", lat: 1, lng: 1 },
  { placeId: "P2", name: "P2", kind: "food", lat: 2, lng: 2 },
];
const anchor = { lat: 5, lng: 5 };

function res(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

Deno.test("orderStops reorders by optimized index and parses leg minutes", async () => {
  // optimized order: P2 (idx 2), P0 (idx 0), P1 (idx 1); 4 legs (anchor->..->anchor)
  const body = {
    routes: [{
      optimizedIntermediateWaypointIndex: [2, 0, 1],
      legs: [
        { duration: "600s" },   // anchor -> P2 (10 min)
        { duration: "300s" },   // P2 -> P0 (5 min)
        { duration: "120s" },   // P0 -> P1 (2 min)
        { duration: "900s" },   // P1 -> anchor (ignored)
      ],
    }],
  };
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.resolve(res(body)), apiKey: "k" });
  assertEquals(out.map((s) => s.placeId), ["P2", "P0", "P1"]);
  assertEquals(out.map((s) => s.travelMinutesFromPrev), [10, 5, 2]);
});

Deno.test("orderStops caps to maxStops", async () => {
  const body = { routes: [{ optimizedIntermediateWaypointIndex: [0, 1], legs: [{ duration: "60s" }, { duration: "60s" }, { duration: "60s" }] }] };
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.resolve(res(body)), apiKey: "k", maxStops: 2 });
  assertEquals(out.length, 2);
});

Deno.test("orderStops falls back to input order on HTTP error", async () => {
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.resolve(res({}, false, 500)), apiKey: "k" });
  assertEquals(out.map((s) => s.placeId), ["P0", "P1", "P2"]);
  assertEquals(out.every((s) => s.travelMinutesFromPrev === 0), true);
});

Deno.test("orderStops falls back when fetch throws", async () => {
  const out = await orderStops({ stops, anchor, httpFetch: () => Promise.reject(new Error("network")), apiKey: "k" });
  assertEquals(out.map((s) => s.placeId), ["P0", "P1", "P2"]);
});

Deno.test("orderStops returns [] for no stops", async () => {
  const out = await orderStops({ stops: [], anchor, httpFetch: () => Promise.resolve(res({})), apiKey: "k" });
  assertEquals(out, []);
});
