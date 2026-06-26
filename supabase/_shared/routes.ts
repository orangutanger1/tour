// supabase/_shared/routes.ts
import type { HttpFetch, Poi } from "./types.ts";

type Ordered = { placeId: string; travelMinutesFromPrev: number };

const FIELD_MASK = "routes.optimizedIntermediateWaypointIndex,routes.legs.duration";

function durationToMinutes(d: unknown): number {
  if (typeof d !== "string") return 0;
  const seconds = Number(d.replace(/s$/, ""));
  return Number.isFinite(seconds) ? Math.round(seconds / 60) : 0;
}

function fallback(stops: Poi[]): Ordered[] {
  return stops.map((s) => ({ placeId: s.placeId, travelMinutesFromPrev: 0 }));
}

export async function orderStops(opts: {
  stops: Poi[];
  anchor: { lat: number; lng: number };
  httpFetch: HttpFetch;
  apiKey: string;
  maxStops?: number;
}): Promise<Ordered[]> {
  const { anchor, httpFetch, apiKey } = opts;
  const capped = opts.stops.slice(0, opts.maxStops ?? 8);
  if (capped.length === 0) return [];

  const waypoint = (lat: number, lng: number) => ({ location: { latLng: { latitude: lat, longitude: lng } } });

  try {
    const res = await httpFetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        origin: waypoint(anchor.lat, anchor.lng),
        destination: waypoint(anchor.lat, anchor.lng),
        intermediates: capped.map((s) => waypoint(s.lat, s.lng)),
        travelMode: "DRIVE",
        optimizeWaypointOrder: true,
      }),
    });
    if (!res.ok) return fallback(capped);

    const data = await res.json() as {
      routes?: Array<{ optimizedIntermediateWaypointIndex?: number[]; legs?: Array<{ duration?: string }> }>;
    };
    const route = data.routes?.[0];
    const order = route?.optimizedIntermediateWaypointIndex;
    if (!order || order.length !== capped.length) return fallback(capped);

    const legs = route?.legs ?? [];
    // legs[0] = anchor -> first stop; legs[i] = (i-1)th stop -> ith stop
    return order.map((origIdx, position) => ({
      placeId: capped[origIdx].placeId,
      travelMinutesFromPrev: durationToMinutes(legs[position]?.duration),
    }));
  } catch {
    return fallback(capped);
  }
}
