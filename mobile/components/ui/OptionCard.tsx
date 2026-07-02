// mobile/components/ui/OptionCard.tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { Icon } from "./Icon";

export function OptionCard({ icon, title, description, selected, onPress }: {
  icon?: ReactNode; title: string; description: string; selected: boolean; onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      className={`flex-row items-center gap-3 p-4 rounded-lg border-2 ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}
    >
      {icon ? (
        <View className={`w-11 h-11 rounded-md items-center justify-center ${selected ? "bg-surface" : "bg-surface-2"}`}>
          {icon}
        </View>
      ) : null}
      <View className="flex-1 gap-0.5">
        <Text variant="heading" className={selected ? "text-accent" : "text-ink"}>{title}</Text>
        <Text variant="caption">{description}</Text>
      </View>
      {selected ? <Icon name="checkmark-circle" size={22} color="#E11D48" /> : null}
    </PressableScale>
  );
}
