// mobile/app.config.ts
// Dynamic config: extends the static app.json base with native auth config + env-backed `extra`.
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // GoogleSignin needs the reversed iOS client ID registered as an Info.plist
  // URL scheme. Derive it from the same client ID in .env (one source of truth):
  // `<id>.apps.googleusercontent.com` -> `com.googleusercontent.apps.<id>`.
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
  const googleIosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(
    /\.apps\.googleusercontent\.com$/,
    "",
  )}`;

  return {
  ...config,
  name: "Tour",
  slug: "tour",
  scheme: "tour",
  ios: {
    ...config.ios,
    bundleIdentifier: "com.tour.local",
    usesAppleSignIn: true,
    supportsTablet: true,
  },
  plugins: [
    ...(config.plugins ?? []),
    "expo-apple-authentication",
    ["@react-native-google-signin/google-signin", { iosUrlScheme: googleIosUrlScheme }],
    // GoogleSignin v16 pulls AppCheckCore (Swift pod), which depends on
    // GoogleUtilities + RecaptchaInterop — non-modular pods that can't be
    // statically linked into a Swift pod without module maps. Mark them
    // modular so `pod install` succeeds on EAS prebuild.
    [
      "expo-build-properties",
      {
        ios: {
          extraPods: [
            { name: "GoogleUtilities", modular_headers: true },
            { name: "RecaptchaInterop", modular_headers: true },
          ],
        },
      },
    ],
  ],
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
  };
};
