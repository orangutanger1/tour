// mobile/components/onboarding/CompareStep.tsx
// Beacon's approach vs. planning it yourself — no competitor-user stats
// (Wanderlog's "vs. other users" framing was explicitly ruled out; see spec
// "Social proof" decision).
import { View } from "react-native";
import { Card, Text, Icon } from "../ui";

const ROWS: { label: string; beacon: boolean; solo: boolean }[] = [
  { label: "Routes ordered by real distance", beacon: true, solo: false },
  { label: "Live opening hours + travel times", beacon: true, solo: false },
  { label: "Meals slotted where they fit", beacon: true, solo: false },
  { label: "Hours spent in spreadsheets", beacon: false, solo: true },
];

function Mark({ on }: { on: boolean }) {
  return on
    ? <Icon name="checkmark-circle" size={20} color="#E11D48" />
    : <Icon name="close-circle" size={20} color="#6B5560" />;
}

export function CompareStep() {
  return (
    <Card className="gap-4">
      <View className="flex-row justify-end gap-6 pr-1">
        <Text variant="label" className="w-14 text-center">Beacon</Text>
        <Text variant="label" className="w-14 text-center text-ink-muted">Solo</Text>
      </View>
      {ROWS.map((r) => (
        <View key={r.label} className="flex-row items-center gap-3">
          <Text variant="body" className="flex-1">{r.label}</Text>
          <View className="w-14 items-center"><Mark on={r.beacon} /></View>
          <View className="w-14 items-center"><Mark on={r.solo} /></View>
        </View>
      ))}
    </Card>
  );
}
