// mobile/app/(app)/index.tsx
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { Screen, Text, Button } from "../../components/ui";

export default function Home() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <Screen>
      <View className="flex-1 justify-center gap-3">
        <Text variant="display">Where to next?</Text>
        <Text variant="body" className="text-ink-muted">
          Tell us your vibe and we'll plan a local-feel trip, day by day.
        </Text>
      </View>
      <View className="gap-3 pb-2">
        <Button title="Plan a trip" onPress={() => router.push("/onboarding")} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
        <Text variant="caption" className="text-center">{user?.email ?? user?.id}</Text>
      </View>
    </Screen>
  );
}
