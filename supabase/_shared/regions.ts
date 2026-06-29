// supabase/_shared/regions.ts
import type { LlmComplete } from "./types.ts";
import { areaRadiusKm, type Viewport } from "./area.ts";

export interface Region { label: string; hook: string; }

// Below this radius a place is a city/neighborhood — not worth narrowing.
// Coupling: this value must fall inside the "far" transport clamp band [25, 150] from
// areaRadiusKm (area.ts). If it moves outside that range the clamp silently breaks the gate.
export const REGION_MIN_RADIUS_KM = 60;

export interface SuggestRegionsDeps {
  getCached(placeId: string): Promise<Region[] | null>;
  putCached(placeId: string, regions: Region[]): Promise<void>;
  getDetails(placeId: string): Promise<{ viewport: Viewport; name: string }>;
  llmComplete: LlmComplete;
}

export async function suggestRegions(placeId: string, deps: SuggestRegionsDeps): Promise<Region[]> {
  const cached = await deps.getCached(placeId);
  if (cached) return cached;
  const { viewport, name } = await deps.getDetails(placeId);
  const radius = areaRadiusKm({ viewport, transport: "far" });
  const regions = radius >= REGION_MIN_RADIUS_KM ? await llmRegions(name, deps.llmComplete) : [];
  await deps.putCached(placeId, regions);
  return regions;
}

async function llmRegions(name: string, llmComplete: LlmComplete): Promise<Region[]> {
  const prompt = [
    `List up to 5 distinct travel regions of ${name}.`,
    `Each region has a short label and a one-line hook naming standout attractions.`,
    `If ${name} has few notable sub-areas, return an empty array.`,
    `Respond with ONLY JSON (no markdown fences): {"regions":[{"label":"...","hook":"..."}]}`,
  ].join("\n");
  try {
    const data = JSON.parse(await llmComplete(prompt)) as { regions?: Region[] };
    return (data.regions ?? [])
      .filter((r) => r && typeof r.label === "string" && typeof r.hook === "string")
      .slice(0, 5);
  } catch {
    return [];
  }
}
