// mobile/app/(app)/gallery.tsx
import { useState } from "react";
import { View, ScrollView, Image, Pressable, Modal, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { listTrips } from "../../lib/trips";
import {
  listPhotos, signedUrls, groupByAlbum, deletePhoto, updateCaption, reorderPhotos,
  type PhotoRow,
} from "../../lib/photos";
import { Screen, Text, Button, Loading, EmptyState } from "../../components/ui";

export default function Gallery() {
  const router = useRouter();
  const qc = useQueryClient();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const [editing, setEditing] = useState(false);
  const [lightbox, setLightbox] = useState<PhotoRow | null>(null);

  const photosQ = useQuery({ queryKey: ["photos"], queryFn: () => listPhotos(supabase) });
  const tripsQ = useQuery({ queryKey: ["trips"], queryFn: () => listTrips(supabase) });
  const all = photosQ.data ?? [];
  const album = groupByAlbum(all).find((a) => a.tripId === tripId);
  const photos = album?.photos ?? [];

  const urlsQ = useQuery({
    queryKey: ["photoUrls", photos.map((p) => p.storagePath)],
    queryFn: () => signedUrls(supabase, photos.map((p) => p.storagePath)),
    enabled: photos.length > 0,
  });
  const urls = urlsQ.data ?? {};
  const title = tripsQ.data?.find((t) => t.id === tripId)?.location ?? "Album";
  const refresh = () => qc.invalidateQueries({ queryKey: ["photos"] });

  async function move(index: number, dir: -1 | 1) {
    const ids = photos.map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await reorderPhotos(supabase, ids);
    refresh();
  }
  async function makeCover(index: number) {
    const ids = photos.map((p) => p.id);
    const [picked] = ids.splice(index, 1);
    await reorderPhotos(supabase, [picked, ...ids]);
    refresh();
  }
  async function remove(photo: PhotoRow) {
    await deletePhoto(supabase, photo);
    setLightbox(null);
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
        <EmptyState title="No photos yet" subtitle="Add your first one from this trip."
          action={<Button title="Add photo" onPress={() => router.push({ pathname: "/add-photo" as never, params: { tripId } })} />} />
      ) : (
        <ScrollView contentContainerClassName="flex-row flex-wrap gap-2 pb-24">
          {photos.map((photo, i) => (
            <View key={photo.id} className="w-[31%]">
              <Pressable onPress={() => setLightbox(photo)}>
                <Image source={{ uri: urls[photo.storagePath] }} className="w-full aspect-square rounded-lg bg-surface" />
              </Pressable>
              {editing ? (
                <View className="flex-row justify-between mt-1">
                  <Button title="↑" variant="ghost" size="sm" onPress={() => move(i, -1)} />
                  <Button title="★" variant="ghost" size="sm" onPress={() => makeCover(i)} />
                  <Button title="↓" variant="ghost" size="sm" onPress={() => move(i, 1)} />
                </View>
              ) : photo.caption ? (
                <Text variant="caption" numberOfLines={1} className="mt-1">{photo.caption}</Text>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      {photos.length > 0 ? (
        <View className="absolute left-6 right-6 bottom-6">
          <Button title="Add photo" onPress={() => router.push({ pathname: "/add-photo" as never, params: { tripId } })} />
        </View>
      ) : null}

      <Lightbox photo={lightbox} url={lightbox ? urls[lightbox.storagePath] : undefined}
        onClose={() => setLightbox(null)} onDelete={remove} onSaveCaption={saveCaption} />
    </Screen>
  );
}

function Lightbox({ photo, url, onClose, onDelete, onSaveCaption }: {
  photo: PhotoRow | null; url?: string; onClose: () => void;
  onDelete: (p: PhotoRow) => void; onSaveCaption: (p: PhotoRow, c: string) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <Modal visible={!!photo} transparent animationType="fade" onShow={() => setDraft(photo?.caption ?? "")}>
      <View className="flex-1 bg-black/90 justify-center p-6">
        {photo ? (
          <>
            <Image source={{ uri: url }} className="w-full aspect-square rounded-xl" resizeMode="contain" />
            <TextInput
              value={draft} onChangeText={setDraft} placeholder="Add a caption…" placeholderTextColor="#9b8b92"
              className="text-white border-b border-white/30 mt-4 py-2"
              onBlur={() => onSaveCaption(photo, draft)}
            />
            <View className="flex-row justify-between mt-6">
              <Button title="Delete" variant="secondary" onPress={() => onDelete(photo)} />
              <Button title="Close" onPress={onClose} />
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}
