// supabase/_shared/places.ts
import type { HttpFetch, Poi, Prefs } from "./types.ts";

export interface PoiCache {
  write(pois: Poi[]): Promise<void>;
}

const TYPE_QUERY: Record<Poi["kind"], string> = {
  attraction: "tourist attraction",
  food: "restaurant",
  lodging: "hotel",
};

const PRICE_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const BUDGET_CAP: Record<Prefs["budget"], number> = { low: 1, mid: 2, high: 4 };

const FIELD_MASK =
  "places.id,places.displayName,places.location,places.priceLevel,places.rating,places.formattedAddress";

export async function fetchPois(opts: {
  location: string;
  kind: Poi["kind"];
  prefs: Prefs;
  httpFetch: HttpFetch;
  apiKey: string;
  cache?: PoiCache;
}): Promise<Poi[]> {
  const { location, kind, prefs, httpFetch, apiKey, cache } = opts;
  const res = await httpFetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${TYPE_QUERY[kind]} in ${location}`, maxResultCount: 20 }),
  });
  if (!res.ok) throw new Error(`places: HTTP ${res.status}`);
  const data = await res.json() as { places?: Array<Record<string, unknown>> };

  const cap = BUDGET_CAP[prefs.budget];
  const pois: Poi[] = (data.places ?? [])
    .map((p): Poi => {
      const priceLevel = typeof p.priceLevel === "string" ? PRICE_MAP[p.priceLevel] : undefined;
      const loc = p.location as { latitude?: number; longitude?: number } | undefined;
      const name = p.displayName as { text?: string } | undefined;
      return {
        placeId: String(p.id),
        name: name?.text ?? "",
        kind,
        lat: loc?.latitude ?? 0,
        lng: loc?.longitude ?? 0,
        priceLevel,
        rating: typeof p.rating === "number" ? p.rating : undefined,
        address: typeof p.formattedAddress === "string" ? p.formattedAddress : undefined,
      };
    })
    .filter((p) => p.priceLevel === undefined || p.priceLevel <= cap);

  if (cache) await cache.write(pois);
  return pois;
}

export async function searchAutocomplete(opts: {
  query: string;
  httpFetch: HttpFetch;
  apiKey: string;
}): Promise<{ text: string; placeId: string }[]> {
  const { query, httpFetch, apiKey } = opts;
  const res = await httpFetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input: query,
      includedPrimaryTypes: ["locality", "administrative_area_level_1", "country", "tourist_attraction"],
    }),
  });
  if (!res.ok) throw new Error(`autocomplete: HTTP ${res.status}`);
  const data = await res.json() as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
  };
  return (data.suggestions ?? [])
    .map((s) => ({ text: s.placePrediction?.text?.text ?? "", placeId: s.placePrediction?.placeId ?? "" }))
    .filter((s) => s.text && s.placeId)
    .slice(0, 5);
}
