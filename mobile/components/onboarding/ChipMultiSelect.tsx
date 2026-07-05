// mobile/components/onboarding/ChipMultiSelect.tsx
import { View } from "react-native";
import { Chip } from "../ui";

export interface ChipOption { value: string; label: string }

export function ChipMultiSelect({ options, selected, onToggle }: {
  options: ChipOption[]; selected: string[]; onToggle: (value: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={selected.includes(o.value)} onPress={() => onToggle(o.value)} />
      ))}
    </View>
  );
}
