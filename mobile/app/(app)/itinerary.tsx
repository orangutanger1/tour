// mobile/app/(app)/itinerary.tsx
import { useEffect, useMemo, useState } from "react";
import { View, SectionList, Pressable } from "react-native";
import { AppleMaps } from "expo-maps";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";
import { supabase } from "../../lib/supabase";
import { getStopCoords, type StopCoord } from "../../lib/poi";
import { Screen, Text, Button, Card, EmptyState } from "../../components/ui";

export default function Itinerary() {
  const { data } = useTripFlow();
  const router = useRouter();
  const [view, setView] = useState<"list" | "map">("list");
  const [coords, setCoords] = useState<Record<string, StopCoord>>({});

  const days = data?.itinerary.days ?? [];
  const empty = days.length === 0 || days.every((d) => d.stops.length === 0);

  const placeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of days) {
      if (d.lodgingPlaceId) ids.add(d.lodgingPlaceId);
      d.stops.forEach((s) => ids.add(s.placeId));
    }
    return [...ids];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (placeIds.length) getStopCoords(supabase, placeIds).then(setCoords).catch(() => {});
  }, [placeIds]);

  if (empty) {
    return (
      <Screen>
        <EmptyState
          title="Limited data here"
          subtitle="Try a broader location."
          action={<Button title="Edit trip" onPress={() => router.replace("/onboarding")} />}
        />
      </Screen>
    );
  }

  const markers = placeIds
    .map((id) => coords[id])
    .filter((c): c is StopCoord => !!c)
    .map((c, idx) => ({ id: String(idx), coordinates: { latitude: c.lat, longitude: c.lng }, title: c.name }));

  const sections = days.map((d) => ({
    title: `Day ${d.day}`,
    lodging: d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined,
    data: d.stops,
  }));

  function Toggle() {
    return (
      <View className="flex-row self-center bg-surface-2 rounded-pill p-1 mb-3">
        {(["list", "map"] as const).map((v) => (
          <Pressable key={v} onPress={() => setView(v)} className={`px-5 py-1.5 rounded-pill ${view === v ? "bg-surface" : ""}`}>
            <Text variant="label" className={view === v ? "text-accent" : "text-ink-muted"}>{v === "list" ? "List" : "Map"}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <Screen>
      <Toggle />
      {view === "map" ? (
        <View className="flex-1 rounded-lg overflow-hidden">
          <AppleMaps.View
            style={{ flex: 1 }}
            cameraPosition={markers[0] ? { coordinates: markers[0].coordinates, zoom: 11 } : undefined}
            markers={markers}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.placeId + i}
          contentContainerClassName="gap-3 pb-4"
          renderSectionHeader={({ section }) => (
            <View className="pt-2 pb-1">
              <Text variant="heading">{section.title}</Text>
              {section.lodging ? <Text variant="caption">Stay: {section.lodging}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => (
            <Card className="gap-1">
              <Text variant="heading">{item.name}</Text>
              <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
              {item.travelMinutesFromPrev != null ? (
                <Text variant="caption">{item.travelMinutesFromPrev} min from previous</Text>
              ) : null}
            </Card>
          )}
        />
      )}
    </Screen>
  );
}
