// mobile/components/ui/Input.tsx
import { TextInput, type TextInputProps } from "react-native";

export function Input({ className, ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      placeholderTextColor="#6B5560"
      className={`h-14 px-5 rounded-lg bg-surface border border-border text-ink font-jakarta-medium text-[16px] ${className ?? ""}`}
      {...props}
    />
  );
}
