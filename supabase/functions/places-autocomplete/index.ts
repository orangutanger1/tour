// supabase/functions/places-autocomplete/index.ts
import { handleAutocomplete } from "./handler.ts";
import { searchAutocomplete } from "../../_shared/places.ts";

const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_KEY")!;

Deno.serve(async (req: Request) => {
  let body: { query?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const result = await handleAutocomplete(body, {
    search: (query) => searchAutocomplete({ query, httpFetch: fetch, apiKey: PLACES_KEY }),
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });
});
