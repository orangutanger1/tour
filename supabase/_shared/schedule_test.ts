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

Deno.test("travel buffer (1.2) applies between consecutive stops in a packed window", () => {
  // 8 stops -> morning window gets 3 (proportional), each dwell 90 + travel 20 ->
  // busy 318 > 210min window -> slack 0 -> back-to-back. A@9:00, B@9:00+90+round(20*1.2=24)=10:54.
  const atts = ["A", "B", "C", "D", "E", "F", "G", "H"].map((id) => att(id, 90, id === "A" ? undefined : 20));
  const out = buildDaySchedule({ attractions: atts, sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const b = out.find((s) => s.placeId === "B")!;
  assertEquals(b.startTime, "10:54 AM");
});

Deno.test("lunch is anchored at 12:30 and comes before the afternoon stops", () => {
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  assertEquals(l.kind, "meal-gap");
  assertEquals(l.startTime, "12:30 PM");
  assert(out.indexOf(l) < out.findIndex((s) => s.placeId === "C"));
});

Deno.test("sparse day still places an attraction between lunch and dinner", () => {
  const out = buildDaySchedule({ attractions: [att("A", 60), att("B", 60, 20), att("C", 60, 20), att("D", 60, 20)], sunsetMinutes: 1170, lunch: { ...lunch }, dinner: { ...dinner } });
  const lunchMin = toMin(out.find((s) => s.mealSlot === "lunch")!.startTime!);
  const dinnerMin = toMin(out.find((s) => s.mealSlot === "dinner")!.startTime!);
  const between = out.filter((s) => !s.mealSlot && s.kind === "attraction" && toMin(s.startTime!) > lunchMin && toMin(s.startTime!) < dinnerMin);
  assert(between.length >= 1, `expected an attraction between lunch(${lunchMin}) and dinner(${dinnerMin})`);
});

Deno.test("dinner lands at or after sunset", () => {
  const out = buildDaySchedule({ attractions: [att("A", 120), att("B", 120, 30), att("C", 120, 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assert(toMin(d.startTime!) >= 1110, `dinner ${d.startTime} before sunset`);
});

Deno.test("dinner never precedes lunch even with a degenerate (near-zero) sunset", () => {
  const out = buildDaySchedule({ attractions: [att("A", 90), att("B", 60, 20), att("C", 90, 10)], sunsetMinutes: 0, lunch: { ...lunch }, dinner: { ...dinner } });
  const li = out.findIndex((s) => s.mealSlot === "lunch");
  const di = out.findIndex((s) => s.mealSlot === "dinner");
  assert(li >= 0 && di >= 0 && li < di, `lunch(${li}) must come before dinner(${di})`);
});

Deno.test("short day still appends both meals at their target times", () => {
  const out = buildDaySchedule({ attractions: [att("A", 30)], sunsetMinutes: 1110, lunch: { ...lunch }, dinner: { ...dinner } });
  const l = out.find((s) => s.mealSlot === "lunch")!;
  const d = out.find((s) => s.mealSlot === "dinner")!;
  assertEquals(l.startTime, "12:30 PM");
  assertEquals(d.startTime, "6:30 PM");
});
