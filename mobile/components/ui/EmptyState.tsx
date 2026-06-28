// mobile/components/ui/EmptyState.tsx
import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "./Text";

export function EmptyState({ icon, title, subtitle, action }: {
  icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      {icon}
      <Text variant="title" className="text-center">{title}</Text>
      {subtitle ? <Text variant="body" className="text-center text-ink-muted">{subtitle}</Text> : null}
      {action ? <View className="mt-2">{action}</View> : null}
    </View>
  );
}
