// mobile/app/(app)/edit.tsx
import { Screen, EmptyState, Icon } from "../../components/ui";

export default function Edit() {
  return (
    <Screen>
      <EmptyState icon={<Icon name="create" size={28} color="#6B5560" />} title="Edit trip" subtitle="Coming soon." />
    </Screen>
  );
}
