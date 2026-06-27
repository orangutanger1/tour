// mobile/app/(app)/generating.tsx
import { useEffect } from "react";
import { View, Text, ActivityIndicator, Button } from "react-native";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";

export default function Generating() {
  const { status, error, lastRequest, generate } = useTripFlow();
  const router = useRouter();

  useEffect(() => {
    if (status === "success") router.replace("/itinerary");
  }, [status]);

  if (status === "error") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Couldn't build your itinerary</Text>
        <Text style={{ color: "#888", textAlign: "center" }}>{error?.message ?? "Something went wrong."}</Text>
        <Button title="Try again" onPress={() => lastRequest && generate(lastRequest)} />
        <Button title="Edit trip" onPress={() => router.replace("/onboarding")} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 16 }}>
      <ActivityIndicator size="large" />
      <Text>Building your itinerary…</Text>
    </View>
  );
}
