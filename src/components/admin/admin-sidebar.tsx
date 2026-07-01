"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { SITE_NAME } from "@/lib/constants";
import { Menu, X } from "lucide-react";
import { ADMIN_NAV, isSectionActive } from "@/lib/admin/nav";

export function AdminSidebar({ moderationCount = 0 }: { moderationCount?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Toggle navigation"
        className="fixed top-3 left-3 z-50 rounded-md border border-border bg-background p-2 lg:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r border-border bg-card transition-transform lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="border-b border-border px-5 py-5">
          <Link href="/admin" className="text-base font-semibold tracking-tight">
            {SITE_NAME}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">Admin</p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ADMIN_NAV.map((section) => {
            const Icon = section.icon;
            const active = isSectionActive(section, pathname);
            return (
              <Link
                key={section.label}
                href={section.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0" />
                  {section.label}
                </span>
                {section.label === "Moderation" && moderationCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {moderationCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-4">
          <Link
            href="/"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            &larr; Back to site
          </Link>
        </div>
      </aside>
    </>
  );
}
