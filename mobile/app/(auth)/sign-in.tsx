// mobile/app/(auth)/sign-in.tsx
import { View, Image, Pressable, Alert, ActivityIndicator } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { useTripFlow } from "../../lib/tripFlow";
import { upsertProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";
import { Screen, Text } from "../../components/ui";

export default function SignIn() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const { pendingRequest, generate } = useTripFlow();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      if (pendingRequest) {
        try { await upsertProfile(supabase, pendingRequest.prefs); } catch { /* best-effort */ }
        generate(pendingRequest);
        router.replace("/generating");
      } else {
        router.replace("/");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sign-in failed";
      if (!/cancel/i.test(msg)) Alert.alert("Couldn't sign in", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="flex-1 justify-center items-center gap-3">
        <View className="w-16 h-16 rounded-xl bg-accent items-center justify-center">
          <Text variant="title" className="text-ink-inverse">T</Text>
        </View>
        <Text variant="display" className="text-center">{pendingRequest ? "Almost there" : "Welcome back"}</Text>
        <Text variant="body" className="text-center text-ink-muted">
          {pendingRequest ? "Sign in to save your trip and pick up anywhere." : "Sign in to see your trips and pick up anywhere."}
        </Text>
      </View>

      <View className="gap-3 pb-2">
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={999}
          style={{ height: 52 }}
          onPress={() => run(signInWithApple)}
        />
        <Pressable
          onPress={() => run(signInWithGoogle)}
          disabled={busy}
          className="h-[52px] flex-row items-center justify-center gap-3 rounded-pill bg-surface border border-border active:bg-surface-2"
        >
          <Image source={require("../../assets/images/google-g.png")} style={{ width: 20, height: 20 }} />
          <Text variant="label" className="text-ink text-[15px]">Continue with Google</Text>
        </Pressable>
        {busy ? <ActivityIndicator color="#E11D48" /> : null}
      </View>
    </Screen>
  );
}
