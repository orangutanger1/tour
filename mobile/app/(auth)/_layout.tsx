// mobile/app/(auth)/_layout.tsx
// Session guard is the safety net: welcome/email do the precise post-auth routing
// (new user → onboarding), but if their replace loses the race with the session
// state update, this redirect still gets the user out of the auth group.
import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../lib/auth";

export default function AuthLayout() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
