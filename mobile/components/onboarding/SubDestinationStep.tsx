import { View } from "react-native";
import { Text } from "../ui/Text";
import { PressableScale } from "../ui/PressableScale";
import { Icon } from "../ui/Icon";
import type { Region } from "../../lib/placesClient";

export function SubDestinationStep(props: {
  regions: Region[];
  selected: { placeId: string; label: string }[];
  onToggle: (r: { placeId: string; label: string }) => void;
}) {
  const isSelected = (id: string) => props.selected.some((s) => s.placeId === id);
  return (
    <View className="gap-2">
      {props.regions.map((r) => {
        const on = isSelected(r.placeId);
        return (
          <PressableScale
            key={r.placeId}
            onPress={() => props.onToggle({ placeId: r.placeId, label: r.label })}
            className={`flex-row items-center gap-3 p-4 rounded-lg border ${on ? "bg-accent/10 border-accent" : "bg-surface border-border"}`}
          >
            <Icon name={on ? "checkmark-circle" : "ellipse-outline"} size={20} color={on ? "#E11D48" : "#9CA3AF"} />
            <View className="flex-1 gap-0.5">
              <Text variant="body">{r.label}</Text>
              <Text variant="caption">{r.hook}</Text>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
