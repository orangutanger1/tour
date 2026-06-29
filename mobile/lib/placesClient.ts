// mobile/lib/placesClient.ts
export async function autocompletePlaces(opts: {
  query: string;
  baseUrl: string;
  anonKey: string;
  addresses?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; placeId: string; types: string[] }[]> {
  const query = opts.query.trim();
  if (query.length < 2) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/places-autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": opts.anonKey,
      "Authorization": `Bearer ${opts.anonKey}`,
    },
    body: JSON.stringify({ query, addresses: opts.addresses }),
  });
  if (!res.ok) throw new Error(`autocomplete failed (${res.status})`);
  const data = await res.json() as { suggestions?: { text: string; placeId: string; types?: string[] }[] };
  return (data.suggestions ?? []).map((s) => ({ text: s.text, placeId: s.placeId, types: s.types ?? [] }));
}

export interface Region { label: string; hook: string; }

export async function suggestRegions(opts: {
  placeId: string;
  baseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}): Promise<Region[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/suggest-regions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": opts.anonKey,
      "Authorization": `Bearer ${opts.anonKey}`,
    },
    body: JSON.stringify({ placeId: opts.placeId }),
  });
  if (!res.ok) return [];
  const data = await res.json() as { regions?: Region[] };
  return data.regions ?? [];
}
