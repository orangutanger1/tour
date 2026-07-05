// mobile/app/(app)/destination-detail.tsx
// Full-bleed hero + facts + sticky glass "Plan a trip" bar. The CTA seeds
// onboarding with "Name, Country" free text (no placeId — generation handles it).
import { View, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { DESTINATIONS } from "../../lib/destinations";
import { fetchDestinations, flagEmoji } from "../../lib/discover";
import { Screen, Text, Button, EmptyState, Icon, Photo, GlassPress } from "../../components/ui";
import { TAG_LABEL, GlassPill } from "../../components/DiscoverCards";

export default function DestinationDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: all } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => fetchDestinations(supabase),
    initialData: DESTINATIONS,
  });
  const d = all.find((x) => x.id === id);

  if (!d) {
    return (
      <Screen>
        <EmptyState icon={<Icon name="compass" size={28} color="#6B5560" />} title="Destination not found" subtitle="It may have been removed." action={<Button title="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="pb-40">
        <View className="h-96">
          <Photo uri={d.imageUrl} cacheKey={d.id} className="absolute inset-0 w-full h-full" />
          <LinearGradient colors={["transparent", "rgba(26,14,18,0.72)"]} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
          <View style={{ top: insets.top + 8 }} className="absolute left-6">
            <GlassPress onPress={() => router.back()}>
              {/* BlurView: style only — NativeWind doesn't interop third-party components */}
              <BlurView intensity={30} tint="light" style={{ borderRadius: 999, overflow: "hidden" }}>
                <View className="w-10 h-10 items-center justify-center bg-white/25">
                  <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                </View>
              </BlurView>
            </GlassPress>
          </View>
          <View className="absolute bottom-5 left-6 right-6 gap-2">
            {d.tags[0] ? (
              <View className="self-start">
                <GlassPill><Text variant="label" className="text-white">{TAG_LABEL[d.tags[0]]}</Text></GlassPill>
              </View>
            ) : null}
            <Text variant="display" className="text-white">{d.name}</Text>
            <Text variant="body" className="text-white/85">{flagEmoji(d.countryCode)} {d.country}</Text>
          </View>
        </View>

        <View className="px-6 py-5 gap-5">
          <Text variant="body" className="text-ink-muted">{d.blurb}</Text>
          <View className="gap-3">
            <Text variant="heading">Highlights</Text>
            <View className="flex-row flex-wrap gap-2">
              {d.highlights.map((h) => (
                <View key={h} className="px-4 py-2 rounded-pill bg-surface border border-border">
                  <Text variant="label">{h}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {d.themes.map((t) => (
              <View key={t} className="px-3 py-1.5 rounded-pill bg-accent-soft">
                <Text variant="label" className="text-accent">{t[0].toUpperCase() + t.slice(1)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <BlurView intensity={40} tint="light" style={{ position: "absolute", bottom: 0, left: 0, right: 0, overflow: "hidden" }}>
        <View className="px-6 pt-4 bg-white/60" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button
            title="Plan a trip"
            size="lg"
            variant="gradient"
            onPress={() => router.push({ pathname: "/onboarding", params: { destination: `${d.name}, ${d.country}`, planning: "1" } })}
          />
        </View>
      </BlurView>
    </View>
  );
}
