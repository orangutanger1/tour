// mobile/components/ui/Stepper.tsx
// Day stepper: hold a button to auto-repeat (accelerating), and the number rolls
// with a vertical slide + fade/scale on change. The gradient masks at the top
// and bottom of the number window soften the roll so digits don't hard-clip.
// ponytail: animates the whole number, not per-digit odometer columns — fine for
// a 1–2 digit day count; add columns only if this ever shows big numbers.
import { useRef } from "react";
import { View, Pressable } from "react-native";
import Animated, { Keyframe } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./Text";
import { makeHoldRepeat } from "../../lib/holdRepeat";

const BG = "#FFFBFC"; // tailwind `bg`. mask fades to this. knob if Stepper moves onto a card.
const WINDOW_H = 56;

const rollIn = (dir: number) =>
  new Keyframe({
    0: { opacity: 0, transform: [{ translateY: dir > 0 ? 22 : -22 }, { scale: 0.7 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
  }).duration(240);

const rollOut = (dir: number) =>
  new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    100: { opacity: 0, transform: [{ translateY: dir > 0 ? -22 : 22 }, { scale: 0.7 }] },
  }).duration(240);

function StepButton({ label, onBump, disabled }: { label: string; onBump: () => boolean; disabled: boolean }) {
  const ctl = useRef(makeHoldRepeat(onBump)).current; // created once; onBump reads live state via refs
  return (
    <Pressable
      onPressIn={() => { if (!disabled) ctl.start(); }}
      onPressOut={() => ctl.stop()}
      disabled={disabled}
      className={`w-14 h-14 rounded-pill items-center justify-center bg-surface border border-border active:bg-surface-2 ${disabled ? "opacity-40" : ""}`}
    >
      <Text variant="title" className="text-ink">{label}</Text>
    </Pressable>
  );
}

export function Stepper({ value, onChange, min, max, suffix }: {
  value: number; onChange: (next: number) => void; min: number; max: number; suffix?: string;
}) {
  const dir = useRef(1);
  const valueRef = useRef(value);
  valueRef.current = value;

  // returns true if a bump happened (value changed) — drives hold auto-repeat
  const bump = (delta: number) => () => {
    const next = Math.min(max, Math.max(min, valueRef.current + delta));
    if (next === valueRef.current) return false;
    dir.current = delta;
    onChange(next);
    return true;
  };

  return (
    <View className="flex-row items-center justify-center gap-5">
      <StepButton label="–" onBump={bump(-1)} disabled={value <= min} />
      <View className="items-center" style={{ width: 120 }}>
        <View style={{ height: WINDOW_H, overflow: "hidden", justifyContent: "center" }}>
          <Animated.View key={value} entering={rollIn(dir.current)} exiting={rollOut(dir.current)} style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
            <Text variant="display" className="text-ink">{value}</Text>
          </Animated.View>
          <LinearGradient colors={[BG, "transparent"]} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 12 }} pointerEvents="none" />
          <LinearGradient colors={["transparent", BG]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 12 }} pointerEvents="none" />
        </View>
        {suffix ? <Text variant="caption" className="text-ink-muted">{suffix}</Text> : null}
      </View>
      <StepButton label="+" onBump={bump(1)} disabled={value >= max} />
    </View>
  );
}
