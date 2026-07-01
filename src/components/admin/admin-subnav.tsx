"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { findActiveSection, isItemActive } from "@/lib/admin/nav";

export function AdminSubnav() {
  const pathname = usePathname();
  const section = findActiveSection(pathname);
  if (section.items.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border bg-background">
      <nav
        aria-label={`${section.label} sections`}
        className="flex gap-1 overflow-x-auto px-4 lg:px-8"
      >
        {section.items.map((item) => {
          const active = isItemActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                active
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
