// mobile/app/(app)/add-photo.tsx
import { useState } from "react";
import { View, ScrollView, Image, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";
import { listTrips, getTrip } from "../../lib/trips";
import { addPhoto } from "../../lib/photos";
import { Screen, Text, Button, Card, Input, ListRow, Loading } from "../../components/ui";

interface Picked { uri: string; base64: string; }

export default function AddPhoto() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const [tripId, setTripId] = useState<string | undefined>(params.tripId);
  const [stop, setStop] = useState<{ placeId: string; name: string } | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase) });
  const tripQ = useQuery({ queryKey: ["trip", tripId], queryFn: () => getTrip(supabase, tripId!), enabled: !!tripId });

  // A landmark can appear on several days; dedupe so the picker (and its keys) are unique.
  const seen = new Set<string>();
  const stops = (tripQ.data?.itinerary.days ?? [])
    .flatMap((d) => d.stops)
    .filter((s) => s.placeId && s.kind !== "meal-gap" && (seen.has(s.placeId) ? false : (seen.add(s.placeId), true)));

  async function pick(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, allowsMultipleSelection: true, selectionLimit: 10 });
    if (res.canceled) return;
    const picks = res.assets
      .filter((a) => a.base64)
      .map((a) => ({ uri: a.uri, base64: a.base64! }));
    if (picks.length) setPicked(picks);
  }

  async function save() {
    if (!tripId || !stop || picked.length === 0) return;
    setBusy(true);
    try {
      for (const ph of picked) {
        await addPhoto(supabase, {
          tripId, placeId: stop.placeId, placeName: stop.name,
          caption: caption || null, base64: ph.base64,
        });
      }
      qc.invalidateQueries({ queryKey: ["photos"] });
      router.back();
    } catch (e) {
      setBusy(false);
      Alert.alert("Upload failed", "Please try again.");
    }
  }

  if (busy) return <Screen><Loading label={picked.length > 1 ? `Uploading ${picked.length} photos…` : "Uploading…"} /></Screen>;

  return (
    <Screen>
      <View className="flex-row items-center gap-2 mb-4">
        <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <Text variant="title">Add photo</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 pb-24">
        {!tripId ? (
          <>
            <Text variant="heading">Which trip?</Text>
            {(tripsQ.data ?? []).map((t) => (
              <ListRow key={t.id} title={t.location} onPress={() => setTripId(t.id)} />
            ))}
          </>
        ) : !stop ? (
          tripQ.isLoading ? <Loading /> : (
            <>
              <Text variant="heading">Which landmark?</Text>
              {stops.map((s) => (
                <ListRow key={s.placeId} title={s.name} onPress={() => setStop({ placeId: s.placeId, name: s.name })} />
              ))}
            </>
          )
        ) : (
          <>
            <Card className="gap-1">
              <Text variant="caption">Landmark</Text>
              <Text variant="heading">{stop.name}</Text>
            </Card>
            {picked.length > 0 ? (
              <View>
                <Image source={{ uri: picked[0].uri }} className="w-full aspect-square rounded-xl" />
                {picked.length > 1 ? (
                  <View className="absolute top-2 right-2 px-2 py-1 rounded-full bg-black/55">
                    <Text variant="caption" className="text-white">+{picked.length - 1} more</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <View className="flex-1"><Button title="Camera" variant="secondary" onPress={() => pick(true)} /></View>
              <View className="flex-1"><Button title="Library" variant="secondary" onPress={() => pick(false)} /></View>
            </View>
            <Input placeholder={picked.length > 1 ? "Caption (optional, applied to all)" : "Caption (optional)"} value={caption} onChangeText={setCaption} />
            <Button title={picked.length > 1 ? `Save ${picked.length} to passport` : "Save to passport"} onPress={save} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
