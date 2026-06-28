// mobile/components/ui/Button.tsx
import type { ReactNode } from "react";
import { Pressable, ActivityIndicator, View } from "react-native";
import { Text } from "./Text";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const BASE = "flex-row items-center justify-center rounded-pill";
const SIZES: Record<Size, string> = { sm: "h-10 px-4", md: "h-12 px-5", lg: "h-14 px-6" };
const BG: Record<Variant, string> = {
  primary: "bg-accent active:bg-accent-pressed",
  secondary: "bg-surface border border-border active:bg-surface-2",
  ghost: "bg-transparent active:bg-surface-2",
};
const FG: Record<Variant, string> = { primary: "text-ink-inverse", secondary: "text-ink", ghost: "text-accent" };

export function Button({ title, onPress, variant = "primary", size = "md", disabled, loading, leftIcon, className }: {
  title: string; onPress?: () => void; variant?: Variant; size?: Size; disabled?: boolean; loading?: boolean; leftIcon?: ReactNode; className?: string;
}) {
  const off = disabled || loading;
  return (
    <Pressable onPress={onPress} disabled={off} className={`${BASE} ${SIZES[size]} ${BG[variant]} ${off ? "opacity-50" : ""} ${className ?? ""}`}>
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#FFFFFF" : "#E11D48"} />
      ) : (
        <View className="flex-row items-center gap-2">
          {leftIcon}
          <Text variant="label" className={`${FG[variant]} text-[15px]`}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
