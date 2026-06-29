// supabase/_shared/schedule.ts
// Lays an absolute clock over a day's already-ordered attractions and inserts
// lunch/dinner at the natural stop boundary nearest their target window.
// Pure, deterministic, no network. Meals do NOT participate in routing — they
// get a flat MEAL_TRAVEL_MIN "find a nearby spot" leg.
import type { Stop } from "./types.ts";
import { formatClock } from "./solar.ts";

export const DAY_START_MIN = 9 * 60;          // 9:00 AM. calibration knob.
export const TRAVEL_BUFFER = 1.2;             // +20% on transit (operator rule). knob.
export const MEAL_TRAVEL_MIN = 10;            // flat hop to a nearby eatery. knob.
export const LUNCH_TARGET_MIN = 12 * 60 + 30; // 12:30 PM. knob.
const LUNCH_WINDOW_OPEN = LUNCH_TARGET_MIN - 30; // start slotting lunch at ~noon

export function buildDaySchedule(opts: {
  attractions: Stop[];
  sunsetMinutes: number;
  lunch: Stop;
  dinner: Stop;
}): Stop[] {
  const { attractions, sunsetMinutes, lunch, dinner } = opts;
  const out: Stop[] = [];
  let clock = DAY_START_MIN;
  let lunchDone = false;
  let dinnerDone = false;

  const placeMeal = (meal: Stop, slot: "lunch" | "dinner") => {
    meal.startTime = formatClock(clock);
    meal.mealSlot = slot;
    const dwell = meal.dwellMinutes ?? 60;
    meal.dwellMinutes = dwell;
    out.push(meal);
    clock += MEAL_TRAVEL_MIN + dwell;
  };

  attractions.forEach((stop, i) => {
    if (i > 0) clock += Math.round((stop.travelMinutesFromPrev ?? 0) * TRAVEL_BUFFER);
    if (!lunchDone && clock >= LUNCH_WINDOW_OPEN) { placeMeal(lunch, "lunch"); lunchDone = true; }
    if (!dinnerDone && clock >= sunsetMinutes) { placeMeal(dinner, "dinner"); dinnerDone = true; }
    stop.startTime = formatClock(clock);
    out.push(stop);
    clock += stop.dwellMinutes ?? 0;
  });

  // Day too short to reach a meal window → append at the target time.
  if (!lunchDone) { clock = Math.max(clock, LUNCH_TARGET_MIN); placeMeal(lunch, "lunch"); }
  if (!dinnerDone) { clock = Math.max(clock, sunsetMinutes); placeMeal(dinner, "dinner"); }

  return out;
}
