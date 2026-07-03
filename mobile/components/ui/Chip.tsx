import type { ReactNode } from "react";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function Chip({ label, selected, onPress, icon }: {
  label: string; selected: boolean; onPress: () => void; icon?: ReactNode;
}) {
  return (
    <PressableScale
      onPress={onPress}
      className={`h-11 px-4 flex-row items-center gap-1.5 rounded-pill border ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}
    >
      {icon}
      <Text variant="label" className={selected ? "text-accent" : "text-ink"}>{label}</Text>
    </PressableScale>
  );
}
