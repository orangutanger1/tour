// mobile/components/ui/GlassPress.tsx
// Smooth, non-bouncy press feedback: timing (not spring) to scale 0.97 +
// opacity 0.9. Core RN Animated only — reanimated-wrapped touchables drop
// NativeWind className on device (see lib/noAnimatedClassName.test.ts), so
// className lives on the plain Pressable and the animated node styles via
// `style` alone.
import { useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, type StyleProp, type ViewStyle } from "react-native";

export function GlassPress({ children, onPress, className, style, disabled }: {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const pressed = useRef(new Animated.Value(0)).current;
  const animate = (toValue: number, duration: number) =>
    Animated.timing(pressed, { toValue, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  const scale = pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const opacity = pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animate(1, 120)}
      onPressOut={() => animate(0, 180)}
      className={className}
    >
      <Animated.View style={[{ transform: [{ scale }], opacity }, style]}>{children}</Animated.View>
    </Pressable>
  );
}
