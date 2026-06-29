import { assertEquals } from "jsr:@std/assert";
import { handleSuggestRegions } from "./handler.ts";
import type { SuggestRegionsDeps } from "../../_shared/regions.ts";

const deps: SuggestRegionsDeps = {
  getCached: () => Promise.resolve([{ label: "NorCal", hook: "Yosemite" }]),
  putCached: () => Promise.resolve(),
  getDetails: () => Promise.resolve({ viewport: null, name: "n" }),
  llmComplete: () => Promise.resolve("{}"),
};

Deno.test("400 when placeId missing", async () => {
  const r = await handleSuggestRegions({}, deps);
  assertEquals(r.status, 400);
});

Deno.test("200 returns regions", async () => {
  const r = await handleSuggestRegions({ placeId: "p" }, deps);
  assertEquals(r.status, 200);
  assertEquals((r.body as { regions: unknown }).regions, [{ label: "NorCal", hook: "Yosemite" }]);
});
