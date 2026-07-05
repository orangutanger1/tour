// mobile/app/(auth)/email.tsx
// Passwordless email: enter address → 6-digit code from the email → verified.
// Same flow signs up new users (shouldCreateUser) and logs in existing ones.
import { useState } from "react";
import { View, Alert, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { resolvePostAuthRoute } from "../../lib/postAuth";
import { REVIEW_EMAIL } from "../../lib/review";
import { Screen, Text, Button, Input, Icon } from "../../components/ui";

export default function Email() {
  const { signInWithEmailOtp, verifyEmailOtp } = useAuth();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const verb = mode === "login" ? "Log in" : "Sign up";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());

  async function send() {
    setBusy(true);
    try {
      // App Store review account: no real inbox, so fetch a one-time code from
      // the review-login function and sign in without the code-entry step.
      if (email.trim().toLowerCase() === REVIEW_EMAIL) {
        const { data, error } = await supabase.functions.invoke<{ otp: string }>("review-login");
        if (error || !data?.otp) throw error ?? new Error("review sign-in unavailable");
        await verifyEmailOtp(REVIEW_EMAIL, data.otp);
        router.replace(await resolvePostAuthRoute(supabase));
        return;
      }
      await signInWithEmailOtp(email.trim());
      setPhase("code");
      setCode("");
    } catch (e) {
      Alert.alert("Couldn't send code", e instanceof Error ? e.message : "try again");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      await verifyEmailOtp(email.trim(), code.trim());
      router.replace(await resolvePostAuthRoute(supabase));
    } catch (e) {
      Alert.alert("Wrong code", e instanceof Error ? e.message : "check the code and try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <View className="flex-row items-center gap-4 mb-2">
          <Pressable onPress={() => (phase === "code" ? setPhase("email") : router.back())} hitSlop={8} className="w-10 h-10 rounded-pill bg-surface-2 items-center justify-center">
            <Icon name="chevron-back" size={18} />
          </Pressable>
        </View>

        <View className="flex-1 justify-center gap-5">
          {phase === "email" ? (
            <>
              <View className="gap-1">
                <Text variant="display">{verb} with email</Text>
                <Text variant="body" className="text-ink-muted">We'll email you a 6-digit code. No password needed.</Text>
              </View>
              <Input
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoFocus
              />
            </>
          ) : (
            <>
              <View className="gap-1">
                <Text variant="display">Check your email</Text>
                <Text variant="body" className="text-ink-muted">Enter the 6-digit code we sent to {email.trim()}.</Text>
              </View>
              <Input
                placeholder="123456"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
                keyboardType="number-pad"
                autoFocus
                className="text-center text-[24px] tracking-[8px]"
              />
              <Pressable onPress={send} disabled={busy} hitSlop={8}>
                <Text variant="label" className="text-center text-accent">Resend code</Text>
              </Pressable>
            </>
          )}
        </View>

        <View className="pb-2">
          {phase === "email" ? (
            <Button title="Send code" size="lg" disabled={!emailOk} loading={busy} onPress={send} />
          ) : (
            <Button title="Verify" size="lg" disabled={code.length !== 6} loading={busy} onPress={verify} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
