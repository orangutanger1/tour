// mobile/app/(app)/(tabs)/passport.tsx
import { View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { AppleMaps } from "expo-maps";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { getStopCoords } from "../../../lib/poi";
import { getGalleryStyle } from "../../../lib/profile";
import { listTrips } from "../../../lib/trips";
import {
  listPhotos, groupByAlbum, distinctPlaceIds, coverPhoto, clusterPins,
} from "../../../lib/photos";
import { usePhotoUrls } from "../../../lib/photoUrls";
import { Screen, Text, Button, Loading, EmptyState, Icon, AlbumSection, type StackPhoto } from "../../../components/ui";

// ponytail: one cell size for the small header map. Make it zoom-reactive later if needed.
const CELL_DEG = 0.5;

export default function Passport() {
  const { session } = useAuth();
  const router = useRouter();

  const photosQ = useQuery({ queryKey: ["photos"], queryFn: () => listPhotos(supabase), enabled: !!session });
  const styleQ = useQuery({ queryKey: ["galleryStyle"], queryFn: () => getGalleryStyle(supabase), enabled: !!session });
  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase), enabled: !!session });

  const photos = photosQ.data ?? [];

  const coordsQ = useQuery({
    queryKey: ["photoCoords", distinctPlaceIds(photos)],
    queryFn: () => getStopCoords(supabase, distinctPlaceIds(photos)),
    enabled: photos.length > 0,
  });
  const urls = usePhotoUrls(photos);

  if (!session) {
    return <Screen><EmptyState icon={<Icon name="book" size={28} color="#6B5560" />} title="Passport" subtitle="Sign in to start your travel passport." /></Screen>;
  }
  if (photosQ.isLoading) return <Screen><Loading label="Opening your passport…" /></Screen>;
  if (photos.length === 0) {
    return <Screen><EmptyState icon={<Icon name="images" size={28} color="#6B5560" />} title="Passport" subtitle="Add photos from your trips and they'll collect here as albums." action={<Button title="Add a photo" size="lg" onPress={() => router.push("/add-photo")} />} /></Screen>;
  }

  const style = styleQ.data ?? "polaroid";
  const coords = coordsQ.data ?? {};
  const tripName = (id: string) => tripsQ.data?.find((t) => t.id === id)?.location ?? "Trip";

  const pins = photos
    .map((p) => ({ id: p.id, ...coords[p.placeId] }))
    .filter((p): p is { id: string; lat: number; lng: number; name: string } => "lat" in p);
  const clusters = clusterPins(pins, CELL_DEG);
  const markers = clusters.map((c) => ({
    id: c.ids[0],
    coordinates: { latitude: c.lat, longitude: c.lng },
    title: c.count > 1 ? `${c.count} photos` : "1 photo",
  }));

  const albums = groupByAlbum(photos);
  const toStack = (album: { photos: typeof photos }): StackPhoto[] =>
    album.photos.map((p) => ({ id: p.id, url: urls[p.storagePath] ?? "", cacheKey: p.storagePath, caption: p.caption }));

  return (
    <Screen>
      <View className="flex-row items-center justify-between mb-3">
        <Text variant="display">Passport</Text>
        <Button title="Add photo" size="sm" variant="secondary" onPress={() => router.push("/add-photo")} />
      </View>
      <View className="h-40 rounded-2xl overflow-hidden mb-6 bg-surface">
        {markers.length > 0 ? (
          <AppleMaps.View
            style={{ flex: 1 }}
            cameraPosition={{ coordinates: markers[0].coordinates, zoom: 4 }}
            markers={markers}
          />
        ) : null}
      </View>
      <ScrollView contentContainerClassName="pb-32">
        {albums.map((album) => {
          const cover = coverPhoto(album.photos);
          return (
            <AlbumSection
              key={album.tripId}
              title={tripName(album.tripId)}
              photos={cover ? [{ id: cover.id, url: urls[cover.storagePath] ?? "", cacheKey: cover.storagePath, caption: cover.caption }, ...toStack(album).filter((s) => s.id !== cover.id)] : toStack(album)}
              style={style}
              onOpen={() => router.push({ pathname: "/gallery", params: { tripId: album.tripId } })}
            />
          );
        })}
      </ScrollView>
    </Screen>
  );
}
