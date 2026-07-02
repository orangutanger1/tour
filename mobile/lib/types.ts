// mobile/lib/types.ts
// MIRROR of supabase/_shared/types.ts — backend is the source of truth. Keep in sync by hand.
export type TripType = "round" | "oneway";

export interface Prefs {
  interests: string[];
  budget: "low" | "mid" | "high";
  pace: "relaxed" | "balanced" | "packed";
  transport: "compact" | "balanced" | "far";
  diet?: string[];
  accessibility?: string[];
}

export interface Poi {
  placeId: string;
  name: string;
  kind: "attraction" | "food" | "lodging";
  lat: number;
  lng: number;
  priceLevel?: number;
  rating?: number;
  address?: string;
  deepLink?: string;
}

export interface Stop {
  placeId: string;                 // "" for meal-gap pseudo-stops
  name: string;
  blurb: string;                       // "why a local picks this"
  travelMinutesFromPrev?: number;
  dwellMinutes?: number;               // realistic visit length
  kind?: "attraction" | "meal" | "meal-gap";
  startTime?: string;                  // absolute clock, e.g. "9:00 AM"
  mealSlot?: "lunch" | "dinner";       // meal + meal-gap stops only
}

export interface ItineraryDay {
  day: number;
  lodgingPlaceId: string | null;
  stops: Stop[];
  routePolyline?: string;
}

export interface Itinerary {
  days: ItineraryDay[];
}
