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
        tint: {
          scenic: "#DFF7F1", food: "#FFF1DC", history: "#E8EBFF", nightlife: "#F1E8FF",
          outdoors: "#E3F6E6", art: "#FFE8F2", shopping: "#E3F0FF",
        },
        tintfg: {
          scenic: "#0F766E", food: "#B45309", history: "#4338CA", nightlife: "#7C3AED",
          outdoors: "#15803D", art: "#BE185D", shopping: "#1D4ED8",
        },
      },
      borderRadius: { sm: "10px", md: "14px", lg: "20px", xl: "28px", pill: "999px" },
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
        float: "0px 8px 24px rgba(26,14,18,0.12)",
      },
    },
  },
  plugins: [],
};
