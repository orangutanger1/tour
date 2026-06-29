// supabase/_shared/types.ts
export interface Prefs {
  interests: string[];                 // e.g. ["scenic", "food", "history"]
  budget: "low" | "mid" | "high";
  pace: "relaxed" | "balanced" | "packed";
  transport: "compact" | "balanced" | "far";
  diet?: string[];                     // optional, e.g. ["vegetarian"]
  accessibility?: string[];            // optional
}

export interface Poi {
  placeId: string;
  name: string;
  kind: "attraction" | "food" | "lodging";
  lat: number;
  lng: number;
  priceLevel?: number;                 // 0-4
  rating?: number;
  address?: string;
  deepLink?: string;                   // booking/airbnb link for lodging
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
  day: number;                         // 1-indexed
  lodgingPlaceId: string | null;
  stops: Stop[];
  routePolyline?: string;
}

export interface Itinerary {
  days: ItineraryDay[];
}

export type LlmComplete = (prompt: string) => Promise<string>;
export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;
