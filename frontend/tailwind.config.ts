import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0d0d14",
        card: "#13131f",
        border: "#1e1e30",
        accent: "#7c3aed",
        success: "#10b981",
        danger: "#ef4444",
        warn: "#f59e0b",
        muted: "#6b7280",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
