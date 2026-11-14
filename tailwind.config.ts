import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        page: "#F7F7F8",
        ink: "#111827",
        muted: "#6B7280",
        hairline: "#E5E7EB",
        primary: {
          DEFAULT: "#4F46E5",
          dark: "#4338CA",
          soft: "#EEF2FF",
        },
        "money-in": "#16A34A",
        "money-out": "#DC2626",
        amber: "#D97706",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
