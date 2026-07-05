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

  // Keep the real reason for the last failure so the thrown error is diagnosable
  // in the Edge logs — otherwise every curation failure looks identical and we
  // can't tell "LLM returned prose" from "wrong day count" from "0 stops".
  let lastReason = "no attempts ran";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llmComplete(prompt);
    let itinerary: Itinerary;
    try {
      itinerary = parseItinerary(raw);
    } catch (e) {
      lastReason = `parse failed: ${e instanceof Error ? e.message : e}; head=${raw.slice(0, 120)}`;
      continue; // malformed → retry
    }
    itinerary = sanitizeItinerary(itinerary, validIds);
    const { ok, errors } = validateItinerary(itinerary, { validPlaceIds: validIds, expectedDays: tripDays });
    if (ok) return itinerary;
    lastReason = `validation failed (${validIds.size} valid POIs, ${tripDays} expected days): ${errors.slice(0, 6).join("; ")}`;
  }
  throw new CurationError(`curation failed after retry — ${lastReason}`);
}
