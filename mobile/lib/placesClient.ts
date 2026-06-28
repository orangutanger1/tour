// mobile/lib/placesClient.ts
export async function autocompletePlaces(opts: {
  query: string;
  baseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; placeId: string }[]> {
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
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`autocomplete failed (${res.status})`);
  const data = await res.json() as { suggestions?: { text: string; placeId: string }[] };
  return data.suggestions ?? [];
}
