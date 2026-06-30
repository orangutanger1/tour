// mobile/components/ui/Stepper.tsx
// Day stepper: hold a button to auto-repeat (accelerating). The number renders
// plainly so it always shows.
// ponytail: dropped the reanimated roll/odometer + gradient masks — layout
// entering anims left the number stuck at opacity 0. Add motion back only if a
// plain number ever feels too flat, and verify it renders in a dev build first.
import { useRef } from "react";
import { View, Pressable } from "react-native";
import { Text } from "./Text";
import { makeHoldRepeat } from "../../lib/holdRepeat";

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
  const valueRef = useRef(value);
  valueRef.current = value;

  // returns true if a bump happened (value changed) — drives hold auto-repeat
  const bump = (delta: number) => () => {
    const next = Math.min(max, Math.max(min, valueRef.current + delta));
    if (next === valueRef.current) return false;
    onChange(next);
    return true;
  };

  return (
    <View className="flex-row items-center justify-center gap-5">
      <StepButton label="–" onBump={bump(-1)} disabled={value <= min} />
      <View className="items-center" style={{ width: 120 }}>
        <Text variant="display" className="text-ink">{value}</Text>
        {suffix ? <Text variant="caption" className="text-ink-muted">{suffix}</Text> : null}
      </View>
      <StepButton label="+" onBump={bump(1)} disabled={value >= max} />
    </View>
  );
}
