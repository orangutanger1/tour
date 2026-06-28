// mobile/app/(app)/itinerary.tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, SectionList, Button, Pressable } from "react-native";
import { AppleMaps } from "expo-maps";
import { useRouter } from "expo-router";
import { useTripFlow } from "../../lib/tripFlow";
import { supabase } from "../../lib/supabase";
import { getStopCoords, type StopCoord } from "../../lib/poi";

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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>Limited data here</Text>
        <Text style={{ color: "#888", textAlign: "center" }}>Try a broader location.</Text>
        <Button title="Edit trip" onPress={() => router.replace("/onboarding")} />
      </View>
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

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, padding: 12 }}>
        <Pressable onPress={() => setView("list")}>
          <Text style={{ fontWeight: view === "list" ? "700" : "400" }}>List</Text>
        </Pressable>
        <Text>·</Text>
        <Pressable onPress={() => setView("map")}>
          <Text style={{ fontWeight: view === "map" ? "700" : "400" }}>Map</Text>
        </Pressable>
      </View>

      {view === "map" ? (
        <AppleMaps.View
          style={{ flex: 1 }}
          cameraPosition={markers[0] ? { coordinates: markers[0].coordinates, zoom: 11 } : undefined}
          markers={markers}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.placeId + i}
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: "#f3f4f6", padding: 12 }}>
              <Text style={{ fontWeight: "700" }}>{section.title}</Text>
              {section.lodging ? <Text style={{ color: "#888" }}>Stay: {section.lodging}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => (
            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
              <Text style={{ fontWeight: "600" }}>{item.name}</Text>
              <Text style={{ color: "#444" }}>{item.blurb}</Text>
              {item.travelMinutesFromPrev != null ? (
                <Text style={{ color: "#888", fontSize: 12 }}>{item.travelMinutesFromPrev} min from previous</Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
