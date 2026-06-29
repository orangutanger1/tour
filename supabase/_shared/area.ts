type LatLng = { lat: number; lng: number };
export type Viewport = { low: LatLng; high: LatLng } | null;
export type Transport = "compact" | "balanced" | "far";

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// Default viewport radius when details lack a viewport (~city scale).
const DEFAULT_RADIUS_KM = 10;

export function areaRadiusKm(opts: { viewport: Viewport; transport: Transport }): number {
  const vp = opts.viewport;
  const viewportRadius = vp ? haversineKm(vp.low, vp.high) / 2 : DEFAULT_RADIUS_KM;
  switch (opts.transport) {
    case "compact": return clamp(viewportRadius * 0.3, 2, 5);
    case "balanced": return clamp(viewportRadius, 5, 25);
    case "far": return clamp(viewportRadius, 25, 150);
  }
}
