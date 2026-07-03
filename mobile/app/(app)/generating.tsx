// mobile/app/(app)/generating.tsx
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";
import { useTripFlow } from "../../lib/tripFlow";
import { Screen, Text, Button, Icon, SUNSET } from "../../components/ui";

const PHASES = ["Scouting local favorites…", "Mapping smart routes…", "Timing each day…"];

export default function Generating() {
  const { status, error, lastRequest, generate } = useTripFlow();
  const router = useRouter();

  useEffect(() => {
    if (status === "success") router.replace("/itinerary");
  }, [status]);

  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 2500);
    return () => clearInterval(t);
  }, []);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  if (status === "error") {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3">
          <Text variant="title" className="text-center">Couldn't build your itinerary</Text>
          <Text variant="body" className="text-center text-ink-muted">{error?.message ?? "Something went wrong."}</Text>
        </View>
        <View className="gap-3 pb-2">
          <Button title="Try again" size="lg" onPress={() => lastRequest && generate(lastRequest)} />
          <Button title="Edit trip" variant="ghost" onPress={() => router.replace("/onboarding")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen decor>
      <View className="flex-1 items-center justify-center gap-6">
        <Animated.View style={[pulseStyle, { borderRadius: 999, overflow: "hidden" }]}>
          <LinearGradient colors={SUNSET} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 96, height: 96, borderRadius: 999, alignItems: "center", justifyContent: "center" }}>
            <Icon name="airplane" size={36} color="#FFFFFF" />
          </LinearGradient>
        </Animated.View>
        <Text variant="title" className="text-center">Building your trip</Text>
        <Text variant="body" className="text-center text-ink-muted">{PHASES[phase]}</Text>
      </View>
    </Screen>
  );
}
