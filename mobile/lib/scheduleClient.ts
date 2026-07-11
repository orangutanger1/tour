// mobile/lib/scheduleClient.ts
import type { ItineraryDay, Stop } from "./types";
import { isAttraction } from "./editItinerary";

const DAY_START_MIN = 9 * 60;
const TRAVEL_BUFFER = 1.2;
const MEAL_TRAVEL_MIN = 10;
const LUNCH_TARGET_MIN = 12 * 60 + 30;
const CLIENT_SUNSET_MIN = 19 * 60;
const MIN_PER_KM = 2;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180, la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function estimateTravel(stops: Stop[], coords: Record<string, { lat: number; lng: number }>): Stop[] {
  return stops.map((s, i) => {
    if (i === 0) return { ...s, travelMinutesFromPrev: 0 };
    const prev = coords[stops[i - 1].placeId];
    const cur = coords[s.placeId];
    const min = prev && cur ? Math.round(haversineKm(prev, cur) * MIN_PER_KM) : (s.travelMinutesFromPrev ?? 0);
    return { ...s, travelMinutesFromPrev: min };
  });
}

export function scheduleDayClient(
  day: ItineraryDay,
  coords: Record<string, { lat: number; lng: number }>,
): ItineraryDay {
  const attractions = estimateTravel(day.stops.filter(isAttraction), coords);
  const lunch = day.stops.find((s) => s.mealSlot === "lunch")
    ?? { placeId: "", name: "Lunch — your pick", blurb: "Free time to grab a local bite.", kind: "meal-gap", dwellMinutes: 60 } as Stop;
  const dinner = day.stops.find((s) => s.mealSlot === "dinner")
    ?? { placeId: "", name: "Dinner — your pick", blurb: "Free time for dinner near sunset.", kind: "meal-gap", dwellMinutes: 60 } as Stop;

  const lunchDwell = lunch.dwellMinutes ?? 60;
  const lunchStart = LUNCH_TARGET_MIN;
  const lunchEnd = lunchStart + MEAL_TRAVEL_MIN + lunchDwell;
  const dinnerStart = Math.max(CLIENT_SUNSET_MIN, lunchEnd);

  const morningLen = Math.max(0, lunchStart - DAY_START_MIN);
  const afternoonLen = Math.max(0, dinnerStart - lunchEnd);
  const total = morningLen + afternoonLen;
  const n = attractions.length;
  const morningCount = total <= 0 || n <= 1 ? n : Math.max(1, Math.min(n - 1, Math.round((n * morningLen) / total)));
  const morning = attractions.slice(0, morningCount);
  const afternoon = attractions.slice(morningCount);

  const out: Stop[] = [];
  const spread = (list: Stop[], start: number, end: number) => {
    if (list.length === 0) return;
    let dwellSum = 0, travelSum = 0;
    list.forEach((s, i) => {
      dwellSum += s.dwellMinutes ?? 0;
      if (i > 0) travelSum += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
    });
    const slack = Math.max(0, end - start - dwellSum - travelSum);
    const gap = list.length > 1 ? slack / (list.length - 1) : 0;
    let clock = start;
    list.forEach((s, i) => {
      if (i > 0) { clock += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER); clock += Math.round(gap); }
      out.push({ ...s, startTime: formatClock(clock) });
      clock += s.dwellMinutes ?? 0;
    });
  };
  const placeMeal = (meal: Stop, slot: "lunch" | "dinner", at: number) =>
    out.push({ ...meal, startTime: formatClock(at), mealSlot: slot, dwellMinutes: meal.dwellMinutes ?? 60 });

  spread(morning, DAY_START_MIN, lunchStart);
  placeMeal(lunch, "lunch", lunchStart);
  spread(afternoon, lunchEnd, dinnerStart);
  placeMeal(dinner, "dinner", dinnerStart);

  return { ...day, stops: out };
}
