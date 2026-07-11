import { scheduleDayClient } from "./scheduleClient";
import type { ItineraryDay } from "./types";

const coords = {
  A: { lat: 0, lng: 0 },
  B: { lat: 0, lng: 0.2 }, // ~22 km east
  C: { lat: 0, lng: 0.4 },
};

const day: ItineraryDay = {
  day: 1, lodgingPlaceId: null,
  stops: [
    { placeId: "A", name: "A", blurb: "", kind: "attraction", dwellMinutes: 60 },
    { placeId: "", name: "Lunch", blurb: "", kind: "meal-gap", mealSlot: "lunch", dwellMinutes: 60 },
    { placeId: "B", name: "B", blurb: "", kind: "attraction", dwellMinutes: 60 },
    { placeId: "C", name: "C", blurb: "", kind: "attraction", dwellMinutes: 60 },
    { placeId: "", name: "Dinner", blurb: "", kind: "meal-gap", mealSlot: "dinner", dwellMinutes: 60 },
  ],
};

test("every stop gets a startTime", () => {
  const out = scheduleDayClient(day, coords);
  expect(out.stops.every((s) => !!s.startTime)).toBe(true);
});

test("lunch and dinner remain present exactly once", () => {
  const out = scheduleDayClient(day, coords);
  expect(out.stops.filter((s) => s.mealSlot === "lunch").length).toBe(1);
  expect(out.stops.filter((s) => s.mealSlot === "dinner").length).toBe(1);
});

test("attraction after another has a travel estimate > 0", () => {
  const out = scheduleDayClient(day, coords);
  const b = out.stops.find((s) => s.placeId === "B");
  expect((b?.travelMinutesFromPrev ?? 0)).toBeGreaterThan(0);
});

test("missing meal-gap is synthesized", () => {
  const noMeals: ItineraryDay = { ...day, stops: day.stops.filter((s) => s.kind === "attraction") };
  const out = scheduleDayClient(noMeals, coords);
  expect(out.stops.some((s) => s.mealSlot === "lunch")).toBe(true);
  expect(out.stops.some((s) => s.mealSlot === "dinner")).toBe(true);
});
