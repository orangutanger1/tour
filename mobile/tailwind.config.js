/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: "#E11D48", soft: "#FFF1F3", pressed: "#BE123C", 2: "#FB7185" },
        bg: "#FFFBFC",
        surface: { DEFAULT: "#FFFFFF", 2: "#F7F4F5" },
        border: "#ECE7E9",
        ink: { DEFAULT: "#1A0E12", muted: "#6B5560", inverse: "#FFFFFF" },
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", xl: "24px", pill: "999px" },
      fontFamily: {
        jakarta: ["PlusJakartaSans_400Regular"],
        "jakarta-medium": ["PlusJakartaSans_500Medium"],
        "jakarta-semibold": ["PlusJakartaSans_600SemiBold"],
        "jakarta-bold": ["PlusJakartaSans_700Bold"],
        "jakarta-extrabold": ["PlusJakartaSans_800ExtraBold"],
      },
      boxShadow: {
        soft: "0px 2px 8px rgba(26,14,18,0.06)",
        card: "0px 4px 16px rgba(26,14,18,0.08)",
      },
    },
  },
  plugins: [],
};
