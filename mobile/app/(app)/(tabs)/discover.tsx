// mobile/app/(app)/(tabs)/discover.tsx
import { Screen, EmptyState, Icon } from "../../../components/ui";

export default function Discover() {
  return (
    <Screen className="pb-28">
      <EmptyState icon={<Icon name="compass" size={28} color="#6B5560" />} title="Discover" subtitle="Destination ideas and saved spots are coming soon." />
    </Screen>
  );
}
