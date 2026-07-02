// mobile/components/ui/ProgressBar.tsx
import { useEffect } from "react";
import { View } from "react-native";
import { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { AnimatedView } from "./PressableScale";

export function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  const p = useSharedValue(progress);
  useEffect(() => { p.value = withSpring(progress, { damping: 18, stiffness: 160 }); }, [progress]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, p.value)) * 100}%` }));
  return (
    <View className={`h-2 rounded-pill bg-surface-2 overflow-hidden ${className ?? ""}`}>
      <AnimatedView style={fill} className="h-full rounded-pill bg-accent" />
    </View>
  );
}
