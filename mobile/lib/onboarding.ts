// mobile/lib/onboarding.ts
import type { Prefs, TripType } from "./types";
import type { GenerateRequest } from "./api";
import { inclusiveDayCount } from "./dates";

export const INTERESTS = ["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"] as const;

// One question per page; index = step number. "intro"/"craft"/"trust"/"midway" are
// non-input ethos pages (see INFO in onboarding.tsx); "classics" scatters the landmark
// trio (see LandmarkScatter); "travelParty" is a pure-UI filler
// question whose answer is screen-local and never sent to the backend. All are unhandled
// in canContinue → default true, so Continue is always enabled on them.
export const STEPS = [
  "intro", "planningCheck", "hardestParts", "goals", "goodPlace",
  "relateA1", "relateA2", "craft", "relateB1", "relateB2", "trust",
  "notifications", "attribution",
  "destination", "dates", "classics", "interests", "travelParty",
  "budget", "pace", "transport", "start", "midway", "review",
] as const;
export const STEP_COUNT = STEPS.length;

// Growth-funnel qualifying quiz taxonomies (bare values; labels/descriptions/
// icons live in onboarding.tsx next to INTEREST_ICONS et al).
export const PLANNING_CHECK = ["great", "improving", "notPlanning"] as const;
export const HARDEST_PARTS = ["pacing", "hiddenGems", "stopOrder", "foodBreaks", "coordinating"] as const;
export const GOALS = ["saveTime", "avoidBacktracking", "discoverSpots", "stayFlexible", "lessStress"] as const;
export const ATTRIBUTION_SOURCES = ["appStore", "friend", "social", "google", "other"] as const;

// Funnel answers are segmentation/personalization data, not trip-generation
// inputs — kept separate from OnboardingState so buildRequest/stateFromRequest
// (the trip-generation contract) never has to know about them.
export interface FunnelState {
  planningCheck?: (typeof PLANNING_CHECK)[number];
  hardestParts: string[];
  goals: string[];
  attributionSource?: (typeof ATTRIBUTION_SOURCES)[number];
}

export const EMPTY_FUNNEL: FunnelState = { hardestParts: [], goals: [] };

// Shape merged into profiles.default_prefs (camelCase, matching the existing
// galleryStyle key) via lib/profile.ts's saveFunnelAnswers — never through
// upsertProfile/prefsFromState, which are the Prefs-typed generation contract.
export function funnelPrefs(f: FunnelState): Record<string, unknown> {
  return {
    planningCheck: f.planningCheck,
    hardestParts: f.hardestParts,
    goals: f.goals,
    attributionSource: f.attributionSource,
  };
}

export interface OnboardingState {
  interests: string[];
  budget: Prefs["budget"];
  pace: Prefs["pace"];
  transport: Prefs["transport"];
  location: string;
  destinationPlaceId?: string;
  startDate?: string;   // ISO YYYY-MM-DD
  endDate?: string;
  tripType: TripType;
  startLocation?: string;
  startPlaceId?: string;
}

export function stateFromProfile(prefs: Prefs | null): OnboardingState {
  return {
    interests: prefs?.interests ?? [],
    budget: prefs?.budget ?? "mid",
    pace: prefs?.pace ?? "balanced",
    transport: prefs?.transport ?? "balanced",
    location: "",
    destinationPlaceId: undefined,
    startDate: undefined,
    endDate: undefined,
    tripType: "round",
    startLocation: undefined,
    startPlaceId: undefined,
  };
}

// Rebuild onboarding state from a request the user already submitted, so an
// in-progress trip survives remounts (e.g. "Edit trip" after a failed generate).
export function stateFromRequest(req: GenerateRequest): OnboardingState {
  return {
    interests: req.prefs.interests,
    budget: req.prefs.budget,
    pace: req.prefs.pace,
    transport: req.prefs.transport,
    location: req.location,
    destinationPlaceId: req.destinationPlaceId,
    startDate: req.startDate,
    endDate: req.endDate,
    tripType: req.tripType ?? "round",
    startLocation: req.startLocation,
    startPlaceId: req.startPlaceId,
  };
}

// Seed the destination step from a route param (Discover's "Plan a trip").
export function withDestination(s: OnboardingState, destination?: string): OnboardingState {
  const loc = destination?.trim();
  return loc ? { ...s, location: loc } : s;
}

// Days derive from the calendar range — no separate tripDays state, no clamp.
export function tripDaysOf(s: OnboardingState): number {
  return s.startDate && s.endDate ? inclusiveDayCount(s.startDate, s.endDate) : 0;
}

export function canContinue(step: number, s: OnboardingState): boolean {
  switch (STEPS[step]) {
    case "destination": return s.location.trim().length > 0;
    case "dates": return tripDaysOf(s) >= 1;
    case "interests": return s.interests.length >= 1;
    default: return true;
  }
}

export function prefsFromState(s: OnboardingState): Prefs {
  return { interests: s.interests, budget: s.budget, pace: s.pace, transport: s.transport };
}

export function buildRequest(s: OnboardingState): GenerateRequest {
  return {
    location: s.location.trim(),
    tripDays: tripDaysOf(s),
    prefs: prefsFromState(s),
    destinationPlaceId: s.destinationPlaceId,
    startDate: s.startDate,
    endDate: s.endDate,
    tripType: s.tripType,
    startLocation: s.startLocation?.trim() || undefined,
    startPlaceId: s.startPlaceId,
  };
}

const REGION_TYPES = new Set(["country", "administrative_area_level_1"]);
export function shouldOfferRegions(types: string[]): boolean {
  return types.some((t) => REGION_TYPES.has(t));
}
