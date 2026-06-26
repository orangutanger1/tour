// supabase/functions/generate-itinerary/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleGenerate, type GenerateRequest, type HandlerDeps } from "./handler.ts";
import { fetchPois } from "../../_shared/places.ts";
import { curateItinerary } from "../../_shared/curate.ts";
import { orderStops } from "../../_shared/routes.ts";
import { makeLlmComplete } from "../../_shared/llm_adapter.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;
const ROUTES_KEY = Deno.env.get("GOOGLE_ROUTES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LLM_KEY = Deno.env.get("LLM_API_KEY")!;
const LLM_ENDPOINT = Deno.env.get("LLM_ENDPOINT")!;
const LLM_MODEL = Deno.env.get("LLM_MODEL")!;
const llmComplete = makeLlmComplete({ httpFetch: fetch, apiKey: LLM_KEY, endpoint: LLM_ENDPOINT, model: LLM_MODEL });

function startOfTodayISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

Deno.serve(async (req: Request) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const userId = userData.user.id;

  const body = await req.json() as GenerateRequest;

  const deps: HandlerDeps = {
    countTripsToday: async (uid) => {
      const { count } = await admin
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .gte("created_at", startOfTodayISO());
      return count ?? 0;
    },
    fetchPois: (o) =>
      fetchPois({
        ...o,
        httpFetch: fetch,
        apiKey: PLACES_KEY,
        cache: { write: async (pois) => { await admin.from("cached_pois").upsert(pois.map((p) => ({ place_id: p.placeId, payload: p, fetched_at: new Date().toISOString() }))); } },
      }),
    curate: (o) => curateItinerary({ ...o, llmComplete }),
    orderStops: (o) => orderStops({ ...o, httpFetch: fetch, apiKey: ROUTES_KEY }),
    saveTrip: async ({ userId: uid, req: r, itinerary }) => {
      const { data, error } = await admin
        .from("trips")
        .insert({ user_id: uid, location: r.location, prefs: r.prefs, itinerary })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
  };

  const result = await handleGenerate(body, userId, deps);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
