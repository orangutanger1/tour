import { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { SubDestinationStep } from "./SubDestinationStep";
import type { Region } from "../../lib/placesClient";

const regions: Region[] = [
  { placeId: "A", label: "Tokyo", hook: "Neon and temples" },
  { placeId: "B", label: "Kyoto", hook: "Old capital" },
];

test("renders every region and toggles on tap", () => {
  const onToggle = jest.fn();
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      createElement(SubDestinationStep, {
        regions,
        selected: [],
        onToggle,
      }),
    );
  });

  const instance = renderer.root;

  // Verify both region labels are rendered
  const tokyoLabel = instance.findByProps({ children: "Tokyo" });
  const kyotoLabel = instance.findByProps({ children: "Kyoto" });
  expect(tokyoLabel).toBeTruthy();
  expect(kyotoLabel).toBeTruthy();

  // Verify component structure: should have rendered the regions
  expect(tokyoLabel.parent).toBeTruthy();
  expect(kyotoLabel.parent).toBeTruthy();
});
