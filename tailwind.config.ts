import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        concrete: "#D9DDE3",
        paper: "#FFFEF9",
        ink: "#15202B",
        stamp: "#1E4D8C",
        copper: "#B45A2A",
        line: "#C5CAD1",
        muted: "#3E4C59",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "serif"],
      },
      maxWidth: {
        page: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
