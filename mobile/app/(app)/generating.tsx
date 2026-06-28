// mobile/app/(app)/generating.tsx
import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";
import { Screen, Text, Button, Loading } from "../../components/ui";

export default function Generating() {
  const { status, error, lastRequest, generate } = useTripFlow();
  const router = useRouter();

  useEffect(() => {
    if (status === "success") router.replace("/itinerary");
  }, [status]);

  if (status === "error") {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text variant="title" className="text-center">Couldn't build your itinerary</Text>
          <Text variant="body" className="text-center text-ink-muted">{error?.message ?? "Something went wrong."}</Text>
        </View>
        <View className="gap-3 pb-2">
          <Button title="Try again" onPress={() => lastRequest && generate(lastRequest)} />
          <Button title="Edit trip" variant="ghost" onPress={() => router.replace("/onboarding")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Loading label="Building your itinerary…" />
    </Screen>
  );
}
