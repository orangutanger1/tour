// mobile/app/(app)/_layout.tsx
// Auth-first: no session, no app. TripFlowProvider lives at the root
// (app/_layout.tsx) so generation state survives this group unmounting.
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../lib/auth";

export default function AppLayout() {
  const { session, loading } = useAuth();
  if (loading) return null; // splash stays up while the stored session loads
  if (!session) return <Redirect href="/(auth)/welcome" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
