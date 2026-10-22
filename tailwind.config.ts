import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        vault: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#10b981",
          700: "#047857",
          900: "#064e3b",
        },
        shield: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          800: "#1e293b",
          900: "#0f172a",
          950: "#020617",
        }
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      }
    },
  },
  plugins: [],
};
export default config;
