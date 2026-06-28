// mobile/lib/types.ts
// MIRROR of supabase/_shared/types.ts — backend is the source of truth. Keep in sync by hand.
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
  placeId: string;
  name: string;
  blurb: string;
  travelMinutesFromPrev?: number;
}

export interface ItineraryDay {
  day: number;
  lodgingPlaceId: string | null;
  stops: Stop[];
}

export interface Itinerary {
  days: ItineraryDay[];
}
