// mobile/components/ui/Card.tsx
import type { ReactNode } from "react";
import { View, Pressable } from "react-native";

export function Card({ children, onPress, className }: { children: ReactNode; onPress?: () => void; className?: string }) {
  const cls = `bg-surface rounded-lg p-4 shadow-card ${className ?? ""}`;
  if (onPress) return <Pressable onPress={onPress} className={`${cls} active:bg-surface-2`}>{children}</Pressable>;
  return <View className={cls}>{children}</View>;
}
