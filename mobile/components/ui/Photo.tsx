// mobile/components/ui/Photo.tsx
// expo-image wrapper for user photos. cacheKey pins the disk cache to the storage
// path — signed URLs rotate their token every session, so caching by URL (what RN
// <Image> does) re-downloaded every photo on every app start.
import { Image, type ImageProps } from "expo-image";
import { cssInterop } from "nativewind";

cssInterop(Image, { className: "style" });

export function Photo({ uri, cacheKey, recyclingKey, contentFit = "cover", className, style }: {
  uri: string;
  cacheKey: string;
  recyclingKey?: string;
  contentFit?: "cover" | "contain";
  className?: string;
  style?: ImageProps["style"];
}) {
  return (
    <Image
      source={{ uri, cacheKey }}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      contentFit={contentFit}
      transition={120}
      className={className}
      style={style}
    />
  );
}
