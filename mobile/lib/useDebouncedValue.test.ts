import { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useDebouncedValue } from "./useDebouncedValue";

jest.useFakeTimers();

// ponytail: hand-rolled renderHook over the already-installed react-test-renderer,
// avoids adding @testing-library/react-native (peer-conflicts with react 19.2.3).
function renderDebounced(initial: string) {
  let current = initial;
  function Probe({ v }: { v: string }) {
    current = useDebouncedValue(v, 300);
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(createElement(Probe, { v: initial })); });
  return {
    get value() { return current; },
    rerender(v: string) { act(() => { renderer.update(createElement(Probe, { v })); }); },
  };
}

test("returns latest value only after the delay", () => {
  const h = renderDebounced("a");
  expect(h.value).toBe("a");
  h.rerender("ab");
  expect(h.value).toBe("a");
  act(() => { jest.advanceTimersByTime(300); });
  expect(h.value).toBe("ab");
});
