// mobile/app/(app)/add-photo.tsx
import { useState } from "react";
import { View, ScrollView, Image } from "react-native";
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
  const [picked, setPicked] = useState<Picked | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);

  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase) });
  const tripQ = useQuery({ queryKey: ["trip", tripId], queryFn: () => getTrip(supabase, tripId!), enabled: !!tripId });

  const stops = (tripQ.data?.itinerary.days ?? [])
    .flatMap((d) => d.stops)
    .filter((s) => s.placeId && s.kind !== "meal-gap");

  async function pick(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6 });
    if (!res.canceled && res.assets[0]?.base64) {
      setPicked({ uri: res.assets[0].uri, base64: res.assets[0].base64 });
    }
  }

  async function save() {
    if (!tripId || !stop || !picked) return;
    setBusy(true);
    try {
      await addPhoto(supabase, {
        tripId, placeId: stop.placeId, placeName: stop.name,
        caption: caption || null, base64: picked.base64,
      });
      qc.invalidateQueries({ queryKey: ["photos"] });
      router.back();
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <Screen><Loading label="Uploading…" /></Screen>;

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
            {picked ? <Image source={{ uri: picked.uri }} className="w-full aspect-square rounded-xl" /> : null}
            <View className="flex-row gap-3">
              <View className="flex-1"><Button title="Camera" variant="secondary" onPress={() => pick(true)} /></View>
              <View className="flex-1"><Button title="Library" variant="secondary" onPress={() => pick(false)} /></View>
            </View>
            <Input placeholder="Caption (optional)" value={caption} onChangeText={setCaption} />
            <Button title="Save to passport" onPress={save} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
