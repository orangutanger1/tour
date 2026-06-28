// supabase/functions/places-autocomplete/handler.ts
export interface AutocompleteDeps {
  search(query: string): Promise<string[]>;
}

export async function handleAutocomplete(
  body: { query?: string },
  deps: AutocompleteDeps,
): Promise<{ status: number; body: unknown }> {
  const query = (body?.query ?? "").trim();
  if (query.length < 2) return { status: 400, body: { error: "query too short" } };
  try {
    const suggestions = await deps.search(query);
    return { status: 200, body: { suggestions } };
  } catch (e) {
    console.error("places-autocomplete upstream error:", e instanceof Error ? e.message : e);
    return { status: 502, body: { error: "autocomplete failed" } };
  }
}
