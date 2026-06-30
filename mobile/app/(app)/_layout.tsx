// mobile/app/(app)/_layout.tsx
// TripFlowProvider lives at the root (app/_layout.tsx) so it also wraps the
// (auth) group — sign-in resumes a pending trip via useTripFlow.
import { Stack } from "expo-router";

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
