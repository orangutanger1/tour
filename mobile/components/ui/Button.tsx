// mobile/components/ui/Button.tsx
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { PressableScale } from "./PressableScale";
import { Text } from "./Text";
import { SUNSET } from "./gradients";

type Variant = "primary" | "secondary" | "ghost" | "gradient";
type Size = "sm" | "md" | "lg";

const BASE = "flex-row items-center justify-center rounded-pill";
const SIZES: Record<Size, string> = { sm: "h-10 px-4", md: "h-12 px-5", lg: "h-14 px-6" };
const BG: Record<Variant, string> = {
  primary: "bg-accent",
  secondary: "bg-surface border border-border",
  ghost: "bg-transparent",
  gradient: "shadow-float",
};
const FG: Record<Variant, string> = {
  primary: "text-ink-inverse", secondary: "text-ink", ghost: "text-accent", gradient: "text-ink-inverse",
};

export function Button({ title, onPress, variant = "primary", size = "md", disabled, loading, leftIcon, className }: {
  title: string; onPress?: () => void; variant?: Variant; size?: Size; disabled?: boolean; loading?: boolean; leftIcon?: ReactNode; className?: string;
}) {
  const off = disabled || loading;
  return (
    <PressableScale onPress={onPress} disabled={off} className={`${BASE} ${SIZES[size]} ${BG[variant]} ${off ? "opacity-50" : ""} ${className ?? ""}`}>
      {variant === "gradient" ? (
        <LinearGradient
          colors={SUNSET}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderRadius: 999 }}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={variant === "secondary" || variant === "ghost" ? "#E11D48" : "#FFFFFF"} />
      ) : (
        <View className="flex-row items-center gap-2">
          {leftIcon}
          <Text variant="label" className={`${FG[variant]} text-[15px]`}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}
