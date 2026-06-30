// mobile/app/(app)/index.tsx
import { View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth";
import { Screen, Text, Button } from "../../../components/ui";

export default function Home() {
  const { user, session } = useAuth();
  const router = useRouter();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();
  return (
    <Screen>
      <View className="flex-row justify-end">
        {session ? (
          <Pressable onPress={() => router.push("/account")}
            className="w-10 h-10 rounded-pill bg-accent-soft items-center justify-center">
            <Text variant="label" className="text-accent">{initial}</Text>
          </Pressable>
        ) : null}
      </View>
      <View className="flex-1 justify-center gap-3">
        <Text variant="display">Where to next?</Text>
        <Text variant="body" className="text-ink-muted">
          Tell us your vibe and we'll plan a local-feel trip, day by day.
        </Text>
      </View>
      <View className="pb-2">
        <Button title="Plan a trip" onPress={() => router.push("/onboarding")} />
      </View>
    </Screen>
  );
}
