import { assert } from "jsr:@std/assert";
import { areaRadiusKm } from "./area.ts";

// Lisbon-ish viewport ~ small city (~20km diagonal => ~10km radius)
const city = { low: { lat: 38.65, lng: -9.25 }, high: { lat: 38.80, lng: -9.05 } };
// Tiny landmark viewport (~1km)
const landmark = { low: { lat: 48.857, lng: 2.293 }, high: { lat: 48.859, lng: 2.296 } };
// Huge country viewport
const country = { low: { lat: 36.0, lng: 6.0 }, high: { lat: 47.0, lng: 18.0 } };

Deno.test("compact stays small, far stays large, across granularities", () => {
  assert(areaRadiusKm({ viewport: landmark, transport: "compact" }) >= 2);
  assert(areaRadiusKm({ viewport: landmark, transport: "compact" }) <= 5);
  assert(areaRadiusKm({ viewport: city, transport: "balanced" }) >= 5);
  assert(areaRadiusKm({ viewport: city, transport: "balanced" }) <= 25);
  assert(areaRadiusKm({ viewport: country, transport: "far" }) === 150);
  // null viewport falls back to balanced default band
  assert(areaRadiusKm({ viewport: null, transport: "balanced" }) >= 5);
});
