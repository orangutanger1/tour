// mobile/components/ui/Text.tsx
import { Text as RNText, type TextProps } from "react-native";

type Variant = "display" | "title" | "heading" | "body" | "caption" | "label";

const VARIANTS: Record<Variant, string> = {
  display: "text-[36px] leading-[42px] font-jakarta-extrabold text-ink tracking-[-0.5px]",
  title: "text-[28px] leading-[34px] font-jakarta-bold text-ink tracking-[-0.3px]",
  heading: "text-[20px] leading-[26px] font-jakarta-bold text-ink",
  body: "text-[16px] leading-[22px] font-jakarta-medium text-ink",
  caption: "text-[14px] leading-[20px] font-jakarta-medium text-ink-muted",
  label: "text-[13px] leading-[18px] font-jakarta-semibold text-ink",
};

export function Text({ variant = "body", className, ...props }: TextProps & { variant?: Variant; className?: string }) {
  return <RNText className={`${VARIANTS[variant]} ${className ?? ""}`} {...props} />;
}
