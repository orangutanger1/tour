import { assertEquals } from "jsr:@std/assert";
import { suggestRegions, type SuggestRegionsDeps, type Region } from "./regions.ts";

const bigVp = { low: { lat: 32, lng: -124 }, high: { lat: 42, lng: -114 } }; // ~California
const tinyVp = { low: { lat: 40.0, lng: -74.02 }, high: { lat: 40.05, lng: -73.98 } };

function deps(over: Partial<SuggestRegionsDeps> = {}): SuggestRegionsDeps {
  return {
    getCached: () => Promise.resolve(null),
    putCached: () => Promise.resolve(),
    getDetails: () => Promise.resolve({ viewport: bigVp, name: "California" }),
    llmComplete: () => Promise.resolve(JSON.stringify({ regions: [{ label: "NorCal", hook: "Yosemite, SF" }] })),
    resolveRegion: (q) => Promise.resolve({ placeId: "pid:" + q, label: q }),
    ...over,
  };
}

Deno.test("returns cached regions without calling details/llm", async () => {
  let called = false;
  const out = await suggestRegions("p", deps({
    getCached: () => Promise.resolve([{ label: "X", hook: "y", placeId: "px" }]),
    getDetails: () => { called = true; return Promise.resolve({ viewport: bigVp, name: "n" }); },
  }));
  assertEquals(out, [{ label: "X", hook: "y", placeId: "px" }]);
  assertEquals(called, false);
});

Deno.test("ignores stale cache lacking placeId and re-resolves", async () => {
  let resolved = false;
  const out = await suggestRegions("p", deps({
    getCached: () => Promise.resolve([{ label: "Old", hook: "stale" } as unknown as Region]),
    llmComplete: () => Promise.resolve(JSON.stringify({ regions: [{ label: "Fresh", hook: "new" }] })),
    resolveRegion: (q) => { resolved = true; return Promise.resolve({ placeId: "f1", label: q }); },
  }));
  assertEquals(resolved, true);
  assertEquals(out, [{ label: "Fresh, California", hook: "new", placeId: "f1" }]);
});

Deno.test("resolves each region to a real placeId, qualifying the query with the parent name", async () => {
  let sawQuery = "";
  const out = await suggestRegions("p", deps({
    getDetails: () => Promise.resolve({ viewport: bigVp, name: "Brazil" }),
    llmComplete: () => Promise.resolve(JSON.stringify({ regions: [{ label: "Northeast", hook: "beaches" }] })),
    resolveRegion: (q) => { sawQuery = q; return Promise.resolve({ placeId: "ne", label: "Northeast Region, Brazil" }); },
  }));
  assertEquals(sawQuery, "Northeast, Brazil");
  assertEquals(out, [{ label: "Northeast Region, Brazil", hook: "beaches", placeId: "ne" }]);
});

Deno.test("drops regions that do not resolve to a place", async () => {
  const out = await suggestRegions("p", deps({
    llmComplete: () => Promise.resolve(JSON.stringify({ regions: [
      { label: "Real Place", hook: "a" },
      { label: "Invented Grouping", hook: "b" },
    ] })),
    resolveRegion: (q) => Promise.resolve(q.startsWith("Real Place") ? { placeId: "r1", label: "Real Place, California" } : null),
  }));
  assertEquals(out, [{ label: "Real Place, California", hook: "a", placeId: "r1" }]);
});

Deno.test("small area returns [] without calling the llm", async () => {
  let llmCalled = false;
  const out = await suggestRegions("p", deps({
    getDetails: () => Promise.resolve({ viewport: tinyVp, name: "Brooklyn" }),
    llmComplete: () => { llmCalled = true; return Promise.resolve("{}"); },
  }));
  assertEquals(out, []);
  assertEquals(llmCalled, false);
});

Deno.test("large area returns resolved llm regions and caches them", async () => {
  const cached: Region[][] = [];
  const out = await suggestRegions("p", deps({ putCached: (_id, r) => { cached.push(r); return Promise.resolve(); } }));
  assertEquals(out, [{ label: "NorCal, California", hook: "Yosemite, SF", placeId: "pid:NorCal, California" }]);
  assertEquals(cached[0], out);
});

Deno.test("malformed llm output yields []", async () => {
  const out = await suggestRegions("p", deps({ llmComplete: () => Promise.resolve("not json") }));
  assertEquals(out, []);
});
