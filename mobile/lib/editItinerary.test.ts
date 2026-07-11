import { removeStop, reorderStops, replaceStop, addStop, moveStopToDay, isAttraction } from "./editItinerary";
import type { Itinerary, Stop } from "./types";

const attr = (name: string, placeId = name): Stop => ({ placeId, name, blurb: "", kind: "attraction" });
const meal: Stop = { placeId: "r", name: "Lunch", blurb: "", kind: "meal", mealSlot: "lunch" };

const itin = (): Itinerary => ({
  days: [
    { day: 1, lodgingPlaceId: null, stops: [attr("A"), meal, attr("B"), attr("C")] },
    { day: 2, lodgingPlaceId: null, stops: [attr("D")] },
  ],
});

test("isAttraction excludes meals and gaps", () => {
  expect(isAttraction(attr("A"))).toBe(true);
  expect(isAttraction(meal)).toBe(false);
  expect(isAttraction({ ...meal, kind: "meal-gap" })).toBe(false);
});

test("removeStop drops the Nth attraction, keeps meals", () => {
  const out = removeStop(itin(), 1, 1); // attraction index 1 = "B"
  const names = out.days[0].stops.map((s) => s.name);
  expect(names).toEqual(["A", "Lunch", "C"]);
});

test("reorderStops moves within attractions only", () => {
  const out = reorderStops(itin(), 1, 0, 2); // A -> after C
  expect(out.days[0].stops.filter(isAttraction).map((s) => s.name)).toEqual(["B", "C", "A"]);
});

test("reorderStops preserves the real meal stop (mealSlot + placeId survive)", () => {
  const out = reorderStops(itin(), 1, 0, 2); // A -> after C
  const mealOut = out.days[0].stops.find((s) => s.kind === "meal");
  expect(mealOut).toBeDefined();
  expect(mealOut?.mealSlot).toBe("lunch");
  expect(mealOut?.placeId).toBe("r");
  expect(mealOut?.name).toBe("Lunch");
  // meal stays in its original relative position (index 1, between A-slot and B-slot)
  expect(out.days[0].stops.map((s) => s.name)).toEqual(["B", "Lunch", "C", "A"]);
});

test("replaceStop swaps the Nth attraction", () => {
  const out = replaceStop(itin(), 1, 0, attr("Z"));
  expect(out.days[0].stops.filter(isAttraction).map((s) => s.name)).toEqual(["Z", "B", "C"]);
});

test("addStop inserts at attraction index", () => {
  const out = addStop(itin(), 2, 0, attr("New"));
  expect(out.days[1].stops.map((s) => s.name)).toEqual(["New", "D"]);
});

test("moveStopToDay removes from source, appends to target", () => {
  const out = moveStopToDay(itin(), 1, 2, 2); // move "C" to day 2
  expect(out.days[0].stops.filter(isAttraction).map((s) => s.name)).toEqual(["A", "B"]);
  expect(out.days[1].stops.map((s) => s.name)).toEqual(["D", "C"]);
});

test("ops do not mutate the input", () => {
  const a = itin();
  removeStop(a, 1, 0);
  expect(a.days[0].stops.map((s) => s.name)).toEqual(["A", "Lunch", "B", "C"]);
});
