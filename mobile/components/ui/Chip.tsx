// mobile/components/ui/Chip.tsx
import { Pressable } from "react-native";
import { Text } from "./Text";

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className={`px-4 py-2 rounded-pill border ${selected ? "bg-accent-soft border-accent" : "bg-surface border-border"}`}>
      <Text variant="label" className={selected ? "text-accent" : "text-ink"}>{label}</Text>
    </Pressable>
  );
}
