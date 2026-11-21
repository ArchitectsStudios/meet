"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Calendar", match: (p: string) => p === "/" || p.startsWith("/meetings") },
  { href: "/team", label: "Team", match: (p: string) => p.startsWith("/team") },
  { href: "/settings", label: "Availability & settings", match: (p: string) => p.startsWith("/settings") },
];

/** Main sections. On phones they sit in their own scrollable row under the header bar. */
export function NavLinks({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
              active ? "bg-panel-2 text-text" : "text-muted hover:text-text"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
