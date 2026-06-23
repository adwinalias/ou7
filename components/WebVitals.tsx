"use client";

// Core Web Vitals reporter (Epic 21.4). Mounted once in the root layout so CWV
// (LCP, INP/FID, CLS, FCP, TTFB) are observable in-app while developing and during
// an Unlighthouse / Web-Vitals-extension pass before go-live.
//
// GUARDRAIL (standalone, ADR-0003 / no external runtime deps): this NEVER sends data
// anywhere — no network call, no analytics SDK, no external service. In development it
// logs to console.debug so the numbers are visible in the browser console; in production
// it is a no-op. If a metrics sink is ever wanted it must be an explicit, reviewed decision
// (and a first-party endpoint), not bolted on here.
import { useReportWebVitals } from "next/web-vitals";

export default function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") {
      // dev-only: name, value, rating (good/needs-improvement/poor), id.
      // eslint-disable-next-line no-console
      console.debug("[web-vitals]", metric.name, Math.round(metric.value), metric.rating ?? "", metric.id);
    }
    // production: intentionally no-op — do not transmit metrics off-device.
  });

  return null;
}
