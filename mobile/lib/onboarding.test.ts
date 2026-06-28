import {
  INTERESTS, MAX_TRIP_DAYS, stateFromProfile, canContinue, prefsFromState, buildRequest,
  type OnboardingState,
} from "./onboarding";
import type { Prefs } from "./types";

const base: OnboardingState = {
  interests: ["food"], budget: "mid", pace: "balanced", location: "Lisbon", tripDays: 3,
};

test("INTERESTS has the fixed taxonomy", () => {
  expect(INTERESTS).toEqual(["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"]);
});

test("stateFromProfile seeds from prefs, blank trip fields", () => {
  const prefs: Prefs = { interests: ["art"], budget: "high", pace: "packed" };
  const s = stateFromProfile(prefs);
  expect(s.interests).toEqual(["art"]);
  expect(s.budget).toBe("high");
  expect(s.pace).toBe("packed");
  expect(s.location).toBe("");
  expect(s.tripDays).toBeGreaterThanOrEqual(1);
});

test("stateFromProfile uses defaults when null", () => {
  const s = stateFromProfile(null);
  expect(s.interests).toEqual([]);
  expect(s.budget).toBe("mid");
  expect(s.pace).toBe("balanced");
});

test("canContinue step 0 needs >=1 interest", () => {
  expect(canContinue(0, { ...base, interests: [] })).toBe(false);
  expect(canContinue(0, { ...base, interests: ["food"] })).toBe(true);
});

test("canContinue step 1 needs location and valid tripDays", () => {
  expect(canContinue(1, { ...base, location: "  " })).toBe(false);
  expect(canContinue(1, { ...base, tripDays: 0 })).toBe(false);
  expect(canContinue(1, { ...base, tripDays: MAX_TRIP_DAYS + 1 })).toBe(false);
  expect(canContinue(1, base)).toBe(true);
});

test("canContinue step 2 (review) is always true", () => {
  expect(canContinue(2, base)).toBe(true);
});

test("prefsFromState drops trip fields", () => {
  expect(prefsFromState(base)).toEqual({ interests: ["food"], budget: "mid", pace: "balanced" });
});

test("buildRequest trims location and carries prefs", () => {
  expect(buildRequest({ ...base, location: "  Porto " })).toEqual({
    location: "Porto",
    tripDays: 3,
    prefs: { interests: ["food"], budget: "mid", pace: "balanced" },
  });
});

it("buildRequest includes destinationPlaceId when set", () => {
  const s = { ...stateFromProfile(null), location: "Lisbon", destinationPlaceId: "p1" };
  expect(buildRequest(s).destinationPlaceId).toBe("p1");
});
