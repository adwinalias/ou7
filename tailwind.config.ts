import type { Config } from "tailwindcss";

/**
 * Tailwind is wired to the design tokens in `design/tokens.css`.
 * Utilities like `bg-surface` / `text-muted` resolve to CSS variables,
 * so a single `data-theme` swap re-themes everything. Never hard-code hex.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        paper: "var(--paper)",
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        subtle: "var(--text-subtle)",
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: "var(--font-ui)",
        mono: "var(--font-mono)",
        editorial: "var(--font-editorial)",
      },
      borderRadius: {
        none: "var(--radius-0)",
        sm: "var(--radius-sm)",
        pill: "var(--radius-pill)",
      },
    },
  },
  plugins: [],
};

export default config;
