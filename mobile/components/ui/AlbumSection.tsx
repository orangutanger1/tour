// mobile/components/ui/AlbumSection.tsx
import { View } from "react-native";
import { Text } from "./Text";
import { PhotoStack, type StackPhoto } from "./PhotoStack";
import type { GalleryStyle } from "../../lib/profile";

export function AlbumSection({ title, photos, style, onOpen }: {
  title: string; photos: StackPhoto[]; style: GalleryStyle; onOpen: () => void;
}) {
  return (
    <View className="mb-6">
      <View className="flex-row items-baseline justify-between mb-2">
        <Text variant="heading">{title}</Text>
        <Text variant="caption">{photos.length} {photos.length === 1 ? "photo" : "photos"}</Text>
      </View>
      <PhotoStack photos={photos} style={style} onPress={onOpen} />
    </View>
  );
}
