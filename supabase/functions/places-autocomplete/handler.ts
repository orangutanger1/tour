// supabase/functions/places-autocomplete/handler.ts
export interface AutocompleteDeps {
  search(query: string, addresses?: boolean): Promise<{ text: string; placeId: string; types: string[] }[]>;
}

export async function handleAutocomplete(
  body: { query?: string; addresses?: boolean },
  deps: AutocompleteDeps,
): Promise<{ status: number; body: unknown }> {
  const query = (body?.query ?? "").trim();
  if (query.length < 2) return { status: 400, body: { error: "query too short" } };
  try {
    const suggestions = (await deps.search(query, body?.addresses))
      .filter((s) => s.text?.trim() && s.placeId);
    return { status: 200, body: { suggestions } };
  } catch (e) {
    console.error("places-autocomplete upstream error:", e instanceof Error ? e.message : e);
    return { status: 502, body: { error: "autocomplete failed" } };
  }
}
