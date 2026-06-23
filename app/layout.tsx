import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OU7",
  description: "Leave & absence management — Interesting Times",
};

// Set the theme before first paint to avoid a flash (reads saved choice / OS preference).
const themeInit = `(function(){try{var t=localStorage.getItem('ou7-theme')||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
