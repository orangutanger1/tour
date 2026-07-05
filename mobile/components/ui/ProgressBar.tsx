import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";

export function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  const p = useSharedValue(progress);
  // Linear ease, no spring — the bounce read as janky on step changes.
  useEffect(() => { p.value = withTiming(progress, { duration: 250, easing: Easing.out(Easing.ease) }); }, [progress]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, Math.max(0, p.value)) * 100}%` }));
  return (
    <View className={`h-2 rounded-pill bg-surface-2 overflow-hidden ${className ?? ""}`}>
      <Animated.View style={[fill, { height: "100%", borderRadius: 999, backgroundColor: "#E11D48" }]} />
    </View>
  );
}
