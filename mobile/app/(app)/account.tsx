// mobile/app/(app)/account.tsx
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { Screen, Text, Button, Card } from "../../components/ui";

export default function Account() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  async function onSignOut() {
    await signOut();
    router.replace("/");
  }

  return (
    <Screen>
      <View className="flex-row items-center gap-3 mb-4">
        <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <Text variant="title">Account</Text>
      </View>
      <Card className="gap-1">
        <Text variant="caption">Signed in as</Text>
        <Text variant="heading">{user?.email ?? user?.id ?? "—"}</Text>
      </Card>
      <View className="flex-1" />
      <View className="pb-2">
        <Button title="Sign out" variant="secondary" onPress={onSignOut} />
      </View>
    </Screen>
  );
}
