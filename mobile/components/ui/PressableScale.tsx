// mobile/components/ui/PressableScale.tsx
// Spring press-scale for all touchables. cssInterop registers className support
// on reanimated components once, module-wide.
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { cssInterop } from "nativewind";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);
cssInterop(AnimatedPressableBase, { className: "style" });
cssInterop(Animated.View, { className: "style" });

export const AnimatedPressable = AnimatedPressableBase;
export const AnimatedView = Animated.View;

const SPRING = { damping: 20, stiffness: 350 };

export function PressableScale({ onPressIn, onPressOut, style, ...props }: PressableProps & { className?: string }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      {...props}
      style={[style as StyleProp<ViewStyle>, animated]}
      onPressIn={(e) => { scale.value = withSpring(0.97, SPRING); onPressIn?.(e); }}
      onPressOut={(e) => { scale.value = withSpring(1, SPRING); onPressOut?.(e); }}
    />
  );
}
