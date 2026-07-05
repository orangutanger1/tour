import {
  INTERESTS, STEPS, STEP_COUNT, stateFromProfile, stateFromRequest, canContinue,
  prefsFromState, buildRequest, tripDaysOf, shouldOfferRegions, withDestination,
  funnelPrefs, EMPTY_FUNNEL, type OnboardingState, type FunnelState,
} from "./onboarding";
import type { Prefs } from "./types";

const base: OnboardingState = {
  interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced",
  location: "Lisbon", startDate: "2026-07-12", endDate: "2026-07-18", tripType: "round",
};

test("INTERESTS has the fixed taxonomy", () => {
  expect(INTERESTS).toEqual(["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"]);
});

test("STEPS is the destination-first flow with the growth funnel prepended", () => {
  expect(STEPS).toEqual([
    "intro", "planningCheck", "hardestParts", "goals",
    "destination", "dates", "classics", "interests", "travelParty", "craft",
    "budget", "pace", "transport", "trust", "start", "midway", "review",
  ]);
  expect(STEP_COUNT).toBe(17);
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

// Indices are computed from STEPS so these survive filler-page reordering.
test("canContinue: destination needs a location", () => {
  const i = STEPS.indexOf("destination");
  expect(canContinue(i, { ...base, location: "  " })).toBe(false);
  expect(canContinue(i, base)).toBe(true);
});

test("canContinue: dates needs a full range", () => {
  const i = STEPS.indexOf("dates");
  expect(canContinue(i, { ...base, endDate: undefined })).toBe(false);
  expect(canContinue(i, base)).toBe(true);
  expect(canContinue(i, { ...base, startDate: "2026-07-12", endDate: "2026-07-12" })).toBe(true); // 1-day
});

test("canContinue: interests needs at least one", () => {
  const i = STEPS.indexOf("interests");
  expect(canContinue(i, { ...base, interests: [] })).toBe(false);
  expect(canContinue(i, base)).toBe(true);
});

test("canContinue: filler pages + choice steps always pass (defaults exist)", () => {
  const alwaysPass = [
    "intro", "planningCheck", "hardestParts", "goals",
    "classics", "travelParty", "craft", "budget", "pace", "transport", "trust",
    "start", "midway", "review",
  ] as const;
  for (const key of alwaysPass) expect(canContinue(STEPS.indexOf(key), base)).toBe(true);
});

test("prefsFromState extracts prefs", () => {
  expect(prefsFromState(base)).toEqual({ interests: ["food"], budget: "mid", pace: "balanced", transport: "balanced" });
});

test("shouldOfferRegions for country / admin_area_1 only", () => {
  expect(shouldOfferRegions(["country"])).toBe(true);
  expect(shouldOfferRegions(["administrative_area_level_1"])).toBe(true);
  expect(shouldOfferRegions(["locality"])).toBe(false);
});

test("withDestination seeds location", () => {
  expect(withDestination(base, "Kyoto, Japan").location).toBe("Kyoto, Japan");
  expect(withDestination(base, "  Kyoto, Japan  ").location).toBe("Kyoto, Japan");
});

test("withDestination is a no-op without a destination", () => {
  expect(withDestination(base, undefined)).toBe(base);
  expect(withDestination(base, "")).toBe(base);
  expect(withDestination(base, "   ")).toBe(base);
});

test("funnelPrefs extracts camelCase keys for the profile jsonb merge", () => {
  const f: FunnelState = {
    planningCheck: "improving", hardestParts: ["pacing", "stopOrder"], goals: ["saveTime"],
  };
  expect(funnelPrefs(f)).toEqual({
    planningCheck: "improving", hardestParts: ["pacing", "stopOrder"], goals: ["saveTime"],
    attributionSource: undefined,
  });
});

test("EMPTY_FUNNEL starts with no selections", () => {
  expect(EMPTY_FUNNEL).toEqual({ hardestParts: [], goals: [] });
  expect(funnelPrefs(EMPTY_FUNNEL)).toEqual({
    planningCheck: undefined, hardestParts: [], goals: [], attributionSource: undefined,
  });
});
