import { makeHoldRepeat, HOLD_DELAY } from "./holdRepeat";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("tap (press + quick release) fires exactly one bump", () => {
  let n = 0;
  const { start, stop } = makeHoldRepeat(() => { n++; return true; });
  start();
  stop(); // released before HOLD_DELAY
  jest.advanceTimersByTime(2000);
  expect(n).toBe(1);
});

test("hold fires repeated bumps that accelerate", () => {
  let n = 0;
  const { start } = makeHoldRepeat(() => { n++; return true; });
  start();                              // immediate => 1
  jest.advanceTimersByTime(HOLD_DELAY); // => 2
  jest.advanceTimersByTime(300);        // => 3
  jest.advanceTimersByTime(150);        // => 4
  jest.advanceTimersByTime(80 * 5);     // => 9
  expect(n).toBeGreaterThanOrEqual(6);
});

test("stops auto-repeat when onTick returns false (hit a bound)", () => {
  let n = 0;
  const { start } = makeHoldRepeat(() => { n++; return n < 3; });
  start();
  jest.advanceTimersByTime(5000);
  expect(n).toBe(3);
});
