// supabase/_shared/schedule.ts
// Lays an absolute clock over a day's already-ordered attractions and spreads
// them across the day so stops don't all bunch before lunch. Lunch is anchored
// at its target, dinner at sunset; attractions fill the morning and afternoon
// windows between them. Pure, deterministic, no network. Meals do NOT
// participate in routing — they get a flat MEAL_TRAVEL_MIN "find a nearby spot"
// leg baked into the window math.
import type { Stop } from "./types.ts";
import { formatClock } from "./solar.ts";

export const DAY_START_MIN = 9 * 60;          // 9:00 AM. calibration knob.
export const TRAVEL_BUFFER = 1.2;             // +20% on transit (operator rule). knob.
export const MEAL_TRAVEL_MIN = 10;            // flat hop to a nearby eatery. knob.
export const LUNCH_TARGET_MIN = 12 * 60 + 30; // 12:30 PM. knob.

export function buildDaySchedule(opts: {
  attractions: Stop[];
  sunsetMinutes: number;
  lunch: Stop;
  dinner: Stop;
}): Stop[] {
  const { attractions, sunsetMinutes, lunch, dinner } = opts;

  const lunchDwell = lunch.dwellMinutes ?? 60;
  const lunchStart = LUNCH_TARGET_MIN;
  const lunchEnd = lunchStart + MEAL_TRAVEL_MIN + lunchDwell;
  const dinnerStart = Math.max(sunsetMinutes, lunchEnd); // dinner never before lunch ends

  // Split attractions across the two windows in proportion to each window's
  // length, so the longer (afternoon) window carries more stops.
  const morningLen = Math.max(0, lunchStart - DAY_START_MIN);
  const afternoonLen = Math.max(0, dinnerStart - lunchEnd);
  const total = morningLen + afternoonLen;
  const n = attractions.length;
  // A lone stop starts the morning. With 2+, keep both windows non-empty so we
  // never strand an empty morning (day opening at lunch) or empty afternoon
  // (the dead pre-dinner gap this whole function exists to kill).
  const morningCount = total <= 0 || n <= 1
    ? n
    : Math.max(1, Math.min(n - 1, Math.round((n * morningLen) / total)));
  const morning = attractions.slice(0, morningCount);
  const afternoon = attractions.slice(morningCount);

  const out: Stop[] = [];

  // Lay `stops` across [start, end], distributing any slack evenly between them.
  // Packed window (slack <= 0) collapses to back-to-back from `start`.
  const spread = (stops: Stop[], start: number, end: number) => {
    if (stops.length === 0) return;
    let dwellSum = 0;
    let travelSum = 0;
    stops.forEach((s, i) => {
      dwellSum += s.dwellMinutes ?? 0;
      if (i > 0) travelSum += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
    });
    const slack = Math.max(0, end - start - dwellSum - travelSum);
    const gap = stops.length > 1 ? slack / (stops.length - 1) : 0;
    let clock = start;
    stops.forEach((s, i) => {
      if (i > 0) {
        clock += Math.round((s.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
        clock += Math.round(gap);
      }
      out.push({ ...s, startTime: formatClock(clock) });
      clock += s.dwellMinutes ?? 0;
    });
  };

  const placeMeal = (meal: Stop, slot: "lunch" | "dinner", at: number) => {
    out.push({ ...meal, startTime: formatClock(at), mealSlot: slot, dwellMinutes: meal.dwellMinutes ?? 60 });
  };

  spread(morning, DAY_START_MIN, lunchStart);
  placeMeal(lunch, "lunch", lunchStart);
  spread(afternoon, lunchEnd, dinnerStart);
  placeMeal(dinner, "dinner", dinnerStart);

  return out;
}
