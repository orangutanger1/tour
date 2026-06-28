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
  const PACE_STOPS: Record<Prefs["pace"], string> = {
    relaxed: "2-3",
    balanced: "4-5",
    packed: "6-8",
  };
  return [
    `You are a local guide planning a ${tripDays}-day trip.`,
    `Traveler preferences: ${prefLine}`,
    `Choose from ONLY these places. Use the exact placeId values. Do not invent places:`,
    JSON.stringify(poiList),
    `Build a ${tripDays}-day plan. Group nearby places into the same day. For each stop write a one-sentence "why a local picks this" blurb.`,
    `Aim for about ${PACE_STOPS[prefs.pace]} stops per day (pace=${prefs.pace}).`,
    `Respond with ONLY valid JSON (no markdown fences), matching exactly this shape:`,
    `{"days":[{"day":1,"lodgingPlaceId":null,"stops":[{"placeId":"...","name":"...","blurb":"..."}]}]}`,
  ].join("\n");
}
