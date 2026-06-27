// mobile/app/(auth)/sign-in.tsx
import { View, Text, Button, Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../../lib/auth";

export default function SignIn() {
  const { signInWithGoogle, signInWithApple } = useAuth();

  async function run(fn: () => Promise<void>) {
    try { await fn(); } catch (e) {
      // user-cancellation codes vary by provider; only alert on real failures
      const msg = e instanceof Error ? e.message : "sign-in failed";
      if (!/cancel/i.test(msg)) Alert.alert("Couldn't sign in", msg);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "600", textAlign: "center" }}>Tour</Text>
      <Button title="Continue with Google" onPress={() => run(signInWithGoogle)} />
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={8}
        style={{ height: 44 }}
        onPress={() => run(signInWithApple)}
      />
    </View>
  );
}
