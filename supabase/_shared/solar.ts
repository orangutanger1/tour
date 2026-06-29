// supabase/_shared/solar.ts
// NOAA sunset approximation. Pure, no deps, no network.
// ponytail: timezone approximated as lng/15 h, so longitude cancels and the
// result is local *solar* time. Swap for a real tz lookup if exact wall-clock
// time ever matters.

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - start) / 86_400_000);
}

// Minutes from local midnight (0-1439) of sunset at lat/lng on `date`.
export function sunsetLocalMinutes(lat: number, lng: number, date: Date): number {
  const rad = Math.PI / 180;
  const n = dayOfYear(date);
  const gamma = (2 * Math.PI / 365) * (n - 1 + 0.5);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const zenith = 90.833 * rad;
  const cosH = Math.cos(zenith) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  if (cosH < -1) return 1439; // polar day: sun stays up
  if (cosH > 1) return 0;     // polar night: sun stays down
  const ha = Math.acos(cosH) / rad; // hour angle, degrees
  const solarNoonUTC = 720 - 4 * lng - eqtime; // UTC minutes
  const sunsetUTC = solarNoonUTC + 4 * ha;
  const tzOffsetMin = (lng / 15) * 60; // approx tz; cancels the -4*lng above
  const minutes = sunsetUTC + tzOffsetMin;
  return Math.max(0, Math.min(1439, Math.round(minutes)));
}

export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
