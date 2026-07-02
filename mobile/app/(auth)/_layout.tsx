// mobile/app/(auth)/_layout.tsx
// No session guard here: screens route away themselves after auth (postAuthRoute),
// and nothing links into (auth) while signed in.
import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
