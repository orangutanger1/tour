import { assertEquals, assert } from "jsr:@std/assert";
import { buildDaySchedule } from "./schedule.ts";
import type { Stop } from "./types.ts";

const att = (placeId: string, dwell: number, travel?: number): Stop =>
  ({ placeId, name: placeId, blurb: "x", kind: "attraction", dwellMinutes: dwell, travelMinutesFromPrev: travel });
const lunch: Stop = { placeId: "", name: "Lunch — your pick", blurb: "l", kind: "meal-gap", dwellMinutes: 60 };
const dinner: Stop = { placeId: "", name: "Dinner — your pick", blurb: "d", kind: "meal-gap", dwellMinutes: 60 };

// "9:06 AM" -> 546
function toMin(clock: string): number {
  const [, h, m, ap] = clock.match(/(\d+):(\d+) (AM|PM)/)!;
  let hh = Number(h) % 12;
  if (ap === "PM") hh += 12;
  return hh * 60 + Number(m);
}

Deno.test("first attraction starts at 9:00 AM and times are strictly increasing", () => {
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  assertEquals(out[0].startTime, "9:00 AM");
  const mins = out.map((s) => toMin(s.startTime!));
  for (let i = 1; i < mins.length; i++) assert(mins[i] > mins[i - 1], `not increasing at ${i}: ${mins.join(",")}`);
});

Deno.test("travel time is inflated by the 1.2 buffer", () => {
  // A dwell 90 -> ends 10:30 (630). B travel 20 -> +round(24) -> 654 = 10:54.
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const b = out.find((s) => s.placeId === "B")!;
  assertEquals(b.startTime, "10:54 AM");
});

Deno.test("lunch is inserted at the boundary once the clock reaches noon", () => {
  // A 9:00 dwell90 ->10:30(630). B travel20 ->654 dwell60 ->714. C travel10 ->726 >=720 -> lunch before C at 12:06.
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  assertEquals(l.kind, "meal-gap");
  assertEquals(l.startTime, "12:06 PM");
  // lunch comes before C
  assert(out.indexOf(l) < out.findIndex((s) => s.placeId === "C"));
});

Deno.test("dinner lands at or after sunset", () => {
  const out = buildDaySchedule({ attractions: [att("A", 120), att("B", 120, 30), att("C", 120, 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assert(toMin(d.startTime!) >= 1110, `dinner ${d.startTime} before sunset`);
});

Deno.test("short day still appends both meals at their target times", () => {
  const out = buildDaySchedule({ attractions: [att("A", 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assertEquals(l.startTime, "12:30 PM");          // appended at LUNCH_TARGET_MIN
  assertEquals(d.startTime, "6:30 PM");            // appended at sunset (1110)
});
