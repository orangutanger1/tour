// supabase/_shared/curate.ts
import type { Itinerary, Poi, Prefs, LlmComplete } from "./types.ts";
import { buildPrompt } from "./llm.ts";
import { parseItinerary, sanitizeItinerary, validateItinerary } from "./schema.ts";

export class CurationError extends Error {}

export async function curateItinerary(opts: {
  pois: Poi[];
  prefs: Prefs;
  tripDays: number;
  llmComplete: LlmComplete;
}): Promise<Itinerary> {
  const { pois, prefs, tripDays, llmComplete } = opts;
  const validIds = new Set(pois.map((p) => p.placeId));
  const prompt = buildPrompt(pois, prefs, tripDays);

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llmComplete(prompt);
    let itinerary: Itinerary;
    try {
      itinerary = parseItinerary(raw);
    } catch {
      continue; // malformed → retry
    }
    itinerary = sanitizeItinerary(itinerary, validIds);
    const { ok } = validateItinerary(itinerary, { validPlaceIds: validIds, expectedDays: tripDays });
    if (ok) return itinerary;
  }
  throw new CurationError("curation failed validation after retry");
}
