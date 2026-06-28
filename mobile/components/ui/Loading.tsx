// mobile/components/ui/Loading.tsx
import { View, ActivityIndicator } from "react-native";
import { Text } from "./Text";

export function Loading({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-4">
      <ActivityIndicator size="large" color="#E11D48" />
      {label ? <Text variant="body" className="text-ink-muted">{label}</Text> : null}
    </View>
  );
}
