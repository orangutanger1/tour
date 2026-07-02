// mobile/app/(app)/lodging.tsx
import { Screen, EmptyState, Icon } from "../../components/ui";

export default function Lodging() {
  return (
    <Screen>
      <EmptyState icon={<Icon name="bed" size={28} color="#6B5560" />} title="Lodging" subtitle="Coming soon." />
    </Screen>
  );
}
