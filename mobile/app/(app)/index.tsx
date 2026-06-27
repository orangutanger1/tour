// mobile/app/(app)/index.tsx
import { View, Text, Button } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";

export default function Home() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16, padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>Plan your trip</Text>
      <Text style={{ color: "#888" }}>Signed in as {user?.email ?? user?.id}</Text>
      <Button title="Plan a trip" onPress={() => router.push("/onboarding")} />
      <Button title="Sign out" onPress={signOut} />
    </View>
  );
}
