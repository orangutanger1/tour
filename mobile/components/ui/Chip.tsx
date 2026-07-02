// mobile/components/ui/Chip.tsx
import type { ReactNode } from "react";
import { useSharedValue, useAnimatedStyle, withSequence, withSpring } from "react-native-reanimated";
import { AnimatedPressable } from "./PressableScale";
import { Text } from "./Text";

export function Chip({ label, selected, onPress, icon }: {
  label: string; selected: boolean; onPress: () => void; icon?: ReactNode;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      style={animated}
      onPress={() => {
        scale.value = withSequence(withSpring(1.06, { damping: 12, stiffness: 400 }), withSpring(1, { damping: 16, stiffness: 300 }));
        onPress();
      }}
      className={`h-11 px-4 flex-row items-center gap-1.5 rounded-pill border ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}
    >
      {icon}
      <Text variant="label" className={selected ? "text-accent" : "text-ink"}>{label}</Text>
    </AnimatedPressable>
  );
}
