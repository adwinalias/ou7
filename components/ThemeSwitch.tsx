"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeSwitch() {
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

  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      <button className={theme === "light" ? "active" : ""} onClick={() => apply("light")}>
        Light
      </button>
      <button className={theme === "dark" ? "active" : ""} onClick={() => apply("dark")}>
        Dark
      </button>
    </div>
  );
}
