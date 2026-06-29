// supabase/functions/suggest-regions/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleSuggestRegions } from "./handler.ts";
import { fetchPlaceDetails, searchAutocomplete } from "../../_shared/places.ts";
import { makeLlmComplete } from "../../_shared/llm_adapter.ts";
import type { Region } from "../../_shared/regions.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LLM_KEY = Deno.env.get("LLM_API_KEY")!;
const LLM_ENDPOINT = Deno.env.get("LLM_ENDPOINT")!;
const LLM_MODEL = Deno.env.get("LLM_MODEL")!;
const llmComplete = makeLlmComplete({ httpFetch: fetch, apiKey: LLM_KEY, endpoint: LLM_ENDPOINT, model: LLM_MODEL });

Deno.serve(async (req: Request) => {
  let body: { placeId?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const result = await handleSuggestRegions(body, {
    getCached: async (placeId) => {
      const { data } = await admin.from("region_suggestions").select("payload").eq("country_place_id", placeId).maybeSingle();
      return data ? (data.payload as Region[]) : null;
    },
    putCached: async (placeId, regions) => {
      await admin.from("region_suggestions").upsert({ country_place_id: placeId, payload: regions, updated_at: new Date().toISOString() });
    },
    getDetails: async (placeId) => {
      const d = await fetchPlaceDetails({ placeId, httpFetch: fetch, apiKey: PLACES_KEY });
      return { viewport: d.viewport, name: d.name };
    },
    resolveRegion: async (query) => {
      const hits = await searchAutocomplete({ query, httpFetch: fetch, apiKey: PLACES_KEY });
      return hits[0] ? { placeId: hits[0].placeId, label: hits[0].text } : null;
    },
    llmComplete,
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
