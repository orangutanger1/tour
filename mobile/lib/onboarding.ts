// mobile/lib/onboarding.ts
import type { Prefs } from "./types";
import type { GenerateRequest } from "./api";

export const INTERESTS = ["scenic", "food", "history", "nightlife", "outdoors", "art", "shopping"] as const;
export const MAX_TRIP_DAYS = 30;

export interface OnboardingState {
  interests: string[];
  budget: Prefs["budget"];
  pace: Prefs["pace"];
  transport: Prefs["transport"];
  location: string;
  tripDays: number;
  destinationPlaceId?: string;
}

export function stateFromProfile(prefs: Prefs | null): OnboardingState {
  return {
    interests: prefs?.interests ?? [],
    budget: prefs?.budget ?? "mid",
    pace: prefs?.pace ?? "balanced",
    transport: prefs?.transport ?? "balanced",
    location: "",
    tripDays: 3,
    destinationPlaceId: undefined,
  };
}

export function canContinue(step: number, s: OnboardingState): boolean {
  if (step === 0) return s.interests.length >= 1;
  if (step === 1) return s.location.trim().length > 0 && s.tripDays >= 1 && s.tripDays <= MAX_TRIP_DAYS;
  return true;
}

export function prefsFromState(s: OnboardingState): Prefs {
  return { interests: s.interests, budget: s.budget, pace: s.pace, transport: s.transport };
}

export function buildRequest(s: OnboardingState): GenerateRequest {
  return { location: s.location.trim(), tripDays: s.tripDays, prefs: prefsFromState(s), destinationPlaceId: s.destinationPlaceId };
}
