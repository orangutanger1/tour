// mobile/app/(app)/poi-detail.tsx
import { Screen, EmptyState, Icon } from "../../components/ui";

export default function PoiDetail() {
  return (
    <Screen>
      <EmptyState icon={<Icon name="location" size={28} color="#6B5560" />} title="Place details" subtitle="Coming soon." />
    </Screen>
  );
}
