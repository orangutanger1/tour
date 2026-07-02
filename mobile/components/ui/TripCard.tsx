// mobile/components/ui/TripCard.tsx
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Card } from "./Card";
import { Photo } from "./Photo";
import { Text } from "./Text";
import { SUNSET_SOFT } from "./gradients";
import { tripDayCount, type TripSummary } from "../../lib/trips";
import { formatShort } from "../../lib/dates";

// Phase 1 has no user photos yet — cover is a tinted panel with the destination's
// initial. Phase 2 swaps in the first uploaded photo as the cover.
export function TripCard({ trip, coverUrl, coverKey, onPress }: { trip: TripSummary; coverUrl?: string; coverKey?: string; onPress: () => void }) {
  const days = tripDayCount(trip);
  const initial = trip.location.trim().charAt(0).toUpperCase() || "?";
  return (
    <Card onPress={onPress} className="overflow-hidden">
      <View className="h-40 -mx-5 -mt-5 mb-3 items-center justify-center overflow-hidden">
        {coverUrl ? (
          <Photo uri={coverUrl} cacheKey={coverKey ?? coverUrl} className="w-full h-full" />
        ) : (
          <LinearGradient colors={SUNSET_SOFT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" }}>
            <Text className="text-[72px] leading-[80px] font-jakarta-extrabold text-accent opacity-30">{initial}</Text>
          </LinearGradient>
        )}
      </View>
      <Text variant="heading">{trip.location}</Text>
      <Text variant="caption">
        {trip.startDate && trip.endDate
          ? `${formatShort(trip.startDate)} → ${formatShort(trip.endDate)} · ${days === 1 ? "1 day" : `${days} days`}`
          : days === 1 ? "1-day trip" : `${days}-day trip`}
      </Text>
    </Card>
  );
}
