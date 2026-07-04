// mobile/app/_layout.tsx
import "../global.css";
import { Slot } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider } from "../lib/auth";
import { TripFlowProvider } from "../lib/tripFlow";
import { configurePurchases } from "../lib/purchases";

// staleTime keeps remounts (e.g. tab back to Passport) from refetching everything.
// Mutations that change data invalidate their keys explicitly.
// The cache persists to AsyncStorage so a relaunch renders the last-known
// photos/trips/URLs immediately (stale queries still refetch in the background);
// gcTime must outlive the persistence window or restored queries get dropped.
const PERSIST_MS = 7 * 24 * 3600 * 1000;
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, gcTime: PERSIST_MS } },
});
const persister = createAsyncStoragePersister({ storage: AsyncStorage });
configurePurchases();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: PERSIST_MS }}>
          <AuthProvider>
            <TripFlowProvider>
              <Slot />
            </TripFlowProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
