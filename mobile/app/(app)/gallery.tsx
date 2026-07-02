// mobile/app/(app)/gallery.tsx
import { useEffect, useState } from "react";
import { View, ScrollView, FlatList, Pressable, Modal, TextInput, Dimensions } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import Sortable from "react-native-sortables";
import { supabase } from "../../lib/supabase";
import { listTrips } from "../../lib/trips";
import {
  listPhotos, signedUrl, groupByAlbum, deletePhoto, updateCaption, reorderPhotos, toggleFavorite,
  type PhotoRow,
} from "../../lib/photos";
import { Screen, Text, Button, Loading, EmptyState, Icon, Photo, PressableScale } from "../../components/ui";

export default function Gallery() {
  const router = useRouter();
  const qc = useQueryClient();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [editing, setEditing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const photosQ = useQuery({ queryKey: ["photos"], queryFn: () => listPhotos(supabase) });
  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase) });
  const all = photosQ.data ?? [];
  const album = groupByAlbum(all).find((a) => a.tripId === tripId);
  const photos = album?.photos ?? [];

  // One query per path, cached long: add/delete/reorder no longer re-sign every
  // image (which changed the uri and forced <Image> to re-download).
  const urls = useQueries({
    queries: photos.map((p) => ({
      queryKey: ["photoUrl", p.storagePath],
      queryFn: () => signedUrl(supabase, p.storagePath),
      staleTime: 50 * 60_000,
      enabled: !!p.storagePath,
    })),
    combine: (res) => {
      const m: Record<string, string> = {};
      photos.forEach((p, i) => { const u = res[i]?.data; if (u) m[p.storagePath] = u; });
      return m;
    },
  });

  const title = tripsQ.data?.find((t) => t.id === tripId)?.location ?? "Album";
  const refresh = () => qc.invalidateQueries({ queryKey: ["photos"] });

  async function makeCoverId(id: string) {
    await reorderPhotos(supabase, [id, ...photos.map((p) => p.id).filter((x) => x !== id)]);
    refresh();
  }
  async function commitOrder(ordered: PhotoRow[]) {
    await reorderPhotos(supabase, ordered.map((p) => p.id));
    refresh();
  }
  async function favorite(photo: PhotoRow) {
    const next = !photo.isFavorite;
    qc.setQueryData(["photos"], (old: PhotoRow[] | undefined) =>
      (old ?? []).map((p) => (p.id === photo.id ? { ...p, isFavorite: next } : p)));
    try { await toggleFavorite(supabase, photo.id, next); } catch { refresh(); }
  }
  async function remove(photo: PhotoRow) {
    await deletePhoto(supabase, photo);
    setLightboxIndex(null);
    refresh();
  }
  async function saveCaption(photo: PhotoRow, caption: string) {
    await updateCaption(supabase, photo.id, caption || null);
    refresh();
  }

  if (photosQ.isLoading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
          <Text variant="title">{title}</Text>
        </View>
        <Button title={editing ? "Done" : "Edit"} variant="ghost" size="sm" onPress={() => setEditing((e) => !e)} />
      </View>

      {photos.length === 0 ? (
        <EmptyState icon={<Icon name="images" size={28} color="#6B5560" />} title="No photos yet" subtitle="Add your first one from this trip."
          action={<Button title="Add photo" size="lg" onPress={() => router.push({ pathname: "/add-photo", params: { tripId } })} />} />
      ) : editing ? (
        <View className="flex-1">
          <Text variant="caption" className="text-ink-muted mb-2">Hold a photo to drag it into place.</Text>
          <Sortable.Grid
            columns={3}
            data={photos}
            keyExtractor={(p) => p.id}
            rowGap={8}
            columnGap={8}
            onDragEnd={({ data }) => commitOrder(data)}
            renderItem={({ item, index }) => (
              <View>
                <Thumb url={urls[item.storagePath]} cacheKey={item.storagePath} isCover={index === 0} isFavorite={item.isFavorite}
                  onOpen={() => setLightboxIndex(index)} onFavorite={() => favorite(item)} />
                <Button title="Cover" variant="ghost" size="sm" onPress={() => makeCoverId(item.id)} />
              </View>
            )}
          />
        </View>
      ) : (
        <ScrollView contentContainerClassName="flex-row flex-wrap gap-2 pb-24">
          {photos.map((photo, i) => (
            <View key={photo.id} className="w-[31%]">
              <Thumb url={urls[photo.storagePath]} cacheKey={photo.storagePath} isCover={i === 0} isFavorite={photo.isFavorite}
                onOpen={() => setLightboxIndex(i)} onFavorite={() => favorite(photo)} />
              {photo.caption ? (
                <Text variant="caption" numberOfLines={1} className="mt-1">{photo.caption}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {photos.length > 0 ? (
        <View className="absolute left-6 right-6 bottom-6">
          <Button title="Add photo" size="lg" onPress={() => router.push({ pathname: "/add-photo", params: { tripId } })} />
        </View>
      ) : null}

      <Lightbox photos={photos} urls={urls} startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)} onDelete={remove}
        onSaveCaption={saveCaption} onFavorite={favorite} />
    </Screen>
  );
}

function Thumb({ url, cacheKey, isCover, isFavorite, onOpen, onFavorite }: {
  url?: string; cacheKey: string; isCover: boolean; isFavorite: boolean; onOpen: () => void; onFavorite: () => void;
}) {
  return (
    <PressableScale onPress={onOpen}>
      {url ? (
        <Photo uri={url} cacheKey={cacheKey} recyclingKey={cacheKey} className="w-full aspect-square rounded-lg bg-surface" />
      ) : (
        <View className="w-full aspect-square rounded-lg bg-surface" />
      )}
      {isCover ? (
        <View className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full bg-black/45">
          <Text className="text-[10px] text-white">Cover</Text>
        </View>
      ) : null}
      <Pressable onPress={onFavorite} hitSlop={8}
        className="absolute bottom-1 right-1 w-7 h-7 rounded-full items-center justify-center bg-black/40">
        <Text className={`text-[15px] ${isFavorite ? "text-[#FFD43B]" : "text-white"}`}>{isFavorite ? "★" : "☆"}</Text>
      </Pressable>
    </PressableScale>
  );
}

function Lightbox({ photos, urls, startIndex, onClose, onDelete, onSaveCaption, onFavorite }: {
  photos: PhotoRow[]; urls: Record<string, string>; startIndex: number | null; onClose: () => void;
  onDelete: (p: PhotoRow) => void; onSaveCaption: (p: PhotoRow, c: string) => void; onFavorite: (p: PhotoRow) => void;
}) {
  const width = Dimensions.get("window").width;
  const [index, setIndex] = useState(startIndex ?? 0);
  const [draft, setDraft] = useState("");

  // Reset to the tapped photo each time the lightbox opens.
  useEffect(() => { if (startIndex != null) { setIndex(startIndex); setDraft(photos[startIndex]?.caption ?? ""); } }, [startIndex]);

  const photo = startIndex == null ? null : photos[Math.min(index, photos.length - 1)];

  return (
    <Modal visible={startIndex != null} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/95 justify-center">
        {photo ? (
          <>
            <FlatList
              data={photos}
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              initialScrollIndex={Math.min(startIndex ?? 0, photos.length - 1)}
              getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
              keyExtractor={(p) => p.id}
              onMomentumScrollEnd={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / width);
                setIndex(i); setDraft(photos[i]?.caption ?? "");
              }}
              renderItem={({ item }) => (
                <View style={{ width }} className="items-center justify-center">
                  {urls[item.storagePath] ? (
                    <Photo uri={urls[item.storagePath]} cacheKey={item.storagePath} recyclingKey={item.storagePath} style={{ width: width - 24, aspectRatio: 1 }} className="rounded-xl" contentFit="contain" />
                  ) : <View style={{ width: width - 24, aspectRatio: 1 }} className="rounded-xl bg-surface/10" />}
                </View>
              )}
            />
            <View className="px-6">
              <View className="flex-row items-center justify-between">
                <Text className="text-white/60 text-[13px]">{index + 1} / {photos.length}</Text>
                <Pressable onPress={() => onFavorite(photo)} hitSlop={10}>
                  <Text className={`text-[22px] ${photo.isFavorite ? "text-[#FFD43B]" : "text-white"}`}>
                    {photo.isFavorite ? "★" : "☆"}
                  </Text>
                </Pressable>
              </View>
              <TextInput
                value={draft} onChangeText={setDraft} placeholder="Add a caption…" placeholderTextColor="#9b8b92"
                className="text-white border-b border-white/30 mt-3 py-2"
                onBlur={() => onSaveCaption(photo, draft)}
              />
              <View className="flex-row justify-between mt-6">
                <Button title="Delete" variant="secondary" onPress={() => onDelete(photo)} />
                <Button title="Close" onPress={onClose} />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
