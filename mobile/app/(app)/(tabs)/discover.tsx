// mobile/app/(app)/(tabs)/discover.tsx
import { Screen, EmptyState } from "../../../components/ui";

export default function Discover() {
  return (
    <Screen className="pb-28">
      <EmptyState title="Discover" subtitle="Destination ideas and saved spots are coming soon." />
    </Screen>
  );
}
