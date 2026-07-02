import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  prefsFromState, buildRequest, tripDaysOf, shouldOfferRegions, type OnboardingState,
} from "./onboarding";
import type { Prefs } from "./types";

const base: OnboardingState = {
  interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced",
  location: "Lisbon", startDate: "2026-07-12", endDate: "2026-07-18", tripType: "round",
};

test("INTERESTS has the fixed taxonomy", () => {
  expect(INTERESTS).toEqual(["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"]);
});

test("STEPS is the 8-page destination-first flow", () => {
  expect(STEPS).toEqual(["destination", "dates", "interests", "budget", "pace", "transport", "start", "review"]);
  expect(STEP_COUNT).toBe(8);
});

test("stateFromProfile seeds prefs, blank trip fields, round trip default", () => {
  const prefs: Prefs = { interests: ["art"], budget: "high", pace: "packed", transport: "balanced" };
  const s = stateFromProfile(prefs);
  expect(s.interests).toEqual(["art"]);
  expect(s.budget).toBe("high");
  expect(s.location).toBe("");
  expect(s.startDate).toBeUndefined();
  expect(s.tripType).toBe("round");
});

test("stateFromProfile uses defaults when null", () => {
  const s = stateFromProfile(null);
  expect(s.interests).toEqual([]);
  expect(s.budget).toBe("mid");
  expect(s.tripType).toBe("round");
});

test("tripDaysOf derives inclusive days from the range, 0 when incomplete", () => {
  expect(tripDaysOf(base)).toBe(7);
  expect(tripDaysOf({ ...base, endDate: undefined })).toBe(0);
  expect(tripDaysOf({ ...base, startDate: "2026-07-01", endDate: "2026-09-01" })).toBe(63); // no clamp
});

test("buildRequest emits dates, trip type, and derived tripDays", () => {
  const req = buildRequest(base);
  expect(req.tripDays).toBe(7);
  expect(req.startDate).toBe("2026-07-12");
  expect(req.endDate).toBe("2026-07-18");
  expect(req.tripType).toBe("round");
  expect(req.location).toBe("Lisbon");
});

test("stateFromRequest round-trips buildRequest (rehydrate in-progress trip)", () => {
  const s: OnboardingState = {
    interests: ["scenic", "food"], budget: "high", pace: "balanced", transport: "far",
    location: "Canada", destinationPlaceId: "p-canada",
    startDate: "2026-08-01", endDate: "2026-08-21", tripType: "oneway",
    startLocation: "YVR", startPlaceId: "p-yvr",
  };
  expect(stateFromRequest(buildRequest(s))).toEqual(s);
});

test("stateFromRequest defaults tripType to round when absent (old requests)", () => {
  const req = buildRequest(base);
  delete (req as unknown as Record<string, unknown>).tripType;
  expect(stateFromRequest(req).tripType).toBe("round");
});

test("canContinue: destination needs a location", () => {
  expect(canContinue(0, { ...base, location: "  " })).toBe(false);
  expect(canContinue(0, base)).toBe(true);
});

test("canContinue: dates needs a full range", () => {
  expect(canContinue(1, { ...base, endDate: undefined })).toBe(false);
  expect(canContinue(1, base)).toBe(true);
  expect(canContinue(1, { ...base, startDate: "2026-07-12", endDate: "2026-07-12" })).toBe(true); // 1-day
});

test("canContinue: interests needs at least one", () => {
  expect(canContinue(2, { ...base, interests: [] })).toBe(false);
  expect(canContinue(2, base)).toBe(true);
});

test("canContinue: budget/pace/transport/start/review always pass (defaults exist)", () => {
  for (const step of [3, 4, 5, 6, 7]) expect(canContinue(step, base)).toBe(true);
});

test("prefsFromState extracts prefs", () => {
  expect(prefsFromState(base)).toEqual({ interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced" });
});

test("shouldOfferRegions for country / admin_area_1 only", () => {
  expect(shouldOfferRegions(["country"])).toBe(true);
  expect(shouldOfferRegions(["administrative_area_level_1"])).toBe(true);
  expect(shouldOfferRegions(["locality"])).toBe(false);
});
