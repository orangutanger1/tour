import { createElement } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { SubDestinationStep } from "./SubDestinationStep";
import { PressableScale } from "../ui/PressableScale";
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

  // Find the PressableScale node for Kyoto by walking up from the label
  let kyotoPressable = kyotoLabel.parent;
  while (kyotoPressable && kyotoPressable.type !== PressableScale) {
    kyotoPressable = kyotoPressable.parent;
  }
  expect(kyotoPressable).toBeTruthy();
  expect(kyotoPressable!.type).toBe(PressableScale);

  // Trigger press and verify onToggle is called with correct payload
  act(() => {
    kyotoPressable!.props.onPress();
  });
  expect(onToggle).toHaveBeenCalledWith({ placeId: "B", label: "Kyoto" });
});
