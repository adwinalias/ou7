"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeSwitch() {
  // The pre-paint script in app/layout.tsx has already set data-theme on <html>
  // (saved choice else OS preference). On mount we read it back so the icon matches.
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as Theme) || "light";
    setTheme(current);
  }, []);

  function apply(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ou7-theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  const next: Theme = theme === "light" ? "dark" : "light";
  // The icon shows the CURRENT mode (sun = light, moon = dark); the label states the action.
  const label = `Switch to ${next} theme`;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => apply(next)}
      aria-label={label}
      title={label}
    >
      {theme === "light" ? (
        // Sun — current mode is light
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="12" cy="12" r="4.5" />
          <line x1="12" y1="2.5" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="21.5" />
          <line x1="2.5" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="21.5" y2="12" />
          <line x1="5.4" y1="5.4" x2="7.1" y2="7.1" />
          <line x1="16.9" y1="16.9" x2="18.6" y2="18.6" />
          <line x1="5.4" y1="18.6" x2="7.1" y2="16.9" />
          <line x1="16.9" y1="7.1" x2="18.6" y2="5.4" />
        </svg>
      ) : (
        // Moon — current mode is dark
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" />
        </svg>
      )}
    </button>
  );
}
