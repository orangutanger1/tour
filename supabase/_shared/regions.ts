// supabase/_shared/regions.ts
import type { LlmComplete } from "./types.ts";
import { areaRadiusKm, type Viewport } from "./area.ts";

export interface Region { label: string; hook: string; placeId: string; }

// Below this radius a place is a city/neighborhood — not worth narrowing.
// Coupling: this value must fall inside the "far" transport clamp band [25, 150] from
// areaRadiusKm (area.ts). If it moves outside that range the clamp silently breaks the gate.
export const REGION_MIN_RADIUS_KM = 60;

export interface SuggestRegionsDeps {
  getCached(placeId: string): Promise<Region[] | null>;
  putCached(placeId: string, regions: Region[]): Promise<void>;
  getDetails(placeId: string): Promise<{ viewport: Viewport; name: string }>;
  llmComplete: LlmComplete;
  // Resolve a region label to a real place (placeId + canonical name), or null
  // if it doesn't geocode. Lets the picked region carry a placeId downstream
  // instead of a bare string the autocomplete would then mis-match.
  resolveRegion(query: string): Promise<{ placeId: string; label: string } | null>;
}

export async function suggestRegions(placeId: string, deps: SuggestRegionsDeps): Promise<Region[]> {
  const cached = await deps.getCached(placeId);
  // Entries cached before regions carried a placeId are unusable downstream
  // (mobile can't set a destination from them) — treat as a miss and regenerate.
  if (cached && cached.every((r) => r.placeId)) return cached;
  const { viewport, name } = await deps.getDetails(placeId);
  const radius = areaRadiusKm({ viewport, transport: "far" });
  const raw = radius >= REGION_MIN_RADIUS_KM ? await llmRegions(name, deps.llmComplete) : [];
  // Resolve each label against Places, qualified with the parent name so
  // "Northeast" -> "Northeast, Brazil" lands the right place. Drop labels that
  // don't resolve (invented groupings); keep the LLM hook, use the canonical name.
  const resolved = await Promise.all(raw.map(async (r) => {
    const hit = await deps.resolveRegion(`${r.label}, ${name}`).catch(() => null);
    return hit ? { label: hit.label, hook: r.hook, placeId: hit.placeId } : null;
  }));
  const regions = resolved.filter((r): r is Region => r !== null);
  await deps.putCached(placeId, regions);
  return regions;
}

async function llmRegions(name: string, llmComplete: LlmComplete): Promise<{ label: string; hook: string }[]> {
  const prompt = [
    `List up to 5 distinct travel regions of ${name}.`,
    `Each label must be a real, searchable place within ${name} — a city, province, or state — not an invented or combined name.`,
    `Each region also has a one-line hook naming standout attractions.`,
    `If ${name} has few notable sub-areas, return an empty array.`,
    `Respond with ONLY JSON (no markdown fences): {"regions":[{"label":"...","hook":"..."}]}`,
  ].join("\n");
  try {
    const data = JSON.parse(await llmComplete(prompt)) as { regions?: { label?: unknown; hook?: unknown }[] };
    return (data.regions ?? [])
      .filter((r): r is { label: string; hook: string } => !!r && typeof r.label === "string" && typeof r.hook === "string")
      .slice(0, 5);
  } catch {
    return [];
  }
}
