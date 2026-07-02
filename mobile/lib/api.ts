// mobile/lib/api.ts
import type { Itinerary, Prefs, TripType } from "./types";

export interface GenerateRequest {
  location: string;
  tripDays: number;
  prefs: Prefs;
  destinationPlaceId?: string;
  startLocation?: string;
  startPlaceId?: string;
  startDate?: string;   // ISO YYYY-MM-DD — calendar is source of truth
  endDate?: string;
  tripType?: TripType;  // default "round"
}

export interface GenerateResult {
  tripId: string;
  itinerary: Itinerary;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function generateItinerary(opts: {
  req: GenerateRequest;
  accessToken: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<GenerateResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.baseUrl}/functions/v1/generate-itinerary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify(opts.req),
  });
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* non-JSON body */ }
    throw new ApiError(res.status, message);
  }
  return await res.json() as GenerateResult;
}
