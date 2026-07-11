import type { ItineraryDay } from "./types";

export async function requestDayReroute(opts: {
  tripId: string; day: number; accessToken: string; baseUrl: string; fetchImpl?: typeof fetch;
}): Promise<ItineraryDay | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${opts.baseUrl}/functions/v1/edit-itinerary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.accessToken}` },
      body: JSON.stringify({ tripId: opts.tripId, day: opts.day }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { day?: ItineraryDay };
    return data.day ?? null;
  } catch {
    return null;
  }
}
