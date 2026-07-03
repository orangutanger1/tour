// mobile/app/(app)/account.tsx
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { getGalleryStyle, setGalleryStyle, type GalleryStyle } from "../../lib/profile";
import { Screen, Text, Button, Card, Icon, PressableScale } from "../../components/ui";

export default function Account() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const styleQ = useQuery({ queryKey: ["galleryStyle"], queryFn: () => getGalleryStyle(supabase) });

  async function onSignOut() {
    await signOut();
    qc.clear(); // cache now persists across launches — don't leak this account's data to the next
    router.replace("/");
  }

  async function choose(style: GalleryStyle) {
    await setGalleryStyle(supabase, style);
    qc.invalidateQueries({ queryKey: ["galleryStyle"] });
  }

  return (
    <Screen>
      <View className="flex-row items-center gap-3 mb-4">
        <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <Text variant="title">Account</Text>
      </View>
      <Card className="flex-row items-center gap-3">
        <Icon name="person" size={20} color="#6B5560" />
        <View className="flex-1 gap-1">
          <Text variant="caption">Signed in as</Text>
          <Text variant="heading">{user?.email ?? user?.id ?? "—"}</Text>
        </View>
      </Card>
      <Card className="gap-2 mt-4">
        <Text variant="caption">Passport gallery style</Text>
        <View className="flex-row gap-2">
          {(["polaroid", "clean"] as GalleryStyle[]).map((s) => {
            const active = (styleQ.data ?? "polaroid") === s;
            return (
              <PressableScale key={s} onPress={() => choose(s)}
                className={`px-4 py-2 rounded-pill ${active ? "bg-accent" : "bg-surface"}`}>
                <Text className={active ? "text-white" : "text-ink"}>{s === "polaroid" ? "Polaroid" : "Clean"}</Text>
              </PressableScale>
            );
          })}
        </View>
      </Card>
      <View className="flex-1" />
      <View className="pb-2">
        <PressableScale onPress={onSignOut} className="flex-row items-center justify-center gap-2 h-14 rounded-pill bg-surface border border-border">
          <Icon name="log-out" size={18} color="#EF4444" />
          <Text variant="label" className="text-error">Sign out</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}
