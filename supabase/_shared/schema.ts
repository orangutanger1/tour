// supabase/_shared/schema.ts
import type { Itinerary } from "./types.ts";

export function parseItinerary(raw: string): Itinerary {
  // Models sometimes ignore "no markdown fences" and wrap the JSON in ```json…```
  // or a sentence of prose. Slice to the outermost braces so a disobedient-but-
  // valid response still parses instead of failing curation. ponytail: brace-slice,
  // not a full fence parser — upgrade only if a model emits multiple JSON blocks.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const body = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("itinerary: invalid JSON");
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { days?: unknown }).days)) {
    throw new Error("itinerary: missing days array");
  }
  return data as Itinerary;
}

export function validateItinerary(
  value: unknown,
  opts: { validPlaceIds: Set<string>; expectedDays: number },
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const it = value as Itinerary;
  if (!it || !Array.isArray(it.days)) {
    return { ok: false, errors: ["days is not an array"] };
  }
  if (it.days.length !== opts.expectedDays) {
    errors.push(`expected ${opts.expectedDays} days, got ${it.days.length}`);
  }
  it.days.forEach((d, i) => {
    if (d.day !== i + 1) errors.push(`day index ${i}: day number ${d.day} not sequential`);
    if (!Array.isArray(d.stops) || d.stops.length === 0) {
      errors.push(`day ${d.day}: no stops`);
    }
    (d.stops ?? []).forEach((s) => {
      if (!opts.validPlaceIds.has(s.placeId)) errors.push(`day ${d.day}: unknown placeId ${s.placeId}`);
      if (!s.blurb || typeof s.blurb !== "string") errors.push(`day ${d.day}: stop ${s.placeId} missing blurb`);
    });
  });
  return { ok: errors.length === 0, errors };
}

export function sanitizeItinerary(it: Itinerary, validPlaceIds: Set<string>): Itinerary {
  // Keep only known places, and only the first occurrence of each: the LLM
  // sometimes repeats a placeId across days, which then clusters into a single
  // day's stops as visible duplicates. `seen` spans all days so dedup is global.
  const seen = new Set<string>();
  return {
    days: it.days.map((d) => ({
      ...d,
      stops: d.stops.filter((s) => {
        if (!validPlaceIds.has(s.placeId) || seen.has(s.placeId)) return false;
        seen.add(s.placeId);
        return true;
      }),
    })),
  };
}
