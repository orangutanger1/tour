// mobile/app.config.ts
// Dynamic config: extends the static app.json base with native auth config + env-backed `extra`.
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  // Reversed iOS OAuth client ID, registered as an Info.plist URL scheme for
  // native Google sign-in. Hardcoded (not env-derived) because EAS prebuild
  // runs without our gitignored .env, so a derived scheme bakes empty and
  // breaks sign-in at runtime. This value is public (it ships in every app
  // binary) and static — like `bundleIdentifier` above.
  // ponytail: keep in sync with EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID; only changes
  // if the OAuth client is rotated.
  const googleIosUrlScheme =
    "com.googleusercontent.apps.210065939299-rrtu8qv5kdiv4qe17608kq68p4a65t2n";

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
    "expo-maps",
  ],
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    revenuecatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  },
  };
};
