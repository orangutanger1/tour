// mobile/app/(app)/_layout.tsx
import { Stack } from "expo-router";
import { TripFlowProvider } from "../../lib/tripFlow";

export default function AppLayout() {
  return (
    <TripFlowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </TripFlowProvider>
  );
}
