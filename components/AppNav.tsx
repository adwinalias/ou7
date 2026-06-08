"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/wall-chart", label: "Wall chart" },
  { href: "/my-leave", label: "My leave" },
  { href: "/request", label: "Request" },
  { href: "/approvals", label: "Approvals" },
  { href: "/admin", label: "Admin" },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", flexDirection: "column" }}>
      {items.map((it) => {
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
