// supabase/_shared/llm.ts
import type { Poi, Prefs } from "./types.ts";

export function buildPrompt(pois: Poi[], prefs: Prefs, tripDays: number): string {
  const poiList = pois.map((p) => ({
    placeId: p.placeId,
    name: p.name,
    kind: p.kind,
    priceLevel: p.priceLevel ?? null,
    rating: p.rating ?? null,
  }));
  const prefLine =
    `interests=${prefs.interests.join(", ") || "any"}; budget=${prefs.budget}; pace=${prefs.pace};` +
    (prefs.diet?.length ? ` diet=${prefs.diet.join(", ")};` : "") +
    (prefs.accessibility?.length ? ` accessibility=${prefs.accessibility.join(", ")};` : "");
  const PACE_STOPS: Record<Prefs["pace"], string> = { relaxed: "2-3", balanced: "4-5", packed: "6-8" };
  const wantsFood = prefs.interests.includes("food");
  const lines = [
    `You are a local guide planning a ${tripDays}-day trip.`,
    `Traveler preferences: ${prefLine}`,
    `Choose from ONLY these places. Use the exact placeId values. Do not invent places:`,
    JSON.stringify(poiList),
    `Prioritize attractions that match the traveler's interests: scenic -> viewpoints/landmarks, outdoors -> parks/nature/trails, nightlife -> night markets/bars/late venues, history -> historic sites/museums, art -> galleries/installations, shopping -> markets/districts. Lead each day with the strongest interest matches.`,
    `Group nearby places into the same day. For each stop write a one-sentence "why a local picks this" blurb.`,
    `For each stop include "dwellMinutes": a realistic visit length (quick viewpoint ~30, museum ~120, large park ~150, meal ~60). Vary it; do not make every stop the same.`,
    `Aim for about ${PACE_STOPS[prefs.pace]} attraction stops per day (pace=${prefs.pace}).`,
  ];
  if (wantsFood) {
    lines.push(`Include up to 2 food stops per day (a lunch and a dinner) chosen from the food places above. Mark each with "kind":"meal" and a shorter dwellMinutes (~60). Food stops are meals and rest, not main attractions.`);
  }
  lines.push(
    `Respond with ONLY valid JSON (no markdown fences), matching exactly this shape:`,
    `{"days":[{"day":1,"lodgingPlaceId":null,"stops":[{"placeId":"...","name":"...","blurb":"...","dwellMinutes":90,"kind":"attraction"}]}]}`,
  );
  return lines.join("\n");
}
