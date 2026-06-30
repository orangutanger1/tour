// mobile/app/(app)/itinerary.tsx
import { useEffect, useMemo, useState } from "react";
import { View, SectionList, Pressable } from "react-native";
import { AppleMaps } from "expo-maps";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTripFlow } from "../../lib/tripFlow";
import { supabase } from "../../lib/supabase";
import { getTrip } from "../../lib/trips";
import { getStopCoords, decodePolyline, formatDwell, numberStops, type StopCoord } from "../../lib/poi";
import { Screen, Text, Button, Card, EmptyState, Loading } from "../../components/ui";

export default function Itinerary() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const flow = useTripFlow();

  const tripQuery = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => getTrip(supabase, tripId as string),
    enabled: !!tripId,
  });

  // When opened from a saved trip use the DB row; otherwise the just-generated flow.
  const data = tripId ? (tripQuery.data ?? undefined) : flow.data;

  const [view, setView] = useState<"list" | "map">("list");
  const [coords, setCoords] = useState<Record<string, StopCoord>>({});
  const [selectedDay, setSelectedDay] = useState(1);

  const days = data?.itinerary.days ?? [];
  const empty = days.length === 0 || days.every((d) => d.stops.length === 0);

  const placeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const d of days) {
      if (d.lodgingPlaceId) ids.add(d.lodgingPlaceId);
      d.stops.forEach((s) => { if (s.placeId) ids.add(s.placeId); });
    }
    return [...ids];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (placeIds.length) getStopCoords(supabase, placeIds).then(setCoords).catch(() => {});
  }, [placeIds]);

  if (tripId && tripQuery.isLoading) {
    return <Screen><Loading label="Loading trip…" /></Screen>;
  }

  if (tripId && !tripQuery.isLoading && !data) {
    return (
      <Screen>
        <EmptyState
          title="Trip not found"
          subtitle="It may have been removed."
          action={<Button title="Back to trips" onPress={() => router.replace("/")} />}
        />
      </Screen>
    );
  }

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

  const activeDay = days.find((d) => d.day === selectedDay) ?? days[0];

  // Marker numbers come from numberStops so they match the list (meal-gaps are skipped in both).
  const dayMarkers = numberStops(activeDay?.stops ?? []).flatMap((s) => {
    if (s.num === null) return [];
    const coord = coords[s.placeId];
    if (!coord) return [];
    return [{ id: String(s.num), coordinates: { latitude: coord.lat, longitude: coord.lng }, title: `${s.num}. ${s.name}` }];
  });

  // Real meal stops (have a placeId) get their own marker, labeled by meal slot
  // rather than a number; meal-gaps have no placeId so they never map.
  const mealMarkers = (activeDay?.stops ?? []).flatMap((s) => {
    if (s.kind !== "meal" || !s.placeId) return [];
    const coord = coords[s.placeId];
    if (!coord) return [];
    const label = s.mealSlot === "lunch" ? "Lunch" : s.mealSlot === "dinner" ? "Dinner" : "Meal";
    return [{ id: `meal-${s.placeId}`, coordinates: { latitude: coord.lat, longitude: coord.lng }, title: `${label} — ${s.name}` }];
  });

  const dayPolyline = activeDay?.routePolyline
    ? [{ id: `route-${selectedDay}`, coordinates: decodePolyline(activeDay.routePolyline), color: "#E11D48", width: 4 }]
    : [];

  const sections = days.map((d) => ({
    title: `Day ${d.day}`,
    lodging: d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined,
    data: numberStops(d.stops),
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
      <View className="flex-row items-center justify-between mb-2">
        <Pressable onPress={() => router.replace("/")} hitSlop={8}>
          <Text variant="label" className="text-ink-muted">‹ Home</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/onboarding")} hitSlop={8}>
          <Text variant="label" className="text-accent">New trip</Text>
        </Pressable>
      </View>
      <Toggle />
      {view === "map" ? (
        <View className="flex-1">
          <View className="flex-row flex-wrap gap-2 mb-2">
            {days.map((d) => (
              <Pressable
                key={d.day}
                onPress={() => setSelectedDay(d.day)}
                className={`px-3 py-1.5 rounded-pill ${selectedDay === d.day ? "bg-accent" : "bg-surface-2"}`}
              >
                <Text variant="label" className={selectedDay === d.day ? "text-white" : "text-ink-muted"}>Day {d.day}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-1 rounded-lg overflow-hidden">
            <AppleMaps.View
              style={{ flex: 1 }}
              cameraPosition={dayMarkers[0] ? { coordinates: dayMarkers[0].coordinates, zoom: 12 } : undefined}
              markers={[...dayMarkers, ...mealMarkers]}
              polylines={dayPolyline}
            />
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) => item.placeId + i}
          contentContainerClassName="gap-3 pb-4"
          renderSectionHeader={({ section }) => (
            <View className="bg-bg pt-2 pb-2">
              <Text variant="heading">{section.title}</Text>
              {section.lodging ? <Text variant="caption">Stay: {section.lodging}</Text> : null}
            </View>
          )}
          renderItem={({ item }) => {
            const isMeal = item.kind === "meal" || item.kind === "meal-gap";
            const mealLabel = item.mealSlot === "lunch" ? "Lunch" : item.mealSlot === "dinner" ? "Dinner" : "Meal";
            return isMeal ? (
              <Card className={`gap-1 ${item.kind === "meal-gap" ? "border-dashed" : ""}`}>
                <View className="flex-row items-baseline gap-2">
                  {item.startTime ? <Text variant="label" className="text-accent">{item.startTime}</Text> : null}
                  <Text variant="heading">{mealLabel}{item.placeId ? ` · ${item.name}` : ""}</Text>
                </View>
                <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
                {formatDwell(item.dwellMinutes) ? <Text variant="caption">{formatDwell(item.dwellMinutes)}</Text> : null}
              </Card>
            ) : (
              <Card className="gap-1">
                <View className="flex-row items-baseline gap-2">
                  {item.startTime ? <Text variant="label" className="text-accent">{item.startTime}</Text> : null}
                  <Text variant="heading">{item.num}. {item.name}</Text>
                </View>
                <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
                <View className="flex-row gap-3">
                  {formatDwell(item.dwellMinutes) ? <Text variant="caption">{formatDwell(item.dwellMinutes)} here</Text> : null}
                  {item.travelMinutesFromPrev != null ? <Text variant="caption">{item.travelMinutesFromPrev} min from previous</Text> : null}
                </View>
              </Card>
            );
          }}
        />
      )}
    </Screen>
  );
}
