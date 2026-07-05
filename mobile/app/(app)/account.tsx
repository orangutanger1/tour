// mobile/app/(app)/account.tsx
import { useState } from "react";
import { View, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { usePro, manageSubscriptions } from "../../lib/purchases";
import { getGalleryStyle, setGalleryStyle, displayName, ensureUsername, type GalleryStyle } from "../../lib/profile";
import { Screen, Text, Button, Card, Icon, PressableScale } from "../../components/ui";

export default function Account() {
  const { user, signOut, deleteAccount } = useAuth();
  const { isPro } = usePro();
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const styleQ = useQuery({ queryKey: ["galleryStyle"], queryFn: () => getGalleryStyle(supabase) });
  const usernameQ = useQuery({
    queryKey: ["username"],
    queryFn: () => ensureUsername(supabase, user!),
    enabled: !!user,
  });

  async function onSignOut() {
    await signOut();
    qc.clear(); // cache now persists across launches — don't leak this account's data to the next
    router.replace("/");
  }

  async function choose(style: GalleryStyle) {
    await setGalleryStyle(supabase, style);
    qc.invalidateQueries({ queryKey: ["galleryStyle"] });
  }

  function onDelete() {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account, trips, and photos. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              qc.clear();
              router.replace("/");
            } catch (e) {
              setDeleting(false);
              Alert.alert("Couldn't delete account", e instanceof Error ? e.message : "try again");
            }
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <View className="flex-row items-center gap-3 mb-4">
        <Button title="Back" variant="ghost" size="sm" onPress={() => router.back()} />
        <Text variant="title">Account</Text>
      </View>
      <Card className="flex-row items-center gap-3">
        <Icon name="person" size={20} color="#6B5560" />
        <View className="flex-1 gap-0.5">
          <Text variant="heading" numberOfLines={1}>{displayName(user)}</Text>
          {usernameQ.data ? <Text variant="caption" className="text-accent">@{usernameQ.data}</Text> : null}
          {user?.email ? <Text variant="caption" numberOfLines={1}>{user.email}</Text> : null}
        </View>
      </Card>
      {Platform.OS === "ios" ? (
        <Card className="gap-3 mt-4">
          <View className="flex-row items-center justify-between">
            <Text variant="caption">Subscription</Text>
            <View className={`px-2.5 py-0.5 rounded-pill ${isPro ? "bg-accent" : "bg-surface-2"}`}>
              <Text variant="caption" className={isPro ? "text-white" : "text-ink-muted"}>{isPro ? "Beacon Pro" : "Free"}</Text>
            </View>
          </View>
          <PressableScale onPress={manageSubscriptions} className="flex-row items-center justify-between">
            <Text variant="label">{isPro ? "Manage subscription" : "Upgrade to Pro"}</Text>
            <Icon name="chevron-forward" size={16} color="#6B5560" />
          </PressableScale>
          <Text variant="caption" className="text-ink-muted">Switch, upgrade, or cancel anytime in the App Store.</Text>
        </Card>
      ) : null}
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
      <View className="pb-2 gap-2">
        <PressableScale onPress={onSignOut} className="flex-row items-center justify-center gap-2 h-14 rounded-pill bg-surface border border-border">
          <Icon name="log-out" size={18} color="#EF4444" />
          <Text variant="label" className="text-error">Sign out</Text>
        </PressableScale>
        <PressableScale onPress={onDelete} disabled={deleting} className="flex-row items-center justify-center gap-2 h-12">
          <Text variant="caption" className="text-ink-muted">{deleting ? "Deleting…" : "Delete account"}</Text>
        </PressableScale>
      </View>
    </Screen>
  );
}
