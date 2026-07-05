// mobile/components/ui/PlanCard.tsx
import { View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";

export function PlanCard({ pkg, active, onPress }: { pkg: PurchasesPackage; active: boolean; onPress: () => void }) {
  const annual = pkg.packageType === "ANNUAL";
  return (
    <PressableScale
      onPress={onPress}
      className={`flex-1 rounded-xl border-2 p-4 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}
    >
      <View className="h-6 mb-1">
        {annual ? (
          <View className="self-start px-2 py-0.5 rounded-pill bg-accent">
            <Text variant="label" className="text-ink-inverse text-[11px]">SAVE 44%</Text>
          </View>
        ) : null}
      </View>
      <Text variant="heading">{annual ? "Annual" : "Monthly"}</Text>
      <Text variant="caption">{pkg.product.priceString} / {annual ? "year" : "month"}</Text>
    </PressableScale>
  );
}
