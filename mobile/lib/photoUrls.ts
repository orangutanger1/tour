// mobile/lib/photoUrls.ts
// One batched signing call for the whole photo set. The previous per-photo
// queries put N sequential roundtrips between "screen mounts" and "first
// pixel" — even for images already sitting in expo-image's disk cache
// (cacheKey = storagePath, so a rotated token never re-downloads bytes).
// The query persists with the rest of the react-query cache, so relaunches
// render straight from disk instead of waiting on the network.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { signedUrls, type PhotoRow } from "./photos";

export function usePhotoUrls(photos: PhotoRow[]): Record<string, string> {
  const paths = photos.map((p) => p.storagePath).filter(Boolean).sort();
  const q = useQuery({
    queryKey: ["photoUrls", paths],
    queryFn: () => signedUrls(supabase, paths),
    enabled: paths.length > 0,
    staleTime: 60 * 60_000,
    // Adding/removing a photo changes the key; keep serving the old map while
    // the new batch signs so mounted images don't flash back to placeholders.
    placeholderData: (prev: Record<string, string> | undefined) => prev,
  });
  return q.data ?? {};
}
