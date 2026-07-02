// mobile/app/(auth)/welcome.tsx
// First screen for signed-out users. Sign-up and log-in run the same auth flows —
// the toggle only changes copy; postAuth routing decides who sees onboarding.
import { useState, type ReactNode } from "react";
import { View, Image, Alert, ActivityIndicator, Platform, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { resolvePostAuthRoute } from "../../lib/postAuth";
import { Screen, Text, Icon, PressableScale, SUNSET } from "../../components/ui";

type Mode = "signup" | "login";

export default function Welcome() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [busy, setBusy] = useState(false);
  const verb = mode === "signup" ? "Sign up" : "Log in";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.replace(await resolvePostAuthRoute(supabase));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sign-in failed";
      if (!/cancel/i.test(msg)) Alert.alert(`Couldn't ${verb.toLowerCase()}`, msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen decor>
      <View className="flex-1 justify-center items-center gap-3">
        <LinearGradient colors={SUNSET} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
          <Text variant="title" className="text-ink-inverse">T</Text>
        </LinearGradient>
        <Text variant="display" className="text-center">
          {mode === "signup" ? "Trips that feel local." : "Welcome back"}
        </Text>
        <Text variant="body" className="text-center text-ink-muted">
          {mode === "signup"
            ? "Tell us your vibe and we'll plan every day — sights, food, and routes."
            : "Log in to see your trips and pick up anywhere."}
        </Text>
      </View>

      <View className="gap-3 pb-2">
        {Platform.OS === "ios" ? (
          <ProviderButton
            dark
            disabled={busy}
            icon={<Icon name="logo-apple" size={20} color="#FFFFFF" />}
            label={`${verb} with Apple`}
            onPress={() => run(signInWithApple)}
          />
        ) : null}
        <ProviderButton
          disabled={busy}
          icon={<Image source={require("../../assets/images/google-g.png")} style={{ width: 20, height: 20 }} />}
          label={`${verb} with Google`}
          onPress={() => run(signInWithGoogle)}
        />
        <ProviderButton
          disabled={busy}
          icon={<Icon name="mail" size={20} color="#1A0E12" />}
          label={`${verb} with email`}
          onPress={() => router.push({ pathname: "/(auth)/email", params: { mode } })}
        />
        {busy ? <ActivityIndicator color="#E11D48" /> : null}
        <Pressable onPress={() => setMode((m) => (m === "signup" ? "login" : "signup"))} hitSlop={8} className="py-2">
          <Text variant="label" className="text-center text-ink-muted">
            {mode === "signup" ? (
              <>Already have an account? <Text variant="label" className="text-accent">Log in</Text></>
            ) : (
              <>New here? <Text variant="label" className="text-accent">Sign up</Text></>
            )}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// One button style for every provider so the typography can't drift (the native
// Apple button used its own font metrics and never matched the Google row).
function ProviderButton({ icon, label, onPress, disabled, dark }: {
  icon: ReactNode; label: string; onPress: () => void; disabled?: boolean; dark?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      className={`h-[52px] flex-row items-center justify-center gap-3 rounded-pill ${dark ? "bg-[#101014]" : "bg-surface border border-border active:bg-surface-2"} ${disabled ? "opacity-60" : ""}`}
    >
      {icon}
      <Text variant="label" className={`text-[15px] ${dark ? "text-ink-inverse" : "text-ink"}`}>{label}</Text>
    </PressableScale>
  );
}
