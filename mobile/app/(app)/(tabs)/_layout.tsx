// mobile/app/(app)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#E11D48",
        tabBarInactiveTintColor: "#6B5560",
        tabBarStyle: {
          position: "absolute",
          left: 16, right: 16, bottom: 24,
          height: 64, borderRadius: 999,
          backgroundColor: "#FFFFFF", borderTopWidth: 0,
          paddingTop: 6, paddingBottom: 10,
          shadowColor: "#1A0E12", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 },
          elevation: 8,
        },
        tabBarLabelStyle: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Trips", tabBarIcon: ({ color }) => <Ionicons name="airplane" size={22} color={color} /> }} />
      <Tabs.Screen name="passport" options={{ title: "Passport", tabBarIcon: ({ color }) => <Ionicons name="book" size={22} color={color} /> }} />
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: ({ color }) => <Ionicons name="compass" size={22} color={color} /> }} />
    </Tabs>
  );
}
