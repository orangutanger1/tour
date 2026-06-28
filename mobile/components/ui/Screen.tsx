// mobile/components/ui/Screen.tsx
import type { ReactNode } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children, scroll, className }: { children: ReactNode; scroll?: boolean; className?: string }) {
  if (scroll) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
        <ScrollView className="flex-1" contentContainerClassName={`px-6 py-4 gap-4 ${className ?? ""}`} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View className={`flex-1 px-6 py-4 ${className ?? ""}`}>{children}</View>
    </SafeAreaView>
  );
}
