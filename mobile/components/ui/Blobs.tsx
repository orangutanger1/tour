// mobile/components/ui/Blobs.tsx
// Static organic decor for hero areas. pointerEvents="none": pure background.
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BLOB_ROSE, BLOB_AMBER } from "./gradients";

export function Blobs() {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <LinearGradient
        colors={BLOB_ROSE}
        style={{ position: "absolute", top: -80, right: -70, width: 260, height: 260, borderRadius: 999, opacity: 0.55, transform: [{ rotate: "18deg" }] }}
      />
      <LinearGradient
        colors={BLOB_AMBER}
        style={{ position: "absolute", bottom: 40, left: -90, width: 300, height: 300, borderRadius: 999, opacity: 0.5 }}
      />
    </View>
  );
}
