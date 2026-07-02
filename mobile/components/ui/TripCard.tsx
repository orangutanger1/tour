// mobile/components/ui/TripCard.tsx
import { View, Image } from "react-native";
import { Card } from "./Card";
import { Text } from "./Text";
import { tripDayCount, type TripSummary } from "../../lib/trips";
import { formatShort } from "../../lib/dates";

// Phase 1 has no user photos yet — cover is a tinted panel with the destination's
// initial. Phase 2 swaps in the first uploaded photo as the cover.
export function TripCard({ trip, coverUrl, onPress }: { trip: TripSummary; coverUrl?: string; onPress: () => void }) {
  const days = tripDayCount(trip);
  const initial = trip.location.trim().charAt(0).toUpperCase() || "?";
  return (
    <Card onPress={onPress} className="overflow-hidden">
      <View className="h-28 -mx-5 -mt-5 mb-3 bg-accent-soft items-center justify-center">
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} className="w-full h-full" />
        ) : (
          <Text className="text-[64px] leading-[64px] font-jakarta-extrabold text-accent opacity-30">{initial}</Text>
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
