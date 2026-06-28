// mobile/components/ui/Text.tsx
import { Text as RNText, type TextProps } from "react-native";

type Variant = "display" | "title" | "heading" | "body" | "caption" | "label";

const VARIANTS: Record<Variant, string> = {
  display: "text-[32px] leading-[38px] font-jakarta-extrabold text-ink",
  title: "text-[24px] leading-[30px] font-jakarta-bold text-ink",
  heading: "text-[18px] leading-[24px] font-jakarta-bold text-ink",
  body: "text-[16px] leading-[22px] font-jakarta-medium text-ink",
  caption: "text-[14px] leading-[20px] font-jakarta-medium text-ink-muted",
  label: "text-[13px] leading-[18px] font-jakarta-semibold text-ink",
};

export function Text({ variant = "body", className, ...props }: TextProps & { variant?: Variant; className?: string }) {
  return <RNText className={`${VARIANTS[variant]} ${className ?? ""}`} {...props} />;
}
