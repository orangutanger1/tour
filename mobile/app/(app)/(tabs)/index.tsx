// mobile/app/(app)/(tabs)/index.tsx
import { View, Pressable, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { listTrips, type TripSummary } from "../../../lib/trips";
import { listPhotos, signedUrls, groupByAlbum, coverPhoto } from "../../../lib/photos";
import { Screen, Text, Button, TripCard, EmptyState, Loading } from "../../../components/ui";

export default function Trips() {
  const { user, session } = useAuth();
  const router = useRouter();
  const initial = (user?.email ?? "?").charAt(0).toUpperCase();

  const { data: trips, isLoading, isError, refetch } = useQuery({
    queryKey: ["trips"],
    queryFn: () => listTrips(supabase),
    enabled: !!session,
  });

  const photosQ = useQuery({ queryKey: ["photos"], queryFn: () => listPhotos(supabase), enabled: !!session });
  const covers = groupByAlbum(photosQ.data ?? [])
    .map((a) => coverPhoto(a.photos))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const coverUrlsQ = useQuery({
    queryKey: ["coverUrls", covers.map((c) => c.storagePath)],
    queryFn: () => signedUrls(supabase, covers.map((c) => c.storagePath)),
    enabled: covers.length > 0,
  });
  const coverFor = (tripId: string) => {
    const cover = covers.find((c) => c.tripId === tripId);
    return cover ? coverUrlsQ.data?.[cover.storagePath] : undefined;
  };

  if (!session) {
    return (
      <Screen decor>
        <View className="flex-1 justify-center gap-3">
          <Text variant="display">Trips that feel local.</Text>
          <Text variant="body" className="text-ink-muted">
            Tell us your vibe and we'll plan every day — sights, food, and routes.
          </Text>
        </View>
        <View className="pb-24 gap-3">
          <Button title="Plan a trip" size="lg" variant="gradient" onPress={() => router.push("/onboarding")} />
          <Button title="Sign in" variant="ghost" onPress={() => router.push("/(auth)/sign-in")} />
        </View>
      </Screen>
    );
  }

  function Header() {
    return (
      <View className="flex-row items-center justify-between mb-4">
        <Text variant="display">Your trips</Text>
        {session ? (
          <Pressable
            onPress={() => router.push("/account")}
            className="w-10 h-10 rounded-pill bg-accent-soft items-center justify-center"
          >
            <Text variant="label" className="text-accent">{initial}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (isLoading) {
    return <Screen><Loading label="Loading your trips…" /></Screen>;
  }

  if (isError) {
    return (
      <Screen>
        <Header />
        <EmptyState
          title="Couldn't load your trips"
          subtitle="Check your connection and try again."
          action={<Button title="Retry" onPress={() => refetch()} />}
        />
      </Screen>
    );
  }

  if (!trips || trips.length === 0) {
    return (
      <Screen decor>
        <Header />
        <View className="flex-1 justify-center gap-3">
          <Text variant="display">Where to next?</Text>
          <Text variant="body" className="text-ink-muted">
            Tell us your vibe and we'll plan a local-feel trip, day by day.
          </Text>
        </View>
        <View className="pb-24">
          <Button title="Plan a trip" size="lg" variant="gradient" onPress={() => router.push("/onboarding")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <FlatList
        data={trips}
        keyExtractor={(t: TripSummary) => t.id}
        contentContainerClassName="gap-3 pb-32"
        renderItem={({ item }) => (
          <TripCard trip={item} coverUrl={coverFor(item.id)} onPress={() => router.push({ pathname: "/itinerary", params: { tripId: item.id } })} />
        )}
      />
      <View className="absolute left-6 right-6 bottom-28">
        <Button title="Plan a trip" size="lg" variant="gradient" onPress={() => router.push("/onboarding")} />
      </View>
    </Screen>
  );
}
