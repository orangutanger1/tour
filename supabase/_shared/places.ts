// supabase/_shared/places.ts
import type { HttpFetch, Poi, Prefs } from "./types.ts";
import { haversineKm } from "./area.ts";

export interface PoiCache {
  write(pois: Poi[]): Promise<void>;
}

const TYPE_QUERY: Record<Poi["kind"], string> = {
  attraction: "tourist attraction",
  food: "restaurant",
  lodging: "hotel",
};

export const ALLERGY_SET = new Set(["gluten-free", "dairy-free", "nut allergy", "shellfish allergy"]);

export function foodTextQuery(location: string, dietTerms: string[]): string {
  const prefix = dietTerms.length ? `${dietTerms.join(" ")} ` : "";
  return `${prefix}restaurant in ${location}`;
}

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

const DETAILS_FIELD_MASK = "location,viewport,types,displayName";

export async function fetchPois(opts: {
  location: string;
  kind: Poi["kind"];
  prefs: Prefs;
  httpFetch: HttpFetch;
  apiKey: string;
  cache?: PoiCache;
  locationBias?: { center: { lat: number; lng: number }; radiusKm: number };
}): Promise<Poi[]> {
  const { location, kind, prefs, httpFetch, apiKey, cache } = opts;
  const dietTerms = opts.kind === "food" ? (opts.prefs.diet ?? []) : [];
  const textQuery = opts.kind === "food"
    ? foodTextQuery(location, dietTerms)
    : `${TYPE_QUERY[opts.kind]} in ${location}`;
  const body: Record<string, unknown> = { textQuery, maxResultCount: 20 };
  if (opts.locationBias) {
    // searchText circle radius is hard-capped at 50 km by the API
    const radius = Math.min(opts.locationBias.radiusKm * 1000, 50000);
    body.locationBias = {
      circle: {
        center: { latitude: opts.locationBias.center.lat, longitude: opts.locationBias.center.lng },
        radius,
      },
    };
  }
  const res = await httpFetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`places: HTTP ${res.status}`);
  const data = await res.json() as { places?: Array<Record<string, unknown>> };
  const rawCount = data.places?.length ?? 0;

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

  // The API's locationBias is a soft hint, so searchText still returns far-off
  // places that merely name-match the query (e.g. a "Taipei & Tokyo" eatery in
  // New Hampshire for a Taipei trip). Hard-drop anything outside the region's
  // real radius — independent of the 50km circle cap above, which only sizes the
  // bias, not the region. No center → nothing to measure against, keep all.
  const bias = opts.locationBias;
  let inRegion = bias
    ? pois.filter((p) => haversineKm(bias.center, { lat: p.lat, lng: p.lng }) <= bias.radiusKm)
    : pois;

  // A too-small radius or an off-center region centroid (e.g. a country's
  // geographic middle paired with a 2–25 km compact/balanced radius) can drop
  // EVERY real attraction, which then guarantees a "0 valid POIs" curation
  // failure. When the region filter wipes an otherwise non-empty pool, fall back
  // to the results nearest the bias center rather than starving the trip. This
  // only triggers when the filter is clearly wrong (nothing survived), so it
  // can't reintroduce far-off name-matches for a correctly-sized region.
  if (bias && inRegion.length === 0 && pois.length > 0) {
    console.warn(`fetchPois ${kind} "${location}": region filter dropped all ${pois.length} places (center ${bias.center.lat.toFixed(3)},${bias.center.lng.toFixed(3)}, radius ${bias.radiusKm.toFixed(1)}km) — falling back to nearest`);
    inRegion = [...pois].sort((a, b) =>
      haversineKm(bias.center, { lat: a.lat, lng: a.lng }) - haversineKm(bias.center, { lat: b.lat, lng: b.lng }));
  }

  // Diet hybrid: an empty food pool with a lifestyle/free-text restriction retries
  // once with a plain restaurant query (soft). An allergy restriction does NOT
  // fall back — an unsafe suggestion is worse than a meal-gap.
  if (opts.kind === "food" && inRegion.length === 0 && dietTerms.length > 0) {
    const hasAllergy = dietTerms.some((t) => ALLERGY_SET.has(t));
    if (!hasAllergy) {
      return await fetchPois({ ...opts, prefs: { ...opts.prefs, diet: [] } });
    }
  }

  // Surface the other way a pool comes back empty: the API itself returned
  // nothing (bad textQuery, key/quota issue, or a location that name-matches no
  // places). Distinct from the filter case above so the logs tell them apart.
  if (inRegion.length === 0) {
    console.warn(`fetchPois ${kind} "${location}": empty pool (api returned ${rawCount}, budget cap ${cap})`);
  }

  if (cache) await cache.write(inRegion);
  return inRegion;
}

export async function searchAutocomplete(opts: {
  query: string;
  httpFetch: HttpFetch;
  apiKey: string;
  // Start-point fields want street addresses + buildings (home/airport/hotel),
  // so skip the place-type restriction the destination field uses.
  addresses?: boolean;
}): Promise<{ text: string; placeId: string; types: string[] }[]> {
  const { query, httpFetch, apiKey } = opts;
  const reqBody: Record<string, unknown> = { input: query };
  if (!opts.addresses) {
    reqBody.includedPrimaryTypes = ["locality", "administrative_area_level_1", "country", "tourist_attraction"];
  }
  const res = await httpFetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify(reqBody),
  });
  if (!res.ok) throw new Error(`autocomplete: HTTP ${res.status}`);
  const data = await res.json() as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string }; types?: string[] } }>;
  };
  return (data.suggestions ?? [])
    .map((s) => ({ text: s.placePrediction?.text?.text ?? "", placeId: s.placePrediction?.placeId ?? "", types: s.placePrediction?.types ?? [] }))
    .filter((s) => s.text && s.placeId)
    .slice(0, 5);
}

export async function fetchPlaceDetails(opts: {
  placeId: string; httpFetch: HttpFetch; apiKey: string;
}): Promise<{
  center: { lat: number; lng: number };
  viewport: { low: { lat: number; lng: number }; high: { lat: number; lng: number } } | null;
  types: string[];
  name: string;
}> {
  const { placeId, httpFetch, apiKey } = opts;
  const res = await httpFetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    method: "GET",
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
  });
  if (!res.ok) throw new Error(`place details: HTTP ${res.status}`);
  const d = await res.json() as {
    location?: { latitude?: number; longitude?: number };
    viewport?: { low?: { latitude?: number; longitude?: number }; high?: { latitude?: number; longitude?: number } };
    types?: string[];
    displayName?: { text?: string };
  };
  const pt = (p?: { latitude?: number; longitude?: number }) => ({ lat: p?.latitude ?? 0, lng: p?.longitude ?? 0 });
  return {
    center: pt(d.location),
    viewport: d.viewport?.low && d.viewport?.high ? { low: pt(d.viewport.low), high: pt(d.viewport.high) } : null,
    types: d.types ?? [],
    name: d.displayName?.text ?? "",
  };
}
