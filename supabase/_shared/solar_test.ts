import { assert } from "jsr:@std/assert";
import { sunsetLocalMinutes, formatClock } from "./solar.ts";

Deno.test("SF summer sunset is ~19:00-20:00 local solar", () => {
  const m = sunsetLocalMinutes(37.77, -122.42, new Date(Date.UTC(2026, 5, 21)));
  assert(m > 19 * 60 && m < 20 * 60, `got ${m}`);
});

Deno.test("SF winter sunset is ~16:30-17:30 local solar", () => {
  const m = sunsetLocalMinutes(37.77, -122.42, new Date(Date.UTC(2026, 11, 21)));
  assert(m > 16 * 60 + 30 && m < 17 * 60 + 30, `got ${m}`);
});

Deno.test("equator sunset is near 18:00 year-round", () => {
  const m = sunsetLocalMinutes(0, 0, new Date(Date.UTC(2026, 2, 21)));
  assert(Math.abs(m - 18 * 60) < 20, `got ${m}`);
});

Deno.test("formatClock formats 12h clock", () => {
  assert(formatClock(19 * 60 + 15) === "7:15 PM", formatClock(19 * 60 + 15));
  assert(formatClock(0) === "12:00 AM", formatClock(0));
  assert(formatClock(12 * 60 + 30) === "12:30 PM", formatClock(12 * 60 + 30));
});
