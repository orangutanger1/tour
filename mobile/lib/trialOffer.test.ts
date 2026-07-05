import { trialDays } from "./trialOffer";

test("trialDays is null when there's no intro offer", () => {
  expect(trialDays(null)).toBeNull();
});

test("trialDays is null when the intro offer is a discount, not a free trial", () => {
  expect(trialDays({ price: 1.99, periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 3 })).toBeNull();
});

test("trialDays computes days for a 7-day free trial (1 week, price 0)", () => {
  expect(trialDays({ price: 0, periodUnit: "WEEK", periodNumberOfUnits: 1, cycles: 1 })).toBe(7);
});

test("trialDays computes days for a 1-month free trial", () => {
  expect(trialDays({ price: 0, periodUnit: "MONTH", periodNumberOfUnits: 1, cycles: 1 })).toBe(30);
});

test("trialDays multiplies periodNumberOfUnits and cycles", () => {
  expect(trialDays({ price: 0, periodUnit: "DAY", periodNumberOfUnits: 3, cycles: 2 })).toBe(6);
});
