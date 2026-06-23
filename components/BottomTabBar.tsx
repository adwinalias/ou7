"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

type TabPerms = { canSeeApprovals: boolean; canSeeAdmin: boolean };

type Tab = { href: Route; label: string };

// v2 labels (17.1) — routes stay /dashboard and /wall-chart (rename is 17.5).
const primaryTabs: Tab[] = [
  { href: "/dashboard", label: "My Dashboard" },
  { href: "/wall-chart", label: "Team Calendar" },
  { href: "/my-leave", label: "My leave" },
  { href: "/request", label: "Request" },
];

const moreTabs: { href: Route; label: string; key: keyof TabPerms }[] = [
  { href: "/approvals", label: "Approvals", key: "canSeeApprovals" },
  { href: "/admin", label: "Admin", key: "canSeeAdmin" },
];

// Mobile-only bottom tab bar (Epic 17.1). Hidden ≥641px and in print via CSS.
// Perms are computed server-side and arrive via props (never recomputed here).
export default function BottomTabBar(perms: TabPerms) {
  const pathname = usePathname();
  const more = moreTabs.filter((t) => perms[t.key]);
  const moreActive = more.some((t) => pathname.startsWith(t.href));

  return (
    <nav className="bottom-tabs no-print" aria-label="Primary">
      {primaryTabs.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className="bottom-tab"
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
      {more.length > 0 && (
        <details className="bottom-tab-more">
          <summary
            className="bottom-tab"
            aria-current={moreActive ? "page" : undefined}
            data-active={moreActive ? "true" : undefined}
          >
            More
          </summary>
          <div className="bottom-tab-more-menu">
            {more.map((t) => {
              const active = pathname.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className="bottom-tab-more-item"
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : undefined}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </details>
      )}
    </nav>
  );
}
