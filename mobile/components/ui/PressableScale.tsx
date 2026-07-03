// Plain core Pressable. NativeWind className on reanimated-wrapped components
// is silently dropped on device (cssInterop registration doesn't take at
// runtime), so touchables style through the core interop only. Press feedback
// is an instant 0.97 scale via the style function — no reanimated in the
// touch path.
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

export function PressableScale({ style, ...props }: PressableProps & { className?: string }) {
  return (
    <Pressable
      {...props}
      style={(state) => [
        (typeof style === "function" ? style(state) : style) as StyleProp<ViewStyle>,
        state.pressed ? { transform: [{ scale: 0.97 }] } : null,
      ]}
    />
  );
}
