// mobile/components/DiscoverCards.tsx
// Card primitives shared by the Discover tab and the filtered list screen.
import type { ReactNode } from "react";
import { View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { Destination, Tag } from "../lib/destinations";
import { flagEmoji } from "../lib/discover";
import { GlassPress, Photo, Text } from "./ui";

export const TAG_LABEL: Record<Tag, string> = {
  popular: "Popular",
  trending: "Trending",
  underRadar: "Under the radar",
};

const SCRIM = ["transparent", "rgba(26,14,18,0.72)"] as const;
// Third-party components (LinearGradient, BlurView) are not NativeWind-interop'd:
// style objects only. Photo IS interop'd (see Photo.tsx), so className is fine there.
export const ABS_FILL = { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 } as const;

// Glass pill (BlurView) used for tag badges and flag chips.
// NB: BlurView is third-party — NativeWind does NOT interop it, so className
// would be silently dropped; style only (and cssInterop is banned outside Photo).
export function GlassPill({ children }: { children: ReactNode }) {
  return (
    <BlurView intensity={30} tint="light" style={{ borderRadius: 999, overflow: "hidden" }}>
      <View className="px-3 py-1.5 flex-row items-center gap-1.5 bg-white/25">{children}</View>
    </BlurView>
  );
}

export function DestinationCard({ d, size, onPress }: { d: Destination; size: "lg" | "md"; onPress: () => void }) {
  const dims = size === "lg" ? "w-64 h-80" : "w-40 h-56";
  return (
    <GlassPress onPress={onPress}>
      <View className={`${dims} rounded-xl overflow-hidden bg-surface shadow-card`}>
        <Photo uri={d.imageUrl} cacheKey={d.id} className="absolute inset-0 w-full h-full" />
        <LinearGradient colors={SCRIM} style={ABS_FILL} />
        {d.tags[0] ? (
          <View className="absolute top-3 left-3">
            <GlassPill>
              <Text variant="label" className="text-white">{TAG_LABEL[d.tags[0]]}</Text>
            </GlassPill>
          </View>
        ) : null}
        <View className="absolute bottom-3 left-3 right-3">
          <Text variant={size === "lg" ? "heading" : "label"} className="text-white" numberOfLines={1}>{d.name}</Text>
          <Text variant="caption" className="text-white/85" numberOfLines={1}>
            {flagEmoji(d.countryCode)} {d.country}
          </Text>
        </View>
      </View>
    </GlassPress>
  );
}

// Theme / continent tile: image background + centered label.
export function TileCard({ label, imageUrl, onPress }: { label: string; imageUrl?: string; onPress: () => void }) {
  return (
    <GlassPress onPress={onPress}>
      <View className="w-36 h-24 rounded-xl overflow-hidden bg-surface shadow-card items-center justify-center">
        {imageUrl ? <Photo uri={imageUrl} cacheKey={`tile-${label}`} className="absolute inset-0 w-full h-full" /> : null}
        <LinearGradient colors={SCRIM} style={ABS_FILL} />
        <Text variant="label" className="text-white">{label}</Text>
      </View>
    </GlassPress>
  );
}
