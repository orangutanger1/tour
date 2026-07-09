// mobile/app/_layout.tsx
import "../global.css";
import { useEffect, useState } from "react";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
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
import { AnimatedSplash } from "../components/AnimatedSplash";

// Hold the native splash until fonts are ready; the JS AnimatedSplash then takes
// over for the reveal animation.
SplashScreen.preventAutoHideAsync();

// staleTime keeps remounts (e.g. tab back to Passport) from refetching everything.
// Mutations that change data invalidate their keys explicitly.
// The cache persists to AsyncStorage so a relaunch renders the last-known
// photos/trips/URLs immediately (stale queries still refetch in the background);
// gcTime must outlive the persistence window or restored queries get dropped.
const PERSIST_MS = 7 * 24 * 3600 * 1000;
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60_000,
			refetchOnWindowFocus: false,
			gcTime: PERSIST_MS,
		},
	},
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
	const [splashDone, setSplashDone] = useState(false);
	const [jsSplashReady, setJsSplashReady] = useState(false);

	// Render the JS splash BEFORE hiding the native splash so the handoff has
	// zero flicker: the native splash hides WHILE the JS splash is already
	// painted on top of the app content.
	useEffect(() => {
		if (fontsLoaded) setJsSplashReady(true);
	}, [fontsLoaded]);

	useEffect(() => {
		// Hide the native splash only after the JS splash has had a chance to mount.
		// jsSplashReady flips in the same tick as the render that adds AnimatedSplash,
		// so batch it behind a microtask so the component actually paints first.
		if (jsSplashReady) {
			const id = setTimeout(() => SplashScreen.hideAsync(), 0);
			return () => clearTimeout(id);
		}
	}, [jsSplashReady]);

	if (!fontsLoaded) return null;

	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<SafeAreaProvider>
				<PersistQueryClientProvider
					client={queryClient}
					persistOptions={{ persister, maxAge: PERSIST_MS }}
				>
					<AuthProvider>
						<TripFlowProvider>
							<Slot />
						</TripFlowProvider>
					</AuthProvider>
				</PersistQueryClientProvider>
			</SafeAreaProvider>
			{jsSplashReady && !splashDone ? (
				<AnimatedSplash onFinish={() => setSplashDone(true)} />
			) : null}
		</GestureHandlerRootView>
	);
}
