// mobile/app/(app)/discover-list.tsx
// One screen serves every Discover filter (country / theme / continent / tag):
// 2-column grid of destination cards.
import { View, FlatList } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { DESTINATIONS, type Destination, type Theme, type Tag, type Continent } from "../../lib/destinations";
import { fetchDestinations, byCountry, byTheme, byContinent, byTag, flagEmoji } from "../../lib/discover";
import { Screen, Text, EmptyState, Icon, GlassPress } from "../../components/ui";
import { DestinationCard, TAG_LABEL } from "../../components/DiscoverCards";

const TITLE_CASE = (s: string) => s.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function DiscoverList() {
  const router = useRouter();
  const { type, value } = useLocalSearchParams<{ type?: string; value?: string }>();
  const { data: all } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => fetchDestinations(supabase),
    initialData: DESTINATIONS,
  });

  let list: Destination[] = [];
  let title = "Discover";
  if (type === "country" && value) {
    list = byCountry(all, value);
    title = `${flagEmoji(value)} ${list[0]?.country ?? value}`;
  } else if (type === "theme" && value) {
    list = byTheme(all, value as Theme);
    title = TITLE_CASE(value);
  } else if (type === "continent" && value) {
    list = byContinent(all, value as Continent);
    title = TITLE_CASE(value);
  } else if (type === "tag" && value) {
    list = byTag(all, value as Tag);
    title = TAG_LABEL[value as Tag] ?? TITLE_CASE(value);
  }

  return (
    <Screen>
      <View className="flex-row items-center gap-3 mb-4">
        <GlassPress onPress={() => router.back()}>
          <View className="w-10 h-10 rounded-pill bg-surface items-center justify-center shadow-card">
            <Ionicons name="chevron-back" size={20} color="#1A0E12" />
          </View>
        </GlassPress>
        <Text variant="title" numberOfLines={1} className="flex-1">{title}</Text>
      </View>
      {list.length === 0 ? (
        <EmptyState icon={<Icon name="compass" size={28} color="#6B5560" />} title="Nothing here yet" subtitle="Try another filter." />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(d) => d.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerClassName="gap-3 pb-32"
          renderItem={({ item }) => (
            <View className="flex-1">
              <DestinationCard d={item} size="md" onPress={() => router.push({ pathname: "/destination-detail", params: { id: item.id } })} />
            </View>
          )}
        />
      )}
    </Screen>
  );
}
