// mobile/app/(app)/(tabs)/discover.tsx
// Polarsteps-style explore: bundled dataset renders instantly (initialData);
// the destinations table overrides it when non-empty.
import type { ReactElement, ReactNode } from "react";
import { View, FlatList, Image } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { getProfile } from "../../../lib/profile";
import { DESTINATIONS, THEMES, CONTINENTS, type Destination, type Theme, type Continent } from "../../../lib/destinations";
import { fetchDestinations, forYou, byTag, byTheme, byContinent, countries, flagEmoji } from "../../../lib/discover";
import { Screen, Text, GlassPress } from "../../../components/ui";
import { DestinationCard, TileCard, GlassPill } from "../../../components/DiscoverCards";

const THEME_LABEL: Record<Theme, string> = {
  nature: "Nature", adventure: "Adventure", culture: "Culture", food: "Food",
  wildlife: "Wildlife", city: "City", beach: "Beach",
};
const CONTINENT_LABEL: Record<Continent, string> = {
  africa: "Africa", asia: "Asia", europe: "Europe",
  "north-america": "North America", oceania: "Oceania", "south-america": "South America",
};

function Carousel<T>({ data, keyOf, render }: { data: T[]; keyOf: (item: T) => string; render: (item: T) => ReactElement }) {
  return (
    <FlatList
      horizontal
      data={data}
      keyExtractor={keyOf}
      renderItem={({ item }) => render(item)}
      showsHorizontalScrollIndicator={false}
      className="-mx-6"
      contentContainerClassName="px-6 gap-3"
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

export default function Discover() {
  const router = useRouter();
  const { data: all } = useQuery({
    queryKey: ["destinations"],
    queryFn: () => fetchDestinations(supabase),
    initialData: DESTINATIONS,
  });
  const { data: prefs } = useQuery({ queryKey: ["profile"], queryFn: () => getProfile(supabase) });

  const openDetail = (d: Destination) => router.push({ pathname: "/destination-detail", params: { id: d.id } });
  const openList = (type: string, value: string) => router.push({ pathname: "/discover-list", params: { type, value } });

  const card = (size: "lg" | "md") => (d: Destination) => <DestinationCard d={d} size={size} onPress={() => openDetail(d)} />;

  return (
    <Screen scroll className="pb-32 gap-6">
      <View className="flex-row items-center gap-3">
        <Image source={require("../../../assets/images/logo.png")} style={{ width: 32, height: 32 }} />
        <Text variant="display">Discover</Text>
      </View>

      <Carousel
        data={countries(all)}
        keyOf={(c) => c.countryCode}
        render={(c) => (
          <GlassPress onPress={() => openList("country", c.countryCode)}>
            <GlassPill>
              <Text variant="label">{flagEmoji(c.countryCode)} {c.country}</Text>
            </GlassPill>
          </GlassPress>
        )}
      />

      <Section title="For you">
        <Carousel data={forYou(all, prefs?.interests ?? [])} keyOf={(d) => d.id} render={card("lg")} />
      </Section>

      <Section title="Under the radar">
        <Carousel data={byTag(all, "underRadar")} keyOf={(d) => d.id} render={card("md")} />
      </Section>

      <Section title="Browse by theme">
        <Carousel
          data={[...THEMES]}
          keyOf={(t) => t}
          render={(t) => <TileCard label={THEME_LABEL[t]} imageUrl={byTheme(all, t)[0]?.imageUrl} onPress={() => openList("theme", t)} />}
        />
      </Section>

      <Section title="Popular">
        <Carousel data={byTag(all, "popular")} keyOf={(d) => d.id} render={card("md")} />
      </Section>

      <Section title="Trending this month">
        <Carousel data={byTag(all, "trending")} keyOf={(d) => d.id} render={card("md")} />
      </Section>

      <Section title="Browse by continent">
        <Carousel
          data={[...CONTINENTS]}
          keyOf={(c) => c}
          render={(c) => <TileCard label={CONTINENT_LABEL[c]} imageUrl={byContinent(all, c)[0]?.imageUrl} onPress={() => openList("continent", c)} />}
        />
      </Section>
    </Screen>
  );
}
