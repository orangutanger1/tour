import { canStartNewTrip, FREE_TRIP_LIMIT } from "./gate";

test("free user under the limit can start", () => {
  expect(canStartNewTrip(0, false)).toBe(true);
});

test("free user at the limit cannot start", () => {
  expect(canStartNewTrip(FREE_TRIP_LIMIT, false)).toBe(false);
  expect(canStartNewTrip(5, false)).toBe(false);
});

test("pro user always can start", () => {
  expect(canStartNewTrip(0, true)).toBe(true);
  expect(canStartNewTrip(99, true)).toBe(true);
});
