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
      // Mercury type scale (§10): headings 24–28px semibold, body 14px,
      // small labels 12–13px, big figures 30–32px.
      fontSize: {
        display: ["28px", { lineHeight: "34px", fontWeight: "600", letterSpacing: "-0.01em" }],
        "page-title": ["28px", { lineHeight: "34px", fontWeight: "600", letterSpacing: "-0.01em" }],
        "section-title": ["15px", { lineHeight: "20px", fontWeight: "600", letterSpacing: "-0.01em" }],
        figure: ["32px", { lineHeight: "36px", fontWeight: "600", letterSpacing: "-0.01em" }],
        body: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        label: ["12px", { lineHeight: "16px", fontWeight: "500" }],
        "label-sm": ["13px", { lineHeight: "18px", fontWeight: "400" }],
      },
      transitionDuration: {
        150: "150ms",
        200: "200ms",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s ease-in-out infinite",
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
