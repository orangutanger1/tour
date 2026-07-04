// mobile/lib/discover.ts
// Pure selection/filter logic for the Discover tab, plus the remote override
// reader. Screens stay thin; everything here is unit-tested.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DESTINATIONS, THEMES, TAGS, CONTINENTS,
  type Destination, type Theme, type Tag, type Continent,
} from "./destinations";

// Onboarding interests → destination themes.
export const INTEREST_THEMES: Record<string, Theme[]> = {
  scenic: ["nature", "beach"],
  outdoors: ["adventure", "nature"],
  food: ["food"],
  history: ["culture"],
  art: ["culture", "city"],
  nightlife: ["city"],
  shopping: ["city"],
};

export function forYou(all: Destination[], interests: string[], n = 8): Destination[] {
  const wanted = new Set(interests.flatMap((i) => INTEREST_THEMES[i] ?? []));
  const scored = all
    .map((dest, idx) => ({ dest, idx, score: dest.themes.filter((t) => wanted.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.dest.tags.length > 0) - Number(a.dest.tags.length > 0) ||
      a.idx - b.idx,
    )
    .map((x) => x.dest);
  return (scored.length > 0 ? scored : byTag(all, "popular")).slice(0, n);
}

export const byTag = (all: Destination[], tag: Tag) => all.filter((d) => d.tags.includes(tag));
export const byTheme = (all: Destination[], theme: Theme) => all.filter((d) => d.themes.includes(theme));
export const byContinent = (all: Destination[], continent: Continent) => all.filter((d) => d.continent === continent);
export const byCountry = (all: Destination[], countryCode: string) => all.filter((d) => d.countryCode === countryCode);

export function countries(all: Destination[]): { country: string; countryCode: string }[] {
  const seen = new Set<string>();
  return all
    .filter((d) => (seen.has(d.countryCode) ? false : (seen.add(d.countryCode), true)))
    .map((d) => ({ country: d.country, countryCode: d.countryCode }));
}

// "JP" → 🇯🇵 (regional indicator symbols).
export function flagEmoji(countryCode: string): string {
  return [...countryCode.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

const THEME_SET = new Set<string>(THEMES);
const TAG_SET = new Set<string>(TAGS);
const CONTINENT_SET = new Set<string>(CONTINENTS);

// Forward-compat guard: unknown themes/tags are filtered out; a row that ends up
// themeless, or with an unknown continent / missing required field, is dropped.
export function mapRemoteRow(row: Record<string, unknown>): Destination | null {
  const r = row as Record<string, any>;
  const themes = (Array.isArray(r.themes) ? r.themes : []).filter((t: string) => THEME_SET.has(t)) as Theme[];
  const tags = (Array.isArray(r.tags) ? r.tags : []).filter((t: string) => TAG_SET.has(t)) as Tag[];
  if (!r.id || !r.name || !r.country || !r.country_code || !r.image_url) return null;
  if (!CONTINENT_SET.has(r.continent) || themes.length === 0) return null;
  return {
    id: r.id, name: r.name, country: r.country, countryCode: r.country_code,
    continent: r.continent, themes, tags,
    blurb: r.blurb ?? "", highlights: Array.isArray(r.highlights) ? r.highlights : [],
    imageUrl: r.image_url, lat: r.lat ?? 0, lng: r.lng ?? 0,
  };
}

// Remote overrides bundle only when it yields ≥1 valid row.
export async function fetchDestinations(client: SupabaseClient): Promise<Destination[]> {
  const { data, error } = await client.from("destinations").select("*").order("position").order("id");
  if (error) throw error;
  const rows = (data ?? []).map(mapRemoteRow).filter((d): d is Destination => d !== null);
  return rows.length > 0 ? rows : DESTINATIONS;
}
