import {
  todayISO, addDaysISO, inclusiveDayCount, selectDay, isInRange,
  monthGrid, monthLabel, nextMonth, prevMonth, formatShort, formatDayHeader,
} from "./dates";

test("todayISO formats a local date", () => {
  expect(todayISO(new Date(2026, 6, 1, 9, 30))).toBe("2026-07-01"); // month0=6 → July
});

test("addDaysISO crosses month and year boundaries", () => {
  expect(addDaysISO("2026-07-31", 1)).toBe("2026-08-01");
  expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
  expect(addDaysISO("2026-07-14", 0)).toBe("2026-07-14");
});

test("inclusiveDayCount counts both endpoints", () => {
  expect(inclusiveDayCount("2026-07-12", "2026-07-18")).toBe(7);
  expect(inclusiveDayCount("2026-07-12", "2026-07-12")).toBe(1);
  expect(inclusiveDayCount("2026-07-01", "2026-09-01")).toBe(63); // no clamp — long trips valid
});

test("selectDay: first tap sets start", () => {
  expect(selectDay({}, "2026-07-12")).toEqual({ start: "2026-07-12" });
});

test("selectDay: same or later tap completes the range (same day = 1-day trip)", () => {
  expect(selectDay({ start: "2026-07-12" }, "2026-07-18")).toEqual({ start: "2026-07-12", end: "2026-07-18" });
  expect(selectDay({ start: "2026-07-12" }, "2026-07-12")).toEqual({ start: "2026-07-12", end: "2026-07-12" });
});

test("selectDay: earlier tap restarts the range", () => {
  expect(selectDay({ start: "2026-07-12" }, "2026-07-05")).toEqual({ start: "2026-07-05" });
});

test("selectDay: tap after a full range starts a new range", () => {
  expect(selectDay({ start: "2026-07-12", end: "2026-07-18" }, "2026-07-20")).toEqual({ start: "2026-07-20" });
});

test("isInRange is strictly between endpoints and needs a full range", () => {
  const sel = { start: "2026-07-12", end: "2026-07-18" };
  expect(isInRange("2026-07-15", sel)).toBe(true);
  expect(isInRange("2026-07-12", sel)).toBe(false);
  expect(isInRange("2026-07-18", sel)).toBe(false);
  expect(isInRange("2026-07-15", { start: "2026-07-12" })).toBe(false);
});

test("monthGrid July 2026: starts Wednesday, 31 days, 7-wide rows", () => {
  const weeks = monthGrid(2026, 6);
  expect(weeks[0]).toEqual([null, null, null, "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04"]);
  expect(weeks.every((w) => w.length === 7)).toBe(true);
  const days = weeks.flat().filter(Boolean);
  expect(days.length).toBe(31);
  expect(days[30]).toBe("2026-07-31");
});

test("monthLabel / nextMonth / prevMonth", () => {
  expect(monthLabel(2026, 6)).toBe("July 2026");
  expect(nextMonth(2026, 11)).toEqual([2027, 0]);
  expect(prevMonth(2026, 0)).toEqual([2025, 11]);
  expect(nextMonth(2026, 6)).toEqual([2026, 7]);
});

test("formatShort and formatDayHeader", () => {
  expect(formatShort("2026-07-12")).toBe("Jul 12");
  expect(formatDayHeader("2026-07-14")).toBe("Tue, Jul 14");
});
