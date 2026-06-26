import "./globals.css";
import type { Metadata, Viewport } from "next";
import WebVitals from "@/components/WebVitals";

export const metadata: Metadata = {
  title: "OU7",
  description: "Leave & absence management — Interesting Times",
};

// Explicit viewport (Epic 25.5). Matches Next.js's default (device-width, initial-scale 1)
// so there is no visual change — it just makes the responsive contract explicit alongside
// the mobile fixes in Epic 25, rather than relying on the framework default.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Set the theme before first paint to avoid a flash (reads saved choice / OS preference).
const themeInit = `(function(){try{var t=localStorage.getItem('ou7-theme')||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        {/* CWV reporter (Epic 21.4) — dev-only console.debug, never transmits off-device. */}
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
