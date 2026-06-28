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

it("returns suggestion objects", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ suggestions: [{ text: "Lisbon, Portugal", placeId: "p1" }] }),
  }) as unknown as typeof fetch;
  const out = await autocompletePlaces({ query: "Lis", baseUrl: "http://x", anonKey: "k", fetchImpl });
  expect(out).toEqual([{ text: "Lisbon, Portugal", placeId: "p1" }]);
  expect(fetchImpl).toHaveBeenCalledWith(
    "http://x/functions/v1/places-autocomplete",
    expect.objectContaining({ headers: expect.objectContaining({ "apikey": "k" }) })
  );
});

test("throws on non-2xx", async () => {
  await expect(autocompletePlaces({ query: "Lis", baseUrl: "https://x", anonKey: "k", fetchImpl: fakeFetch({ error: "no" }, 500) }))
    .rejects.toBeTruthy();
});
