import { autocompletePlaces } from "./placesClient";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
}

test("returns [] without calling for short query", async () => {
  let called = false;
  const fetchImpl = (() => { called = true; return Promise.resolve(new Response("{}")); }) as unknown as typeof fetch;
  expect(await autocompletePlaces({ query: "a", baseUrl: "https://x", anonKey: "k", fetchImpl })).toEqual([]);
  expect(called).toBe(false);
});

test("posts to the function URL with anon key and parses suggestions", async () => {
  let url = ""; let init: RequestInit | undefined;
  const fetchImpl = ((u: string, i: RequestInit) => { url = u; init = i;
    return Promise.resolve(new Response(JSON.stringify({ suggestions: ["Lisbon, Portugal"] }), { status: 200 })); }) as unknown as typeof fetch;
  const out = await autocompletePlaces({ query: "Lis", baseUrl: "https://x.supabase.co", anonKey: "anon123", fetchImpl });
  expect(url).toBe("https://x.supabase.co/functions/v1/places-autocomplete");
  expect((init!.headers as Record<string, string>)["apikey"]).toBe("anon123");
  expect(out).toEqual(["Lisbon, Portugal"]);
});

test("throws on non-2xx", async () => {
  await expect(autocompletePlaces({ query: "Lis", baseUrl: "https://x", anonKey: "k", fetchImpl: fakeFetch({ error: "no" }, 500) }))
    .rejects.toBeTruthy();
});
