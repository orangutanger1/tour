// mobile/components/onboarding/OptionList.tsx
import { View } from "react-native";
import { OptionCard, Icon, type IconName } from "../ui";

export interface Option { value: string; label: string; desc: string; icon: IconName }

export function OptionList({ options, selected, onSelect }: {
  options: Option[]; selected: string | undefined; onSelect: (value: string) => void;
}) {
  return (
    <View className="gap-3">
      {options.map((o) => (
        <OptionCard
          key={o.value}
          icon={<Icon name={o.icon} size={20} color={selected === o.value ? "#E11D48" : "#6B5560"} />}
          title={o.label}
          description={o.desc}
          selected={selected === o.value}
          onPress={() => onSelect(o.value)}
        />
      ))}
    </View>
  );
}
