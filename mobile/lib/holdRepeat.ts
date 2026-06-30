// mobile/lib/holdRepeat.ts
// Press-and-hold auto-repeat with acceleration. `onTick` performs one bump and
// returns false to stop (e.g. value hit min/max). Pure timers, no React.
// ponytail: setTimeout chain; swap to requestAnimationFrame only if 80ms feels chunky.
export const HOLD_DELAY = 400;                 // pause before auto-repeat starts. knob.
export const HOLD_INTERVALS = [300, 150, 80];  // accelerating cadence, last value sticks. knob.

export function makeHoldRepeat(onTick: () => boolean) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let step = 0;

  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    step = 0;
  };

  const schedule = (delay: number) => {
    timer = setTimeout(() => {
      if (!onTick()) { stop(); return; }
      const next = HOLD_INTERVALS[Math.min(step, HOLD_INTERVALS.length - 1)];
      step++;
      schedule(next);
    }, delay);
  };

  const start = () => {
    stop();
    if (!onTick()) return; // immediate first bump; bail if already at a bound
    schedule(HOLD_DELAY);
  };

  return { start, stop };
}
