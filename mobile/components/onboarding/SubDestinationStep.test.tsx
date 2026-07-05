import { render, fireEvent } from "@testing-library/react-native";
import { SubDestinationStep } from "./SubDestinationStep";
import type { Region } from "../../lib/placesClient";

const regions: Region[] = [
  { placeId: "A", label: "Tokyo", hook: "Neon and temples" },
  { placeId: "B", label: "Kyoto", hook: "Old capital" },
];

test("renders every region and toggles on tap", () => {
  const onToggle = jest.fn();
  const { getByText } = render(
    <SubDestinationStep regions={regions} selected={[]} onToggle={onToggle} />,
  );

  // Verify both region labels are rendered
  expect(getByText("Tokyo")).toBeTruthy();
  expect(getByText("Kyoto")).toBeTruthy();

  // Tap Kyoto and verify onToggle is called with correct payload
  const kyotoText = getByText("Kyoto");
  const kyotoPressable = kyotoText.parent;
  fireEvent.press(kyotoPressable);
  expect(onToggle).toHaveBeenCalledWith({ placeId: "B", label: "Kyoto" });
});
