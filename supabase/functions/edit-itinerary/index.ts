// supabase/functions/edit-itinerary/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { handleEditItinerary, type EditItineraryDeps } from "./handler.ts";
import { orderStops } from "../../_shared/routes.ts";
import type { Itinerary } from "../../_shared/types.ts";

const ROUTES_KEY = Deno.env.get("GOOGLE_ROUTES_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  const authClient = createClient(SUPABASE_URL, SERVICE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  const userId = userData.user.id;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json() as { tripId?: string; day?: number };

  const deps: EditItineraryDeps = {
    loadItinerary: async (tripId) => {
      const { data } = await admin.from("trips").select("itinerary").eq("id", tripId).eq("user_id", userId).maybeSingle();
      return data ? (data.itinerary as Itinerary) : null;
    },
    coordsFor: async (placeIds) => {
      if (!placeIds.length) return {};
      const { data } = await admin.from("cached_pois").select("place_id, payload").in("place_id", placeIds);
      const out: Record<string, { lat: number; lng: number }> = {};
      for (const r of (data ?? []) as { place_id: string; payload: { lat: number; lng: number } }[]) {
        out[r.place_id] = { lat: r.payload.lat, lng: r.payload.lng };
      }
      return out;
    },
    orderDay: (o) => orderStops({ ...o, httpFetch: fetch, apiKey: ROUTES_KEY }),
    saveItinerary: async (tripId, itin) => {
      const { error } = await admin.from("trips").update({ itinerary: itin }).eq("id", tripId).eq("user_id", userId);
      if (error) throw error;
    },
  };

  try {
    const r = await handleEditItinerary(body, deps);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("edit-itinerary failed:", e instanceof Error ? e.stack ?? e.message : e);
    return new Response(JSON.stringify({ error: "edit failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
