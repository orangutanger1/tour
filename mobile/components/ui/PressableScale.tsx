// Plain core Pressable. NativeWind className on reanimated-wrapped components
// is silently dropped on device (cssInterop registration doesn't take at
// runtime), so touchables style through the core interop only. Press feedback
// is an instant scale-down + fade via the style function — no reanimated in the
// touch path. 0.95 + 0.9 opacity so the press is actually perceptible with a
// finger over the control (0.97 alone was near-invisible).
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

export function PressableScale({ style, ...props }: PressableProps & { className?: string }) {
  return (
    <Pressable
      {...props}
      style={(state) => [
        (typeof style === "function" ? style(state) : style) as StyleProp<ViewStyle>,
        state.pressed ? { transform: [{ scale: 0.95 }], opacity: 0.9 } : null,
      ]}
    />
  );
}
