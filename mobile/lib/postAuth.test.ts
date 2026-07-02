import { postAuthRoute } from "./postAuth";

test("new user (no trips) goes to plan-a-trip onboarding", () => {
  expect(postAuthRoute(0)).toBe("/onboarding");
});

test("returning user goes home", () => {
  expect(postAuthRoute(1)).toBe("/");
  expect(postAuthRoute(12)).toBe("/");
});

test("unknown trip count (fetch failed) goes home, not onboarding", () => {
  expect(postAuthRoute(undefined)).toBe("/");
});
