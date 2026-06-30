// mobile/components/ui/PhotoStack.tsx
import { View, Image, Pressable } from "react-native";
import { Text } from "./Text";
import type { GalleryStyle } from "../../lib/profile";

export interface StackPhoto { id: string; url: string; caption?: string | null; }

// Deterministic fan angles so a stack looks the same across renders.
const ANGLES = [-6, 5, -3, 7];

export function PhotoStack({ photos, style, onPress }: {
  photos: StackPhoto[]; style: GalleryStyle; onPress: () => void;
}) {
  const top = photos.slice(0, 4);
  if (top.length === 0) {
    return (
      <Pressable onPress={onPress} className="h-44 items-center justify-center rounded-2xl bg-surface">
        <Text variant="caption">No photos yet — tap to add</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} className="h-44 items-center justify-center">
      {top.map((photo, i) => (
        <View
          key={photo.id}
          style={{ transform: [{ rotate: `${ANGLES[i % ANGLES.length]}deg` }], zIndex: i, elevation: i }}
          className={`absolute rounded-md bg-white shadow-lg ${style === "polaroid" ? "p-2 pb-6" : "p-0.5"}`}
        >
          {photo.url ? (
            <Image source={{ uri: photo.url }} className="w-32 h-32 rounded-sm" />
          ) : (
            <View className="w-32 h-32 rounded-sm bg-surface" />
          )}
          {style === "polaroid" && photo.caption ? (
            <Text className="text-[10px] text-ink-muted text-center mt-1" numberOfLines={1}>
              {photo.caption}
            </Text>
          ) : null}
        </View>
      ))}
    </Pressable>
  );
}
