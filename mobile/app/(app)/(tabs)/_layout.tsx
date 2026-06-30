// mobile/app/(app)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#E11D48",
        tabBarInactiveTintColor: "#6B5560",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Trips", tabBarIcon: icon("✈") }} />
      <Tabs.Screen name="passport" options={{ title: "Passport", tabBarIcon: icon("◍") }} />
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: icon("✦") }} />
    </Tabs>
  );
}
