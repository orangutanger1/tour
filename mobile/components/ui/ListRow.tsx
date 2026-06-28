// mobile/components/ui/ListRow.tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";

export function ListRow({ title, subtitle, right, onPress, onLongPress }: {
  title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; onLongPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} className="flex-row items-center gap-3 bg-surface rounded-lg p-4 border border-border active:bg-surface-2">
      <View className="flex-1">
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}
