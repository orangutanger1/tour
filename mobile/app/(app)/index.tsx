// mobile/app/(app)/index.tsx
import { View, Text, Button } from "react-native";
import { useAuth } from "../../lib/auth";

export default function Home() {
  const { user, signOut } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
      <Text>Signed in as {user?.email ?? user?.id}</Text>
      <Text style={{ color: "#888" }}>Itinerary screens land in Phase 2b.</Text>
      <Button title="Sign out" onPress={signOut} />
    </View>
  );
}
