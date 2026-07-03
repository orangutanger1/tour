// mobile/lib/api.test.ts
import { generateItinerary, waitForTrip, ApiError, type GenerateResult, type TripGenStatus } from "./api";
import type { Prefs } from "./types";

const prefs: Prefs = { interests: [], budget: "mid", pace: "balanced", transport: "balanced" };
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

it("returns tripId from a 202 start response", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ tripId: "t9" }),
  }) as unknown as typeof fetch;
  const out = await generateItinerary({ req, accessToken: "tok", baseUrl: "http://x", fetchImpl });
  expect(out).toEqual({ tripId: "t9" });
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

const noSleep = () => Promise.resolve();

test("waitForTrip resolves when status flips to ready", async () => {
  const statuses = [{ status: "generating" as const }, { status: "generating" as const }, { status: "ready" as const }];
  let i = 0;
  await expect(waitForTrip({ getStatus: async () => statuses[i++], sleep: noSleep })).resolves.toBeUndefined();
  expect(i).toBe(3);
});

test("waitForTrip throws ApiError with row message on failed", async () => {
  await expect(
    waitForTrip({ getStatus: async () => ({ status: "failed", errorMessage: "could not build itinerary" }), sleep: noSleep }),
  ).rejects.toMatchObject({ status: 502, message: "could not build itinerary" });
});

test("waitForTrip times out with 408", async () => {
  await expect(
    waitForTrip({ getStatus: async () => ({ status: "generating" }), sleep: noSleep, intervalMs: 1000, maxMs: 3000 }),
  ).rejects.toMatchObject({ status: 408 });
});

test("waitForTrip tolerates a null row (created but not yet visible)", async () => {
  const seq: (TripGenStatus | null)[] = [null, { status: "ready" }];
  let i = 0;
  await expect(waitForTrip({ getStatus: async () => seq[i++], sleep: noSleep })).resolves.toBeUndefined();
});

test("waitForTrip tolerates transient getStatus failures", async () => {
  const seq = [
    () => Promise.reject(new Error("network blip")),
    () => Promise.reject(new Error("network blip")),
    () => Promise.resolve({ status: "ready" as const }),
  ];
  let i = 0;
  await expect(waitForTrip({ getStatus: () => seq[i++](), sleep: noSleep })).resolves.toBeUndefined();
});

test("waitForTrip gives up after 3 consecutive getStatus failures", async () => {
  await expect(
    waitForTrip({ getStatus: () => Promise.reject(new Error("down")), sleep: noSleep }),
  ).rejects.toThrow("down");
});
