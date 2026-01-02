import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
      },
      colors: {
        ink: {
          50: "#f7f4ef",
          100: "#ece6dc",
          200: "#d7cdbf",
          300: "#b9aa93",
          400: "#967f66",
          500: "#7e6a55",
          600: "#5f5142",
          700: "#463d34",
          800: "#2e2a24",
          900: "#1f1c18",
        },
        tide: {
          50: "#eaf4f2",
          100: "#d2e9e4",
          200: "#add7cf",
          300: "#7cc0b7",
          400: "#4ea59c",
          500: "#2f8a80",
          600: "#1f6d64",
          700: "#16524b",
          800: "#0f3632",
          900: "#0a2421",
        },
      },
      boxShadow: {
        card: "0 20px 60px -40px rgba(17, 12, 4, 0.45)",
        inset: "inset 0 0 0 1px rgba(48, 42, 36, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
