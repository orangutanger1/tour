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
  expect(out).toEqual([{ text: "Lisbon, Portugal", placeId: "p1", types: [] }]);
  expect(fetchImpl).toHaveBeenCalledWith(
    "http://x/functions/v1/places-autocomplete",
    expect.objectContaining({ headers: expect.objectContaining({ "apikey": "k" }) })
  );
});

it("sends addresses flag in the body when requested", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) }) as unknown as typeof fetch;
  await autocompletePlaces({ query: "1 Main St", baseUrl: "http://x", anonKey: "k", addresses: true, fetchImpl });
  const sentBody = JSON.parse((fetchImpl as jest.Mock).mock.calls[0][1].body);
  expect(sentBody.addresses).toBe(true);
});

it("drops suggestions with empty text or placeId", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ suggestions: [
      { text: "", placeId: "p1" },
      { text: "Japan", placeId: "" },
      { text: "   ", placeId: "p3" },
      { text: "Japan", placeId: "p2" },
    ] }),
  }) as unknown as typeof fetch;
  const out = await autocompletePlaces({ query: "Japan", baseUrl: "http://x", anonKey: "k", fetchImpl });
  expect(out).toEqual([{ text: "Japan", placeId: "p2", types: [] }]);
});

test("throws on non-2xx", async () => {
  await expect(autocompletePlaces({ query: "Lis", baseUrl: "https://x", anonKey: "k", fetchImpl: fakeFetch({ error: "no" }, 500) }))
    .rejects.toBeTruthy();
});

import { suggestRegions } from "./placesClient";

test("suggestRegions returns regions from the function", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ regions: [{ label: "NorCal", hook: "Yosemite", placeId: "nc" }] }) });
  const out = await suggestRegions({ placeId: "p", baseUrl: "http://x", anonKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
  expect(out).toEqual([{ label: "NorCal", hook: "Yosemite", placeId: "nc" }]);
});

test("suggestRegions returns [] on error response", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
  const out = await suggestRegions({ placeId: "p", baseUrl: "http://x", anonKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
  expect(out).toEqual([]);
});
