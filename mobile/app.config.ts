// mobile/app.config.ts
// Dynamic config: extends the static app.json base with native auth config + env-backed `extra`.
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
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
  plugins: [...(config.plugins ?? []), "expo-apple-authentication"],
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  },
});
