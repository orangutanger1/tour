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
    ...over,
  };
}

Deno.test("returns cached regions without calling details/llm", async () => {
  let called = false;
  const out = await suggestRegions("p", deps({
    getCached: () => Promise.resolve([{ label: "X", hook: "y" }]),
    getDetails: () => { called = true; return Promise.resolve({ viewport: bigVp, name: "n" }); },
  }));
  assertEquals(out, [{ label: "X", hook: "y" }]);
  assertEquals(called, false);
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

Deno.test("large area returns parsed llm regions and caches them", async () => {
  const cached: Region[][] = [];
  const out = await suggestRegions("p", deps({ putCached: (_id, r) => { cached.push(r); return Promise.resolve(); } }));
  assertEquals(out, [{ label: "NorCal", hook: "Yosemite, SF" }]);
  assertEquals(cached[0], out);
});

Deno.test("malformed llm output yields []", async () => {
  const out = await suggestRegions("p", deps({ llmComplete: () => Promise.resolve("not json") }));
  assertEquals(out, []);
});
