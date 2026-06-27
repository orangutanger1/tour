// mobile/lib/api.test.ts
import { generateItinerary, ApiError, type GenerateResult } from "./api";
import type { Prefs } from "./types";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced" };
const req = { location: "Lisbon", tripDays: 2, prefs };
const result: GenerateResult = {
  tripId: "t1",
  itinerary: { days: [{ day: 1, lodgingPlaceId: null, stops: [{ placeId: "A", name: "A", blurb: "x" }] }] },
};

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
}

test("posts to the function URL with bearer token and body", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const fetchImpl = ((u: string, i: RequestInit) => {
    url = u; init = i;
    return Promise.resolve(new Response(JSON.stringify(result), { status: 200 }));
  }) as unknown as typeof fetch;
  await generateItinerary({ req, accessToken: "jwt123", baseUrl: "https://x.supabase.co", fetchImpl });
  expect(url).toBe("https://x.supabase.co/functions/v1/generate-itinerary");
  expect((init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer jwt123");
  expect(JSON.parse(init!.body as string)).toEqual(req);
});

test("returns parsed result on 200", async () => {
  const out = await generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch(result) });
  expect(out.tripId).toBe("t1");
  expect(out.itinerary.days.length).toBe(1);
});

test("throws ApiError with status on 400", async () => {
  await expect(
    generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch({ error: "bad" }, 400) }),
  ).rejects.toMatchObject({ status: 400 });
});

test("throws ApiError on 429 (rate limit)", async () => {
  await expect(
    generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch({ error: "cap" }, 429) }),
  ).rejects.toBeInstanceOf(ApiError);
});

test("throws ApiError on 502 (generation failed)", async () => {
  await expect(
    generateItinerary({ req, accessToken: "j", baseUrl: "https://x", fetchImpl: fakeFetch({ error: "boom" }, 502) }),
  ).rejects.toMatchObject({ status: 502 });
});
