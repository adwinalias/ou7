"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: Route; label: string; show?: (p: NavPerms) => boolean };

type NavPerms = { canSeeApprovals: boolean; canSeeAdmin: boolean };

const items: Item[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/wall-chart", label: "Wall chart" },
  { href: "/my-leave", label: "My leave" },
  { href: "/request", label: "Request" },
  { href: "/approvals", label: "Approvals", show: (p) => p.canSeeApprovals },
  { href: "/admin", label: "Admin", show: (p) => p.canSeeAdmin },
];

// Role-aware navigation (Epic 1.5): Approvals shows for approvers/HR, Admin for HR only.
export default function AppNav(perms: NavPerms) {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", flexDirection: "column" }}>
      {items
        .filter((it) => !it.show || it.show(perms))
        .map((it) => {
        const active = pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            style={{
              padding: "10px 12px",
              textDecoration: "none",
              fontWeight: active ? 600 : 400,
              color: active ? "var(--text)" : "var(--text-muted)",
              borderLeft: `3px solid ${active ? "var(--accent)" : "transparent"}`,
              background: active ? "var(--accent-quiet)" : "transparent",
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
