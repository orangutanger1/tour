// supabase/functions/suggest-regions/handler.ts
import { suggestRegions, type SuggestRegionsDeps } from "../../_shared/regions.ts";

export interface RegionsRequest { placeId?: string; }

export async function handleSuggestRegions(
  body: RegionsRequest,
  deps: SuggestRegionsDeps,
): Promise<{ status: number; body: unknown }> {
  const placeId = (body?.placeId ?? "").trim();
  if (!placeId) return { status: 400, body: { error: "placeId required" } };
  try {
    const regions = await suggestRegions(placeId, deps);
    return { status: 200, body: { regions } };
  } catch (e) {
    console.error("suggest-regions error:", e instanceof Error ? e.message : e);
    return { status: 502, body: { error: "suggest regions failed" } };
  }
}
