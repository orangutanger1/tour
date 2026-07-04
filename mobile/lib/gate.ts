// mobile/lib/gate.ts
// Client mirror of the server rule in generate-itinerary/handler.ts
// (FREE_TRIP_LIMIT + pro entitlement). Server is authoritative; this only
// decides which screen to show.
export const FREE_TRIP_LIMIT = 1;

export function canStartNewTrip(tripCount: number, isPro: boolean): boolean {
  return isPro || tripCount < FREE_TRIP_LIMIT;
}
