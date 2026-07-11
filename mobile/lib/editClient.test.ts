import { requestDayReroute } from "./editClient";

test("returns the day on 200", async () => {
  const day = { day: 1, lodgingPlaceId: null, stops: [] };
  const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ day }) }) as never;
  const out = await requestDayReroute({ tripId: "t", day: 1, accessToken: "a", baseUrl: "http://x", fetchImpl });
  expect(out).toEqual(day);
});

test("returns null on failure", async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
  const out = await requestDayReroute({ tripId: "t", day: 1, accessToken: "a", baseUrl: "http://x", fetchImpl });
  expect(out).toBeNull();
});
