// mobile/components/AnimatedSplash.tsx
// Plays over the app on cold launch: the logo holds, then the whole overlay
// fades to reveal the app. The logo is the SAME 180px as the native
// (expo-splash-screen) image so the native→JS handoff has no size pop.
// Uses react-native's Image (not expo-image): expo-image decodes the asset
// asynchronously and fades it in, which flashed a blank frame over the native
// splash on cold launch. RN Image renders the bundled PNG synchronously from
// the asset registry with fadeDuration 0 — no flicker.
import { useEffect } from "react";
import { Image } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, runOnJS,
} from "react-native-reanimated";

// Match app.json expo-splash-screen imageWidth so the native logo and this one
// are pixel-identical across the handoff.
const LOGO_SIZE = 180;

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Hide the native splash only once this overlay has actually painted a
    // frame (two rAF ticks after mount), so there's no gap where the native
    // splash is gone but this overlay hasn't drawn yet.
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        SplashScreen.hideAsync();
      });
    });

    opacity.value = withDelay(
      650,
      withTiming(0, { duration: 400 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
        containerStyle,
      ]}
    >
      <Image source={require("../assets/images/logo.png")} style={{ width: LOGO_SIZE, height: LOGO_SIZE, resizeMode: "contain" }} fadeDuration={0} />
    </Animated.View>
  );
}
