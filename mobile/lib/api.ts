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

export interface StartGenerateResult {
  tripId: string;
}

export interface TripGenStatus {
  status: "generating" | "ready" | "failed";
  errorMessage?: string;
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
}): Promise<StartGenerateResult> {
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
  return await res.json() as StartGenerateResult;
}

// Poll until the background pipeline lands. The row may briefly be invisible
// right after the 202 (read-after-write lag) — treat null as "keep waiting".
export async function waitForTrip(opts: {
  getStatus: () => Promise<TripGenStatus | null>;
  intervalMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxMs = opts.maxMs ?? 300_000;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let failures = 0;
  for (let waited = 0; ; waited += intervalMs) {
    try {
      const s = await opts.getStatus();
      failures = 0;
      if (s?.status === "ready") return;
      if (s?.status === "failed") throw new ApiError(502, s.errorMessage ?? "could not build itinerary");
    } catch (e) {
      // A blip mid-poll must not abort a 5-minute wait — "Try again" after a
      // spurious error starts a duplicate generation. Tolerate short outages.
      if (e instanceof ApiError) throw e;
      if (++failures >= 3) throw e;
    }
    if (waited + intervalMs > maxMs) throw new ApiError(408, "Still building — check Your Trips in a minute.");
    await sleep(intervalMs);
  }
}
