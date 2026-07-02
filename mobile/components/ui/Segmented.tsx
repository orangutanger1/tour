import { View, Pressable } from "react-native";
import { Text } from "./Text";

export function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row bg-surface-2 rounded-pill p-1">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          className={`flex-1 h-10 items-center justify-center rounded-pill ${value === o.value ? "bg-surface shadow-soft" : ""}`}
        >
          <Text variant="label" className={value === o.value ? "text-accent" : "text-ink-muted"}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
