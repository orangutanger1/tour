// mobile/app/(app)/itinerary.tsx
import { useEffect, useMemo, useState } from "react";
import { View, SectionList, Pressable, ScrollView } from "react-native";
import { AppleMaps } from "expo-maps";
import Sortable from "react-native-sortables";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useTripFlow } from "../../lib/tripFlow";
import { supabase } from "../../lib/supabase";
import { getTrip, updateTripItinerary } from "../../lib/trips";
import { getStopCoords, decodePolyline, formatDwell, numberStops, type StopCoord } from "../../lib/poi";
import { formatDayHeader, addDaysISO, inclusiveDayCount } from "../../lib/dates";
import { Screen, Text, Button, Card, EmptyState, Loading, Icon } from "../../components/ui";
import { removeStop, reorderStops, moveStopToDay } from "../../lib/editItinerary";
import { scheduleDayClient } from "../../lib/scheduleClient";
import { requestDayReroute } from "../../lib/editClient";
import { useAuth } from "../../lib/auth";
import type { Itinerary, Stop } from "../../lib/types";

type NumberedStop = Stop & { num: number | null };

const extra = Constants.expoConfig?.extra as { supabaseUrl: string };

export default function Itinerary() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const flow = useTripFlow();
  const { session } = useAuth();

  const tripQuery = useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => getTrip(supabase, tripId as string),
    enabled: !!tripId,
  });

  // When opened from a saved trip use the DB row; otherwise the just-generated flow.
  const data = tripId ? (tripQuery.data ?? undefined) : flow.data;
  const resolvedTripId = (tripId as string | undefined) ?? flow.data?.tripId;

  const [view, setView] = useState<"list" | "map">("list");
  const [coords, setCoords] = useState<Record<string, StopCoord>>({});
  const [selectedDay, setSelectedDay] = useState(1);
  const [edited, setEdited] = useState<Itinerary | null>(null);
  const [editing, setEditing] = useState(false);
  const [approx, setApprox] = useState(false);

  const plainCoords = useMemo(
    () => Object.fromEntries(Object.entries(coords).map(([k, v]) => [k, { lat: v.lat, lng: v.lng }])),
    [coords],
  );

  const working: Itinerary = edited ?? data?.itinerary ?? { days: [] };
  const days = working.days;
  const empty = days.length === 0 || days.every((d) => d.stops.length === 0);

  async function applyEdit(next: Itinerary, changedDays: number | number[]) {
    const dayList = Array.isArray(changedDays) ? changedDays : [changedDays];
    const daySet = new Set(dayList);
    const rescheduled: Itinerary = {
      ...next,
      days: next.days.map((d) => (daySet.has(d.day) ? scheduleDayClient(d, plainCoords) : d)),
    };
    const previous = edited;
    setEdited(rescheduled); // optimistic
    setApprox(true);
    if (!resolvedTripId) return;
    try {
      await updateTripItinerary(supabase, resolvedTripId, rescheduled);
    } catch {
      // revert on persist failure
      setEdited(previous);
      setApprox(false);
      return;
    }
    const token = session?.access_token;
    if (!token) return;
    const freshResults = await Promise.all(
      dayList.map((day) =>
        requestDayReroute({ tripId: resolvedTripId, day, accessToken: token, baseUrl: extra.supabaseUrl }).then(
          (fresh) => [day, fresh] as const,
        ),
      ),
    );
    const freshByDay = new Map(freshResults);
    setEdited((cur) => (cur ? { ...cur, days: cur.days.map((d) => freshByDay.get(d.day) ?? d) } : cur));
    setApprox(false);
    await updateTripItinerary(supabase, resolvedTripId, {
      ...rescheduled,
      days: rescheduled.days.map((d) => freshByDay.get(d.day) ?? d),
    }).catch(() => {});
  }

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

  // Saved trips carry dates on the row; a just-generated trip only has them on the request.
  const startDate = tripId ? tripQuery.data?.startDate : flow.lastRequest?.startDate;
  const endDate = tripId ? tripQuery.data?.endDate : flow.lastRequest?.endDate;
  const requestedDays = startDate && endDate ? inclusiveDayCount(startDate, endDate) : null;
  const sections = days.map((d) => ({
    title: startDate ? `${formatDayHeader(addDaysISO(startDate, d.day - 1))} · Day ${d.day}` : `Day ${d.day}`,
    lodging: d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined,
    day: d.day,
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
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
            <Text variant="label" className="text-accent">{editing ? "Done" : "Edit"}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace("/onboarding")} hitSlop={8}>
            <Text variant="label" className="text-accent">New trip</Text>
          </Pressable>
        </View>
      </View>
      <Toggle />
      {approx ? (
        <Text variant="caption" className="text-center text-ink-muted mb-1">Updating times…</Text>
      ) : null}
      {requestedDays != null && requestedDays > days.length ? (
        <Text variant="caption" className="text-center mb-2">
          Only enough local highlights for {days.length} full {days.length === 1 ? "day" : "days"} — shorter than your dates.
        </Text>
      ) : null}
      {view === "map" ? (
        <View className="flex-1">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pb-2" className="grow-0 mb-1">
            {days.map((d) => (
              <Pressable
                key={d.day}
                onPress={() => setSelectedDay(d.day)}
                className={`px-4 py-2 rounded-pill border ${selectedDay === d.day ? "bg-accent border-accent" : "bg-white/75 border-white/60 shadow-soft"}`}
              >
                <Text variant="label" className={selectedDay === d.day ? "text-ink-inverse" : "text-ink-muted"}>Day {d.day}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View className="flex-1 rounded-xl overflow-hidden">
            <AppleMaps.View
              style={{ flex: 1 }}
              cameraPosition={dayMarkers[0] ? { coordinates: dayMarkers[0].coordinates, zoom: 12 } : undefined}
              markers={[...dayMarkers, ...mealMarkers]}
              polylines={dayPolyline}
            />
          </View>
        </View>
      ) : editing ? (
        <ScrollView contentContainerClassName="gap-3 pb-4">
          {days.map((d) => {
            const numbered = numberStops(d.stops);
            const attractions = numbered.filter((s) => s.kind !== "meal" && s.kind !== "meal-gap");
            const meals = numbered.filter((s) => s.kind === "meal" || s.kind === "meal-gap");
            const title = startDate ? `${formatDayHeader(addDaysISO(startDate, d.day - 1))} · Day ${d.day}` : `Day ${d.day}`;
            const lodging = d.lodgingPlaceId ? coords[d.lodgingPlaceId]?.name : undefined;
            const otherDays = days.filter((other) => other.day !== d.day).map((other) => other.day);
            return (
              <View key={d.day} className="gap-3">
                <View className="bg-bg pt-2 pb-2">
                  <Text variant="heading">{title}</Text>
                  {lodging ? <Text variant="caption">Stay: {lodging}</Text> : null}
                </View>
                {attractions.length > 0 ? (
                  <Sortable.Grid
                    columns={1}
                    data={attractions}
                    keyExtractor={(item) => item.placeId + item.num}
                    rowGap={12}
                    onDragEnd={({ fromIndex, toIndex }) => applyEdit(reorderStops(working, d.day, fromIndex, toIndex), d.day)}
                    renderItem={({ item }) => (
                      <AttractionCard item={item} day={d.day} editing={editing} working={working} applyEdit={applyEdit} otherDays={otherDays} />
                    )}
                  />
                ) : null}
                {meals.map((item) => (
                  <MealCard key={item.placeId + (item.mealSlot ?? "") + (item.startTime ?? "")} item={item} />
                ))}
              </View>
            );
          })}
        </ScrollView>
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
          renderItem={({ item, section }) => {
            const isMeal = item.kind === "meal" || item.kind === "meal-gap";
            return isMeal ? (
              <MealCard item={item} />
            ) : (
              <AttractionCard item={item} day={section.day} editing={editing} working={working} applyEdit={applyEdit} otherDays={[]} />
            );
          }}
        />
      )}
    </Screen>
  );
}

function MealCard({ item }: { item: NumberedStop }) {
  const mealLabel = item.mealSlot === "lunch" ? "Lunch" : item.mealSlot === "dinner" ? "Dinner" : "Meal";
  return (
    <Card className={`gap-1 ${item.kind === "meal-gap" ? "border-dashed" : ""}`}>
      <View className="flex-row items-baseline gap-2">
        {item.startTime ? (
          <View className="px-2 py-0.5 rounded-pill bg-accent-soft">
            <Text variant="label" className="text-accent text-[12px]">{item.startTime}</Text>
          </View>
        ) : null}
        <Text variant="heading">{mealLabel}{item.placeId ? ` · ${item.name}` : ""}</Text>
      </View>
      <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
      {formatDwell(item.dwellMinutes) ? <Text variant="caption">{formatDwell(item.dwellMinutes)}</Text> : null}
    </Card>
  );
}

function AttractionCard({ item, day, editing, working, applyEdit, otherDays }: {
  item: NumberedStop;
  day: number;
  editing: boolean;
  working: Itinerary;
  applyEdit: (next: Itinerary, changedDays: number | number[]) => void;
  otherDays: number[];
}) {
  return (
    <Card className="gap-1 relative">
      {editing && item.num != null ? (
        <Pressable
          onPress={() => applyEdit(removeStop(working, day, item.num! - 1), day)}
          hitSlop={8}
          className="absolute right-3 top-3 z-10"
        >
          <Icon name="close" size={18} color="#6B5560" />
        </Pressable>
      ) : null}
      <View className="flex-row items-baseline gap-2">
        {item.startTime ? (
          <View className="px-2 py-0.5 rounded-pill bg-accent-soft">
            <Text variant="label" className="text-accent text-[12px]">{item.startTime}</Text>
          </View>
        ) : null}
        <Text variant="heading">{item.num}. {item.name}</Text>
      </View>
      <Text variant="body" className="text-ink-muted">{item.blurb}</Text>
      <View className="flex-row gap-3">
        {formatDwell(item.dwellMinutes) ? <Text variant="caption">{formatDwell(item.dwellMinutes)} here</Text> : null}
        {item.travelMinutesFromPrev != null ? <Text variant="caption">{item.travelMinutesFromPrev} min from previous</Text> : null}
      </View>
      {editing && item.num != null && otherDays.length > 0 ? (
        <View className="flex-row gap-2 flex-wrap mt-1">
          {otherDays.map((dayNum) => (
            <Pressable
              key={dayNum}
              onPress={() => applyEdit(moveStopToDay(working, day, item.num! - 1, dayNum), [day, dayNum])}
              className="px-2 py-1 rounded-pill bg-surface-2"
            >
              <Text variant="label" className="text-ink-muted text-[12px]">→ Day {dayNum}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
