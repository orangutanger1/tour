// mobile/components/AnimatedSplash.tsx
// Plays over the app on cold launch: the logo scales in, holds, then the whole
// overlay fades to reveal the app. Sits on the same white as the native
// (expo-splash-screen) logo so the native→JS handoff is seamless.
import { useEffect } from "react";
import { Image } from "expo-image";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, runOnJS, Easing,
} from "react-native-reanimated";

export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.4)) }),
      withDelay(350, withTiming(1.08, { duration: 400, easing: Easing.in(Easing.ease) })),
    );
    opacity.value = withDelay(
      950,
      withTiming(0, { duration: 400 }, (finished) => {
        if (finished) runOnJS(onFinish)();
      }),
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
        containerStyle,
      ]}
    >
      <Animated.View style={logoStyle}>
        <Image source={require("../assets/images/logo.png")} style={{ width: 140, height: 140 }} contentFit="contain" />
      </Animated.View>
    </Animated.View>
  );
}
